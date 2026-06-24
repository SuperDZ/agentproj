import { randomUUID } from "node:crypto";
import type { AsyncTask } from "@prisma/client";
import { redisDecrement, redisSetNumber } from "@/lib/cache/redis";
import { asyncTaskLeaseMs, completeTask, enqueueTask, failTask, parseTaskPayload, renewTaskLease } from "@/lib/async-tasks/store";
import { prisma } from "@/lib/db/prisma";
import { logEvent } from "@/lib/observability";
import { buildAgentReviewSnapshot, storeAgentReviewSnapshot } from "@/lib/agents/context-snapshot";
import { agentKeysForMode, getAgentDefinition } from "@/lib/agents/registry";
import { executeAgentRun } from "@/lib/agents/runtime";
import { synthesizeAgentReview } from "@/lib/agents/synthesizer";
import { createAgentReviewSchema, type AgentReviewMode, type AgentTargetType } from "@/lib/agents/schemas";

export const agentReviewParallelTaskType = "agent.review.parallel";
export const agentReviewRunTaskType = "agent.review.run";
export const agentReviewSynthesizeTaskType = "agent.review.synthesize";
const terminalAgentRunStatuses = ["succeeded", "failed", "cancelled"] as const;

type AgentReviewParallelPayload = { reviewId: string; agentKeys: string[] };
type AgentReviewRunPayload = { reviewId: string; agentKey: string; agentRunId?: string };
type AgentReviewSynthesizePayload = { reviewId: string };

function remainingCounterKey(reviewId: string) {
  return `agent-review:${reviewId}:remaining`;
}

function serializeRequest(input: unknown) {
  return createAgentReviewSchema.parse(input ?? {});
}

async function nextReviewRound(projectId: string, targetType: string) {
  const latest = await prisma.agentReview.findFirst({
    where: { projectId, targetType },
    orderBy: { round: "desc" }
  });
  return (latest?.round ?? 0) + 1;
}

export async function createAgentReview(projectId: string, body: unknown) {
  const request = serializeRequest(body);
  const mode = request.mode ?? "default";
  const agentKeys = request.agentKeys?.length ? request.agentKeys : agentKeysForMode(mode);
  agentKeys.forEach(getAgentDefinition);
  await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const active = await prisma.agentReview.findFirst({
    where: {
      projectId,
      targetType: request.targetType,
      status: { in: ["queued", "running", "synthesizing"] }
    },
    orderBy: { createdAt: "desc" }
  });
  if (active && !request.force) return active;

  const round = await nextReviewRound(projectId, request.targetType);
  const { snapshot, targetChecksum } = await buildAgentReviewSnapshot({
    projectId,
    targetType: request.targetType,
    targetArtifactId: request.targetArtifactId
  });
  const review = await prisma.agentReview.create({
    data: {
      projectId,
      targetType: request.targetType,
      targetArtifactId: request.targetArtifactId,
      targetChecksum,
      status: "queued",
      round,
      expectedRunCount: agentKeys.length,
      completedRunCount: 0
    }
  });
  try {
    const snapshotArtifact = await storeAgentReviewSnapshot(review.id, snapshot);
    const updatedReview = await prisma.agentReview.update({
      where: { id: review.id },
      data: { snapshotArtifactId: snapshotArtifact.id }
    });
    await redisSetNumber(remainingCounterKey(review.id), agentKeys.length, 24 * 60 * 60);
    await enqueueTask({
      type: agentReviewParallelTaskType,
      projectId,
      payload: { reviewId: review.id, agentKeys } satisfies AgentReviewParallelPayload,
      priority: 10,
      maxAttempts: 3
    });
    if (request.force) {
      await prisma.agentReview.updateMany({
        where: {
          projectId,
          targetType: request.targetType,
          id: { not: review.id },
          status: { notIn: ["superseded", "cancelled"] }
        },
        data: { status: "superseded", endedAt: new Date() }
      });
    }
    await logEvent({
      source: "agent-review",
      eventType: "agent.review.created",
      message: `Created ${request.targetType} agent review.`,
      projectId,
      metadata: { reviewId: review.id, round, mode, agentKeys }
    });
    return updatedReview;
  } catch (error) {
    await prisma.agentReview.update({
      where: { id: review.id },
      data: { status: "failed", endedAt: new Date() }
    });
    throw error;
  }
}

export async function listAgentReviews(projectId: string) {
  return prisma.agentReview.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      runs: { orderBy: { createdAt: "asc" } },
      consensuses: { orderBy: { createdAt: "desc" }, take: 1 }
    }
  });
}

export async function getAgentReview(projectId: string, reviewId: string) {
  return prisma.agentReview.findFirstOrThrow({
    where: { id: reviewId, projectId },
    include: {
      runs: { orderBy: { createdAt: "asc" } },
      findings: { orderBy: [{ isConsensusFinding: "desc" }, { createdAt: "asc" }] },
      consensuses: {
        orderBy: { createdAt: "desc" },
        include: { findings: { include: { finding: true }, orderBy: { rank: "asc" } } }
      }
    }
  });
}

