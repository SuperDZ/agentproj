import type { AsyncTask } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { putArtifact } from "@/lib/artifacts/store";
import { ownsTaskLease } from "@/lib/async-tasks/store";
import { prisma } from "@/lib/db/prisma";
import { generateJsonWithModel } from "@/lib/model/client";
import { finishSpan, logEvent, startSpan } from "@/lib/observability";
import { hydrateAgentContext, loadAgentReviewSnapshot } from "@/lib/agents/context-snapshot";
import { getAgentDefinition } from "@/lib/agents/registry";
import { agentOutputSchema, type AgentFindingInput, type AgentOutput } from "@/lib/agents/schemas";

const severityLimits: Record<string, number> = {
  critical: 1,
  high: 2,
  medium: 5
};
const terminalAgentRunStatuses = ["succeeded", "failed", "cancelled"] as const;

function normalizeDedupeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "finding";
}

function capFindings(findings: AgentFindingInput[]) {
  const counts: Record<string, number> = {};
  return findings.map((finding) => {
    const severity = finding.severity;
    counts[severity] = (counts[severity] ?? 0) + 1;
    if (severity in severityLimits && counts[severity] > severityLimits[severity]) {
      return { ...finding, severity: severity === "critical" || severity === "high" ? "medium" : "low" };
    }
    return finding;
  });
}

function fallbackOutput(agentKey: string): AgentOutput {
  return {
    summary: `${agentKey} completed without model-generated findings.`,
    decisionSuggestion: "pass",
    findings: []
  };
}

function transientErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b(429|502|503|504|ECONNRESET|ETIMEDOUT)\b/i.test(message)) return "transient";
  return null;
}

