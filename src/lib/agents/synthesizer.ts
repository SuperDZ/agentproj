import type { AsyncTask } from "@prisma/client";
import { putArtifact } from "@/lib/artifacts/store";
import { ownsTaskLease } from "@/lib/async-tasks/store";
import { prisma } from "@/lib/db/prisma";
import { generateJsonWithModel } from "@/lib/model/client";
import { finishSpan, logEvent, startSpan } from "@/lib/observability";
import { evaluateGatePolicy, maxDecision } from "@/lib/agents/gate-policy";
import { agentOutputSchema, type AgentDecision, type AgentFindingInput } from "@/lib/agents/schemas";
import { normalizeAgentOutputForReview } from "@/lib/agents/runtime";

function normalizeDedupeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "finding";
}

function severityRank(severity: string) {
  return { info: 0, low: 1, medium: 2, high: 3, critical: 4 }[severity] ?? 0;
}

function decisionFromSuggestion(value: unknown): AgentDecision {
  return value === "blocked" || value === "needs_revision" || value === "pass" ? value : "pass";
}

async function reviewIsInactive(reviewId: string) {
  const review = await prisma.agentReview.findUnique({
    where: { id: reviewId },
    select: { status: true }
  });
  return !review || review.status === "superseded" || review.status === "cancelled";
}

function mergeRawFindings(rawFindings: Array<{
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  evidenceJson: unknown;
  recommendation: string | null;
  confidence: number | null;
  status: string;
  dedupeKey: string;
}>) {
  const grouped = new Map<string, typeof rawFindings>();
  rawFindings.forEach((finding) => {
    const key = normalizeDedupeKey(finding.dedupeKey || `${finding.category}-${finding.title}`);
    grouped.set(key, [...(grouped.get(key) ?? []), finding]);
  });

  return Array.from(grouped.entries()).map(([dedupeKey, items]) => {
    const strongest = [...items].sort((left, right) => severityRank(right.severity) - severityRank(left.severity))[0];
    const confidence = Math.min(1, Math.max(...items.map((item) => item.confidence ?? 0.5)) + (items.length - 1) * 0.1);
    return {
      sourceFindingIds: items.map((item) => item.id),
      severity: strongest.severity,
      category: strongest.category,
      title: strongest.title,
      description: strongest.description,
      evidenceJson: items.flatMap((item) => Array.isArray(item.evidenceJson) ? item.evidenceJson : []),
      recommendation: strongest.recommendation,
      confidence,
      status: items.some((item) => item.status === "open") ? "open" : "resolved",
      dedupeKey
    };
  });
}

function consensusMarkdown(input: {
  decision: AgentDecision;
  ruleDecision: AgentDecision;
  llmDecision: AgentDecision;
  summary: string;
  conflictAndTradeoffs: string;
  findings: Array<{ severity: string; title: string; category: string; recommendation: string | null }>;
}) {
  const findings = input.findings
    .slice(0, 12)
    .map((finding, index) => `${index + 1}. [${finding.severity}/${finding.category}] ${finding.title}\n   Recommendation: ${finding.recommendation || "Not specified."}`)
    .join("\n");
  return [
    "# Agent Review Consensus",
    "",
    "## Executive Summary",
    input.summary,
    "",
    "## Consensus Decision",
    `Final decision: ${input.decision}`,
    `Rule decision: ${input.ruleDecision}`,
    `Synthesizer suggested decision: ${input.llmDecision}`,
    "",
    "## Top Findings",
    findings || "No blocking findings.",
    "",
    "## Conflict & Tradeoffs",
    input.conflictAndTradeoffs || "No explicit cross-agent conflict was detected.",
    "",
    "## Recommended Next Actions",
    input.findings.length ? "Address high-severity findings first, then rerun the affected Agent or the full review." : "Proceed with the next workflow stage."
  ].join("\n");
}