export async function listAgentReviewFindings(projectId: string, reviewId: string) {
  await prisma.agentReview.findFirstOrThrow({ where: { id: reviewId, projectId } });
  return prisma.agentFinding.findMany({
    where: { reviewId },
    orderBy: [{ isConsensusFinding: "desc" }, { severity: "asc" }, { createdAt: "asc" }]
  });
}

export async function rerunAgentReview(projectId: string, reviewId: string) {
  const review = await getAgentReview(projectId, reviewId);
  await prisma.agentReview.update({ where: { id: review.id }, data: { status: "superseded" } });
  const agentKeys = review.runs
    .filter((run) => run.agentKey !== "synthesizer-agent")
    .map((run) => run.agentKey);
  return createAgentReview(projectId, {
    targetType: review.targetType as AgentTargetType,
    targetArtifactId: review.targetArtifactId ?? undefined,
    agentKeys: agentKeys.length ? [...new Set(agentKeys)] : undefined,
    force: true
  });
}

export async function retryAgentRun(projectId: string, reviewId: string, runId: string) {
  const review = await prisma.agentReview.findFirstOrThrow({ where: { id: reviewId, projectId } });
  if (review.status === "superseded" || review.status === "cancelled") {
    throw new Error("Cannot retry AgentRun for an inactive AgentReview.");
  }
  const run = await prisma.agentRun.findFirstOrThrow({ where: { id: runId, reviewId } });
  if (run.status !== "failed") throw new Error("Only failed AgentRun can be retried.");
  const definition = getAgentDefinition(run.agentKey);
  const newRunId = randomUUID();
  const newRun = await prisma.$transaction(async (tx) => {
    const locked = await tx.agentRun.updateMany({
      where: { id: run.id, status: "failed", supersededByRunId: null },
      data: { supersededByRunId: newRunId }
    });
    if (locked.count === 0) throw new Error("AgentRun has already been retried.");
    const created = await tx.agentRun.create({
      data: {
        id: newRunId,
        projectId,
        reviewId,
        agentKey: run.agentKey,
        role: definition.role,
        status: "queued",
        promptVersion: definition.promptVersion,
        isRetriedRun: true,
        maxRetries: run.maxRetries
      }
    });
    await tx.agentReview.update({
      where: { id: review.id },
      data: {
        status: "running",
        decision: null,
        latestConsensusId: null,
        synthesizeTaskId: null,
        synthesizeStartedAt: null,
        endedAt: null,
        expectedRunCount: { increment: 1 }
      }
    });
    return created;
  });
  await redisSetNumber(remainingCounterKey(review.id), 1, 24 * 60 * 60);
  await enqueueTask({
    type: agentReviewRunTaskType,
    projectId,
    payload: { reviewId, agentKey: run.agentKey, agentRunId: newRun.id } satisfies AgentReviewRunPayload,
    priority: 10,
    maxAttempts: 1
  });
  return newRun;
}

async function dispatchAgentRuns(task: AsyncTask, payload: AgentReviewParallelPayload) {
  const review = await prisma.agentReview.findUniqueOrThrow({ where: { id: payload.reviewId } });
  if (review.status === "superseded" || review.status === "cancelled") return { reviewId: review.id, dispatched: 0 };
  const agentKeys = payload.agentKeys.length ? payload.agentKeys : agentKeysForMode("default" as AgentReviewMode);
  agentKeys.forEach(getAgentDefinition);
  const existingRuns = await prisma.agentRun.findMany({
    where: {
      reviewId: review.id,
      supersededByRunId: null,
      agentKey: { in: agentKeys }
    }
  });
  const existingKeys = new Set(existingRuns.map((run) => run.agentKey));
  const missingAgentKeys = agentKeys.filter((agentKey) => !existingKeys.has(agentKey));
  await prisma.agentReview.update({
    where: { id: review.id },
    data: { status: "running", startedAt: review.startedAt ?? new Date(), expectedRunCount: agentKeys.length }
  });
  const incompleteRuns = existingRuns.filter((run) => !terminalAgentRunStatuses.includes(run.status as never)).length;
  await redisSetNumber(remainingCounterKey(review.id), missingAgentKeys.length + incompleteRuns, 24 * 60 * 60);

  for (const agentKey of missingAgentKeys) {
    const definition = getAgentDefinition(agentKey);
    const run = await prisma.agentRun.create({
      data: {
        projectId: review.projectId,
        reviewId: review.id,
        agentKey,
        role: definition.role,
        status: "queued",
        promptVersion: definition.promptVersion,
        maxRetries: 5
      }
    });
    await enqueueTask({
      type: agentReviewRunTaskType,
      projectId: review.projectId,
      payload: { reviewId: review.id, agentKey, agentRunId: run.id } satisfies AgentReviewRunPayload,
      priority: task.priority,
      maxAttempts: 1
    });
  }
  return { reviewId: review.id, dispatched: missingAgentKeys.length, skippedExisting: existingKeys.size, incompleteExistingRuns: incompleteRuns };
}

