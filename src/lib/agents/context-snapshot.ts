import { createHash } from "node:crypto";
import type { StoredArtifact } from "@prisma/client";
import { getArtifactDownload, putArtifact } from "@/lib/artifacts/store";
import { prisma } from "@/lib/db/prisma";
import type { AgentContextKey, AgentReviewSnapshot, AgentTargetType } from "@/lib/agents/schemas";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function truncate(value: string, max = 6000) {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
}

async function resolveTargetArtifact(targetArtifactId?: string) {
  if (!targetArtifactId) return {};

  const generated = await prisma.generatedArtifact.findUnique({ where: { id: targetArtifactId } });
  if (generated) {
    return {
      targetArtifactId,
      targetChecksum: sha256(generated.content),
      targetContent: generated.content
    };
  }

  const stored = await prisma.storedArtifact.findUnique({ where: { id: targetArtifactId } });
  if (!stored) throw new Error("Target artifact not found.");
  const download = await getArtifactDownload(stored.id);
  return {
    targetArtifactId,
    targetChecksum: stored.checksumSha256,
    targetContent: download.data.toString("utf8")
  };
}

export async function buildAgentReviewSnapshot(input: {
  projectId: string;
  targetType: AgentTargetType;
  targetArtifactId?: string;
}): Promise<{ snapshot: AgentReviewSnapshot; targetChecksum?: string }> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: input.projectId },
    include: {
      researchRuns: { orderBy: { createdAt: "desc" } },
      competitors: { orderBy: { createdAt: "desc" } },
      evaluations: { orderBy: { createdAt: "desc" } },
      artifacts: { orderBy: { createdAt: "desc" } },
      storedArtifacts: { orderBy: { createdAt: "desc" } }
    }
  });
  const target = await resolveTargetArtifact(input.targetArtifactId);
  const latestResearch = project.researchRuns[0];
  const latestEvaluation = project.evaluations[0];
  const latestPrd = project.artifacts.find((artifact) => artifact.artifactType === "prd");
  const latestTechStack = project.artifacts.find((artifact) => artifact.artifactType === "tech_stack_recommendations");
  const artifactsByType = new Map<string, typeof project.artifacts[number]>();
  project.artifacts.forEach((artifact) => {
    if (!artifactsByType.has(artifact.artifactType)) artifactsByType.set(artifact.artifactType, artifact);
  });

  const research = latestResearch?.parsedOutputJson
    ? parseJson<Record<string, unknown>>(latestResearch.parsedOutputJson, {})
    : {};
  const evaluation = latestEvaluation
    ? {
      decision: latestEvaluation.decision,
      pdrs: latestEvaluation.pdrs,
      risks: parseJson(latestEvaluation.risksJson, []),
      nextActions: parseJson(latestEvaluation.nextActionsJson, []),
      scoreReasons: parseJson(latestEvaluation.scoreReasonsJson, {})
    }
    : {};

  const snapshot: AgentReviewSnapshot = {
    projectId: project.id,
    targetType: input.targetType,
    targetArtifactId: target.targetArtifactId,
    targetChecksum: target.targetChecksum,
    projectSummary: truncate([
      `Name: ${project.name}`,
      `Idea: ${project.idea}`,
      `Industry: ${project.industry}`,
      `Target user: ${project.targetUser}`,
      `Preferred tech stack: ${project.preferredTechStack || "not specified"}`,
      `Financial suitability check: ${project.needFinancialSuitabilityCheck}`,
      `Continuous competitor monitoring: ${project.needContinuousCompetitorMonitoring}`
    ].join("\n")),
    researchSummary: truncate(JSON.stringify({
      latestRunStatus: latestResearch?.status,
      latestRunCompletedAt: latestResearch?.completedAt,
      parsedResearch: research
    }, null, 2)),
    prdSummary: truncate(target.targetContent || latestPrd?.content || ""),
    techStackSummary: truncate(latestTechStack?.content || project.preferredTechStack || ""),
    competitorSummary: truncate(JSON.stringify(project.competitors.map((competitor) => ({
      name: competitor.name,
      type: competitor.type,
      url: competitor.url,
      description: competitor.description,
      threatLevel: competitor.threatLevel,
      reuseStrategy: competitor.reuseStrategy
    })), null, 2)),
    evaluationSummary: truncate(JSON.stringify(evaluation, null, 2)),
    artifactManifest: Array.from(artifactsByType.values()).map((artifact) => ({
      id: artifact.id,
      artifactType: artifact.artifactType,
      createdAt: artifact.createdAt.toISOString(),
      size: artifact.content.length
    })),
    environmentSummary: truncate(JSON.stringify({
      nodeEnv: process.env.NODE_ENV || "development",
      hasRedisUrl: Boolean(process.env.REDIS_URL),
      hasArtifactStorageDir: Boolean(process.env.ARTIFACT_STORAGE_DIR),
      modelProvider: process.env.HERMES_INFERENCE_PROVIDER || "deepseek"
    }, null, 2)),
    createdAt: new Date().toISOString(),
    schemaVersion: "1.0"
  };

  return { snapshot, targetChecksum: target.targetChecksum };
}

export async function storeAgentReviewSnapshot(reviewId: string, snapshot: AgentReviewSnapshot): Promise<StoredArtifact> {
  return putArtifact({
    projectId: snapshot.projectId,
    artifactType: "agent-review-context",
    filename: `agent-review-context-${reviewId}.json`,
    content: JSON.stringify(snapshot, null, 2),
    mimeType: "application/json;charset=utf-8"
  });
}

export async function loadAgentReviewSnapshot(snapshotArtifactId: string): Promise<AgentReviewSnapshot> {
  const download = await getArtifactDownload(snapshotArtifactId);
  return JSON.parse(download.data.toString("utf8")) as AgentReviewSnapshot;
}

export function hydrateAgentContext(snapshot: AgentReviewSnapshot, keys: AgentContextKey[]) {
  return Object.fromEntries(keys.map((key) => [key, snapshot[key]]));
}