function retryDelayMs(retryCount: number) {
  return [1000, 2000, 4000, 8000, 16_000][Math.min(retryCount, 4)];
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function reviewIsInactive(reviewId: string) {
  const review = await prisma.agentReview.findUnique({
    where: { id: reviewId },
    select: { status: true }
  });
  return !review || review.status === "superseded" || review.status === "cancelled";
}

async function generateAgentOutput(input: {
  agentKey: string;
  systemPrompt: string;
  userPrompt: string;
  projectId: string;
  traceId: string;
}) {
  const fallback = fallbackOutput(input.agentKey);
  const generated = await generateJsonWithModel<AgentOutput>({
    system: input.systemPrompt,
    user: input.userPrompt,
    fallback,
    projectId: input.projectId,
    traceId: input.traceId
  });
  return agentOutputSchema.parse(generated);
}

export async function executeAgentRun(input: {
  task: AsyncTask;
  reviewId: string;
  agentKey: string;
  agentRunId?: string;
}) {
  const review = await prisma.agentReview.findUniqueOrThrow({ where: { id: input.reviewId } });
  const definition = getAgentDefinition(input.agentKey);
  if (review.status === "superseded" || review.status === "cancelled") {
    if (input.agentRunId) {
      await prisma.agentRun.updateMany({
        where: { id: input.agentRunId, status: { notIn: [...terminalAgentRunStatuses] } },
        data: { status: "cancelled", endedAt: new Date() }
      });
    }
    return { reviewId: review.id, agentRunId: input.agentRunId, status: "cancelled" };
  }
  if (!review.snapshotArtifactId) throw new Error("AgentReview snapshot is missing.");

  const startedAt = new Date();
  const traceId = randomUUID();
  let run = input.agentRunId
    ? await prisma.agentRun.findUniqueOrThrow({ where: { id: input.agentRunId } })
    : await prisma.agentRun.create({
      data: {
        projectId: review.projectId,
        reviewId: review.id,
        taskId: input.task.id,
        agentKey: definition.key,
        role: definition.role,
        status: "queued",
        promptVersion: definition.promptVersion,
        maxRetries: 5
      }
    });
  if (terminalAgentRunStatuses.includes(run.status as never)) {
    return { reviewId: review.id, agentRunId: run.id, status: run.status, alreadyCompleted: true };
  }

  const started = await prisma.agentRun.updateMany({
    where: { id: run.id, status: { notIn: [...terminalAgentRunStatuses] } },
    data: {
      taskId: input.task.id,
      status: "running",
      startedAt,
      traceId,
      promptVersion: definition.promptVersion
    }
  });
  if (started.count === 0) {
    const currentRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    return { reviewId: review.id, agentRunId: currentRun.id, status: currentRun.status, alreadyCompleted: true };
  }
  run = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });

  const span = await startSpan({
    name: "agent.review.run",
    traceId,
    projectId: review.projectId,
    taskId: input.task.id,
    attributes: { reviewId: review.id, agentRunId: run.id, agentKey: definition.key }
  });

  try {
    const snapshot = await loadAgentReviewSnapshot(review.snapshotArtifactId);
    const hydrated = hydrateAgentContext(snapshot, definition.contextKeys);
    const userPrompt = JSON.stringify({
      agentKey: definition.key,
      role: definition.role,
      context: hydrated,
      outputSchema: {
        summary: "string",
        decisionSuggestion: "pass | needs_revision | blocked",
        findings: [{
          severity: "info | low | medium | high | critical",
          category: "research | product | architecture | engineering | qa | release | security | cost | data_integrity | presentation",
          title: "string",
          description: "string",
          evidence: [{ sourceType: "string", sourceId: "string", quote: "string" }],
          recommendation: "string",
          confidence: 0.0,
          dedupeKey: "stable lowercase key"
        }]
      },
      constraints: {
        criticalMax: 1,
        highMax: 2,
        mediumMax: 5,
        noMarkdown: true
      }
    }, null, 2);

    let output: AgentOutput | null = null;
    let retryCount = 0;
    while (!output) {
      try {
        output = await generateAgentOutput({
          agentKey: definition.key,
          systemPrompt: definition.systemPrompt,
          userPrompt,
          projectId: review.projectId,
          traceId
        });
      } catch (error) {
        const code = transientErrorCode(error);
        if (!code || retryCount >= run.maxRetries) throw error;
        retryCount += 1;
        await prisma.agentRun.update({
          where: { id: run.id },
          data: { retryCount, lastErrorCode: code, lastErrorMessage: error instanceof Error ? error.message : String(error) }
        });
        await sleep(retryDelayMs(retryCount - 1));
      }
    }

    const normalizedFindings = capFindings(output.findings).map((finding) => ({
      ...finding,
      dedupeKey: normalizeDedupeKey(finding.dedupeKey || `${finding.category}-${finding.title}`)
    }));
    if (await reviewIsInactive(review.id)) {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "inactive_review_before_persist" } });
      return { reviewId: review.id, agentRunId: run.id, status: "cancelled" };
    }
    if (!await ownsTaskLease(input.task.id)) {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "lost_task_lease" } });
      return { reviewId: review.id, agentRunId: run.id, status: "lost_lease" };
    }
    const storedOutput = await putArtifact({
      projectId: review.projectId,
      artifactType: "agent-run-output",
      filename: `agent-run-${run.id}.json`,
      content: JSON.stringify({ ...output, findings: normalizedFindings }, null, 2),
      mimeType: "application/json;charset=utf-8"
    });
    if (await reviewIsInactive(review.id)) {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "inactive_review_after_artifact" } });
      return { reviewId: review.id, agentRunId: run.id, status: "cancelled" };
    }

    const persisted = await prisma.$transaction(async (tx) => {
      const transitioned = await tx.agentRun.updateMany({
        where: { id: run.id, status: { notIn: [...terminalAgentRunStatuses] } },
        data: {
          status: "succeeded",
          outputJson: output,
          outputArtifactId: storedOutput.id,
          endedAt: new Date(),
          durationMs: Math.max(0, Date.now() - startedAt.getTime())
        }
      });
      if (transitioned.count === 0) return false;
      await tx.agentFinding.deleteMany({ where: { agentRunId: run.id, isConsensusFinding: false } });
      for (const finding of normalizedFindings) {
        await tx.agentFinding.create({
          data: {
            projectId: review.projectId,
            reviewId: review.id,
            agentRunId: run.id,
            severity: finding.severity,
            category: finding.category,
            title: finding.title,
            description: finding.description,
            evidenceJson: finding.evidence,
            recommendation: finding.recommendation,
            confidence: finding.confidence,
            dedupeKey: finding.dedupeKey,
            isConsensusFinding: false
          }
        });
      }
      await tx.agentReview.update({
        where: { id: review.id },
        data: { completedRunCount: { increment: 1 } }
      });
      return true;
    });
    if (!persisted) {
      const currentRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
      await finishSpan(span, { status: "cancelled", attributes: { reason: "agent_run_already_terminal", status: currentRun.status } });
      return { reviewId: review.id, agentRunId: run.id, status: currentRun.status, alreadyCompleted: true };
    }

    await logEvent({
      source: "agent-review",
      eventType: "agent.review.agent_succeeded",
      message: `${definition.key} completed.`,
      projectId: review.projectId,
      taskId: input.task.id,
      traceId,
      metadata: { reviewId: review.id, agentRunId: run.id, findingCount: normalizedFindings.length }
    });
    await finishSpan(span, { status: "ok", attributes: { findingCount: normalizedFindings.length } });
    return { reviewId: review.id, agentRunId: run.id, status: "succeeded" };
  } catch (error) {
    if (await reviewIsInactive(review.id)) {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "inactive_review_after_error" } });
      return { reviewId: review.id, agentRunId: run.id, status: "cancelled" };
    }
    if (!await ownsTaskLease(input.task.id)) {
      await finishSpan(span, { status: "cancelled", attributes: { reason: "lost_task_lease_after_error" } });
      return { reviewId: review.id, agentRunId: run.id, status: "lost_lease" };
    }
    const errorCode = error instanceof ZodError ? "schema_validation_failed" : transientErrorCode(error) ?? "agent_run_failed";
    const message = error instanceof Error ? error.message : String(error);
    const persisted = await prisma.$transaction(async (tx) => {
      const transitioned = await tx.agentRun.updateMany({
        where: { id: run.id, status: { notIn: [...terminalAgentRunStatuses] } },
        data: {
          status: "failed",
          errorCode,
          errorMessage: message,
          lastErrorCode: errorCode,
          lastErrorMessage: message,
          endedAt: new Date(),
          durationMs: Math.max(0, Date.now() - startedAt.getTime())
        }
      });
      if (transitioned.count === 0) return false;
      await tx.agentReview.update({
        where: { id: review.id },
        data: { completedRunCount: { increment: 1 } }
      });
      return true;
    });
    if (!persisted) {
      const currentRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
      await finishSpan(span, { status: "cancelled", attributes: { reason: "agent_run_already_terminal", status: currentRun.status } });
      return { reviewId: review.id, agentRunId: run.id, status: currentRun.status, alreadyCompleted: true };
    }
    await logEvent({
      level: "error",
      source: "agent-review",
      eventType: "agent.review.agent_failed",
      message,
      projectId: review.projectId,
      taskId: input.task.id,
      traceId,
      metadata: { reviewId: review.id, agentRunId: run.id, agentKey: definition.key, errorCode }
    });
    await finishSpan(span, { status: "error", attributes: { error: message, errorCode } });
    return { reviewId: review.id, agentRunId: run.id, status: "failed" };
  }
}