async function maybeTriggerSynthesize(reviewId: string, input?: { decrementRedis?: boolean }) {
  if (input?.decrementRedis !== false) {
    await redisDecrement(remainingCounterKey(reviewId));
  }

  const review = await prisma.agentReview.findUniqueOrThrow({
    where: { id: reviewId },
    include: { runs: { where: { supersededByRunId: null } } }
  });
  const unfinished = review.runs.filter((run) => !terminalAgentRunStatuses.includes(run.status as never));
  if (unfinished.length > 0) return null;

  const taskId = randomUUID();
  const locked = await prisma.agentReview.updateMany({
    where: {
      id: reviewId,
      synthesizeTaskId: null,
      status: { in: ["running", "needs_revision", "blocked", "passed", "failed"] }
    },
    data: {
      status: "synthesizing",
      synthesizeTaskId: taskId,
      synthesizeStartedAt: new Date()
    }
  });
  if (locked.count === 0) return null;

  const task = await enqueueTask({
    id: taskId,
    type: agentReviewSynthesizeTaskType,
    projectId: review.projectId,
    payload: { reviewId } satisfies AgentReviewSynthesizePayload,
    priority: 20,
    maxAttempts: 3
  });
  return task;
}

export function isAgentReviewTask(type: string) {
  return type === agentReviewParallelTaskType || type === agentReviewRunTaskType || type === agentReviewSynthesizeTaskType;
}

export async function processAgentReviewTask(task: AsyncTask) {
  const stopLeaseRenewal = startAgentTaskLeaseRenewal(task);
  try {
    if (task.type === agentReviewParallelTaskType) {
      const payload = parseTaskPayload<AgentReviewParallelPayload>(task, { reviewId: "", agentKeys: [] });
      const result = await dispatchAgentRuns(task, payload);
      if (result.dispatched === 0 && result.incompleteExistingRuns === 0) {
        await maybeTriggerSynthesize(payload.reviewId, { decrementRedis: false });
      }
      await completeTask(task, result);
      return { processed: true, action: "succeeded" as const, taskId: task.id, status: "succeeded" };
    }

    if (task.type === agentReviewRunTaskType) {
      const payload = parseTaskPayload<AgentReviewRunPayload>(task, { reviewId: "", agentKey: "" });
      const result = await executeAgentRun({ task, reviewId: payload.reviewId, agentKey: payload.agentKey, agentRunId: payload.agentRunId });
      if (result.status === "lost_lease") {
        return { processed: false, action: "idle" as const, taskId: task.id, status: "lost_lease" };
      }
      if (result.status === "succeeded" || result.status === "failed") {
        await maybeTriggerSynthesize(payload.reviewId);
      }
      await completeTask(task, result);
      return { processed: true, action: result.status === "succeeded" ? "succeeded" as const : "failed" as const, taskId: task.id, status: result.status };
    }

    if (task.type === agentReviewSynthesizeTaskType) {
      const payload = parseTaskPayload<AgentReviewSynthesizePayload>(task, { reviewId: "" });
      const result = await synthesizeAgentReview(task, payload.reviewId);
      if (result.status === "lost_lease") {
        return { processed: false, action: "idle" as const, taskId: task.id, status: "lost_lease" };
      }
      await completeTask(task, result);
      return { processed: true, action: "succeeded" as const, taskId: task.id, status: "decision" in result ? result.decision : result.status };
    }

    throw new Error(`Unsupported agent review task type: ${task.type}`);
  } catch (error) {
    await failTask(task, error);
    return { processed: true, action: "failed" as const, taskId: task.id, status: "failed" };
  } finally {
    stopLeaseRenewal();
  }
}

function startAgentTaskLeaseRenewal(task: AsyncTask) {
  const intervalMs = Math.max(1000, Math.min(Math.floor(asyncTaskLeaseMs() / 2), 30_000));
  const timer = setInterval(() => {
    void renewTaskLease(task);
  }, intervalMs);
  return () => clearInterval(timer);
}

export async function latestBlockingReview(projectId: string, targetTypes: string[]) {
  try {
    for (const targetType of targetTypes) {
      const latest = await prisma.agentReview.findFirst({
        where: {
          projectId,
          targetType,
          status: { notIn: ["superseded", "cancelled"] }
        },
        orderBy: [{ round: "desc" }, { createdAt: "desc" }]
      });
      if (latest?.decision === "blocked") return latest;
    }
    return null;
  } catch (error) {
    if (isMissingAgentReviewSchema(error)) return null;
    throw error;
  }
}

function isMissingAgentReviewSchema(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "P2021" || code === "P2022") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /AgentReview|AgentRun|AgentConsensus|does not exist|not exist in the current database/i.test(message);
}