export async function synthesizeAgentReview(task: AsyncTask, reviewId: string) {
  const review = await prisma.agentReview.findUniqueOrThrow({
    where: { id: reviewId },
    include: {
      runs: { where: { supersededByRunId: null }, orderBy: { createdAt: "asc" } },
      findings: { where: { isConsensusFinding: false }, orderBy: { createdAt: "asc" } }
    }
  });
  const span = await startSpan({
    name: "agent.review.synthesize",
    projectId: review.projectId,
    taskId: task.id,
    attributes: { reviewId }
  });

  try {
    if (review.status === "superseded" || review.status === "cancelled") {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "inactive_review", status: review.status } });
      return { reviewId, status: "cancelled" as const };
    }
    if (!await ownsTaskLease(task.id)) {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "lost_task_lease" } });
      return { reviewId, status: "lost_lease" as const };
    }

    const merged = mergeRawFindings(review.findings);
    const rule = evaluateGatePolicy({
      targetType: review.targetType,
      consensusFindings: merged,
      agentRuns: review.runs.map((run) => ({ agentKey: run.agentKey, status: run.status }))
    });
    const fallback = {
      summary: rule.reasons.length ? rule.reasons.join(" ") : "No blocking consensus findings were detected.",
      decisionSuggestion: rule.decision,
      findings: [] as AgentFindingInput[]
    };
    const generated = await generateJsonWithModel({
      system: [
        "You are the synthesizer-agent.",
        "Summarize multi-agent review results and explicitly describe Conflict & Tradeoffs.",
        "Return JSON only. Do not downgrade deterministic rule severity."
      ].join("\n"),
      user: JSON.stringify({
        targetType: review.targetType,
        rule,
        agentRuns: review.runs.map((run) => ({ agentKey: run.agentKey, status: run.status, outputJson: run.outputJson })),
        consensusFindings: merged.map((finding) => ({
          severity: finding.severity,
          category: finding.category,
          title: finding.title,
          description: finding.description,
          recommendation: finding.recommendation
        })),
        requiredSections: ["Executive Summary", "Consensus Decision", "Top Findings", "Conflict & Tradeoffs", "Recommended Next Actions"]
      }, null, 2),
      fallback,
      projectId: review.projectId
    });
    const suggested = agentOutputSchema.parse(normalizeAgentOutputForReview(generated, "synthesizer-agent", fallback));
    if (await reviewIsInactive(reviewId)) {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "inactive_review_after_model" } });
      return { reviewId, status: "cancelled" as const };
    }
    if (!await ownsTaskLease(task.id)) {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "lost_task_lease_after_model" } });
      return { reviewId, status: "lost_lease" as const };
    }

    const llmDecision = decisionFromSuggestion(suggested.decisionSuggestion);
    const finalDecision = maxDecision(rule.decision, llmDecision);
    const summary = suggested.summary || fallback.summary;
    const conflictAndTradeoffs = /conflict|tradeoff|冲突|权衡/i.test(summary)
      ? summary
      : "No explicit conflict was detected. If product schedule conflicts with architecture, security, or data-integrity findings, technical risk takes precedence.";
    const markdown = consensusMarkdown({
      decision: finalDecision,
      ruleDecision: rule.decision,
      llmDecision,
      summary,
      conflictAndTradeoffs,
      findings: merged
    });
    const artifact = await putArtifact({
      projectId: review.projectId,
      artifactType: "agent-consensus",
      filename: `agent-consensus-${review.id}.md`,
      content: markdown,
      mimeType: "text/markdown;charset=utf-8"
    });
    if (!await ownsTaskLease(task.id)) {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "lost_task_lease_after_artifact" } });
      return { reviewId, status: "lost_lease" as const };
    }
    if (await reviewIsInactive(reviewId)) {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "inactive_review_before_persist" } });
      return { reviewId, status: "cancelled" as const };
    }

    const { consensus, consensusFindings } = await prisma.$transaction(async (tx) => {
      await tx.agentFinding.updateMany({
        where: { reviewId, isConsensusFinding: true },
        data: { status: "superseded" }
      });
      const createdFindings = [];
      for (const finding of merged) {
        createdFindings.push(await tx.agentFinding.create({
          data: {
            projectId: review.projectId,
            reviewId,
            agentRunId: null,
            severity: finding.severity,
            category: finding.category,
            title: finding.title,
            description: finding.description,
            evidenceJson: finding.evidenceJson,
            recommendation: finding.recommendation,
            confidence: finding.confidence,
            status: finding.status,
            dedupeKey: finding.dedupeKey,
            isConsensusFinding: true
          }
        }));
      }
      const createdConsensus = await tx.agentConsensus.create({
        data: {
          projectId: review.projectId,
          reviewId,
          taskId: task.id,
          decision: finalDecision,
          summary,
          outputArtifactId: artifact.id,
          ruleResultJson: rule
        }
      });
      for (const [index, finding] of createdFindings.entries()) {
        await tx.agentConsensusFinding.create({
          data: {
            consensusId: createdConsensus.id,
            findingId: finding.id,
            rank: index + 1
          }
        });
      }
      await tx.agentReview.update({
        where: { id: review.id },
        data: {
          status: finalDecision === "pass" ? "passed" : finalDecision,
          decision: finalDecision,
          latestConsensusId: createdConsensus.id,
          endedAt: new Date()
        }
      });
      return { consensus: createdConsensus, consensusFindings: createdFindings };
    });
    await logEvent({
      source: "agent-review",
      eventType: finalDecision === "blocked" ? "agent.review.blocked" : "agent.review.completed",
      message: `Agent review synthesized with decision ${finalDecision}.`,
      projectId: review.projectId,
      taskId: task.id,
      metadata: { reviewId, consensusId: consensus.id, rule }
    });
    await finishSpan(span, { status: "ok", attributes: { decision: finalDecision, findingCount: consensusFindings.length } });
    return { reviewId, consensusId: consensus.id, decision: finalDecision };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (await reviewIsInactive(reviewId)) {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "inactive_review_after_error" } });
      return { reviewId, status: "cancelled" as const };
    }
    if (!await ownsTaskLease(task.id)) {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "lost_task_lease_after_error" } });
      return { reviewId, status: "lost_lease" as const };
    }
    await prisma.agentReview.update({ where: { id: reviewId }, data: { status: "failed", endedAt: new Date() } });
    await finishSpan(span, { status: "error", attributes: { error: message } });
    throw error;
  }
}
