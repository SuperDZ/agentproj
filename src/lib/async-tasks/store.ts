import os from "node:os";
import { randomUUID } from "node:crypto";
import type { AsyncTask } from "@prisma/client";
import { publishTaskNotification } from "@/lib/cache/redis";
import { prisma } from "@/lib/db/prisma";
import { logEvent, recordMetric } from "@/lib/observability";

export const researchTaskType = "research.run";
export const terminalTaskStatuses = ["succeeded", "failed", "dead", "cancelled"] as const;
export const activeTaskStatuses = ["queued", "running", "waiting"] as const;

export type AsyncTaskProcessResult = {
  processed: boolean;
  action: "idle" | "claimed" | "waited" | "succeeded" | "failed" | "dead";
  taskId?: string;
  status?: string;
  runId?: string;
};

export function workerId() {
  const existing = process.env.SPECFLOW_WORKER_ID;
  if (existing) return existing;
  const id = `${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  process.env.SPECFLOW_WORKER_ID = id;
  return id;
}

export function asyncTaskLeaseMs() {
  const value = Number(process.env.ASYNC_TASK_LOCK_TTL_MS ?? 120_000);
  return Number.isFinite(value) && value > 0 ? value : 120_000;
}

export function asyncWorkerPollIntervalMs() {
  const value = Number(process.env.HERMES_RESEARCH_WORKER_POLL_MS ?? 5000);
  return Number.isFinite(value) && value > 0 ? value : 5000;
}

export function asyncTaskRetryDelayMs(attemptCount: number) {
  const delays = [30_000, 120_000, 600_000];
  return delays[Math.min(Math.max(0, attemptCount), delays.length - 1)];
}

function taskPayload(payload: unknown) {
  try {
    return JSON.stringify(payload ?? {});
  } catch {
    return "{}";
  }
}

export function parseTaskPayload<T>(task: Pick<AsyncTask, "payloadJson">, fallback: T): T {
  try {
    return JSON.parse(task.payloadJson) as T;
  } catch {
    return fallback;
  }
}

export async function enqueueTask(input: {
  id?: string;
  type: string;
  projectId?: string;
  payload: unknown;
  priority?: number;
  maxAttempts?: number;
}) {
  const task = await prisma.asyncTask.create({
    data: {
      id: input.id,
      type: input.type,
      projectId: input.projectId,
      payloadJson: taskPayload(input.payload),
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 3,
      status: "queued"
    }
  });
  await publishTaskNotification(input.type);
  await logEvent({
    source: "async-task",
    eventType: "task.enqueued",
    message: `Queued task ${input.type}.`,
    projectId: input.projectId,
    taskId: task.id,
    metadata: { priority: task.priority, maxAttempts: task.maxAttempts }
  });
  return task;
}

export async function findActiveTask(projectId: string, type: string) {
  return prisma.asyncTask.findFirst({
    where: { projectId, type, status: { in: [...activeTaskStatuses] } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
  });
}

export async function heartbeat(status = "running", metadata: unknown = {}) {
  const id = workerId();
  return prisma.workerHeartbeat.upsert({
    where: { workerId: id },
    create: {
      workerId: id,
      hostname: os.hostname(),
      pid: process.pid,
      status,
      metadataJson: taskPayload(metadata)
    },
    update: {
      status,
      lastSeenAt: new Date(),
      metadataJson: taskPayload(metadata)
    }
  });
}

export async function claimTask(taskId?: string) {
  const now = new Date();
  const worker = workerId();
  const lockExpiresAt = new Date(now.getTime() + asyncTaskLeaseMs());
  const claimableWhere = {
    ...(taskId ? { id: taskId } : {}),
    OR: [
      { status: { in: ["queued", "waiting"] }, runAfter: { lte: now } },
      { status: "running", lockExpiresAt: { lte: now } }
    ]
  };

  const candidate = taskId
    ? await prisma.asyncTask.findFirst({
      where: claimableWhere
    })
    : await prisma.asyncTask.findFirst({
      where: claimableWhere,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
    });
  if (!candidate) return null;

  const claimed = await prisma.asyncTask.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { status: { in: ["queued", "waiting"] }, runAfter: { lte: now } },
        { status: "running", lockExpiresAt: { lte: now } }
      ]
    },
    data: {
      status: "running",
      lockedBy: worker,
      lockExpiresAt
    }
  });
  if (claimed.count === 0) return null;

  const task = await prisma.asyncTask.findUniqueOrThrow({ where: { id: candidate.id } });
  await expireOpenAttempts(task.id);
  await prisma.asyncTaskAttempt.create({
    data: {
      taskId: task.id,
      workerId: worker,
      status: "running",
      metadataJson: taskPayload({ lockExpiresAt })
    }
  });
  await logEvent({
    source: "async-task",
    eventType: "task.claimed",
    message: `Claimed task ${task.type}.`,
    projectId: task.projectId ?? undefined,
    taskId: task.id,
    metadata: { workerId: worker }
  });
  return task;
}

export async function renewTaskLease(task: AsyncTask) {
  const worker = workerId();
  const lockExpiresAt = new Date(Date.now() + asyncTaskLeaseMs());
  const renewed = await prisma.asyncTask.updateMany({
    where: {
      id: task.id,
      status: "running",
      lockedBy: worker
    },
    data: { lockExpiresAt }
  });
  return renewed.count === 1;
}

export async function ownsTaskLease(taskId: string) {
  const task = await prisma.asyncTask.findFirst({
    where: {
      id: taskId,
      status: "running",
      lockedBy: workerId(),
      lockExpiresAt: { gt: new Date() }
    }
  });
  return Boolean(task);
}

export async function markTaskWaiting(task: AsyncTask, input: { runAfter?: Date; result?: unknown; message?: string }) {
  const runAfter = input.runAfter ?? new Date(Date.now() + asyncWorkerPollIntervalMs());
  const worker = workerId();
  const updated = await prisma.asyncTask.updateMany({
    where: { id: task.id, status: "running", lockedBy: worker },
    data: {
      status: "waiting",
      resultJson: input.result ? taskPayload(input.result) : task.resultJson,
      lockedBy: null,
      lockExpiresAt: null,
      runAfter
    }
  });
  if (updated.count === 0) return prisma.asyncTask.findUniqueOrThrow({ where: { id: task.id } });

  await completeLatestAttempt(task.id, "waiting", undefined, worker);
  await logEvent({
    source: "async-task",
    eventType: "task.waiting",
    message: input.message || `Task ${task.type} is waiting.`,
    projectId: task.projectId ?? undefined,
    taskId: task.id,
    metadata: { runAfter }
  });
  return prisma.asyncTask.findUniqueOrThrow({ where: { id: task.id } });
}

export async function completeTask(task: AsyncTask, result?: unknown) {
  const worker = workerId();
  const updated = await prisma.asyncTask.updateMany({
    where: { id: task.id, status: "running", lockedBy: worker },
    data: {
      status: "succeeded",
      resultJson: result ? taskPayload(result) : task.resultJson,
      lockedBy: null,
      lockExpiresAt: null,
      completedAt: new Date()
    }
  });
  if (updated.count === 0) return prisma.asyncTask.findUniqueOrThrow({ where: { id: task.id } });

  await completeLatestAttempt(task.id, "succeeded", undefined, worker);
  await logEvent({
    source: "async-task",
    eventType: "task.succeeded",
    message: `Task ${task.type} succeeded.`,
    projectId: task.projectId ?? undefined,
    taskId: task.id,
    metadata: result
  });
  await recordMetric({ name: "async_task.succeeded", value: 1, unit: "count", tags: { type: task.type } });
  return prisma.asyncTask.findUniqueOrThrow({ where: { id: task.id } });
}

export async function failTask(task: AsyncTask, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Task failed.");
  const nextAttemptCount = task.attemptCount + 1;
  const isDead = nextAttemptCount >= task.maxAttempts;
  const runAfter = new Date(Date.now() + asyncTaskRetryDelayMs(nextAttemptCount - 1));
  const worker = workerId();

  const updated = await prisma.asyncTask.updateMany({
    where: { id: task.id, status: "running", lockedBy: worker },
    data: {
      status: isDead ? "dead" : "waiting",
      attemptCount: nextAttemptCount,
      runAfter: isDead ? task.runAfter : runAfter,
      lockedBy: null,
      lockExpiresAt: null,
      lastError: message,
      completedAt: isDead ? new Date() : null
    }
  });
  if (updated.count === 0) return prisma.asyncTask.findUniqueOrThrow({ where: { id: task.id } });

  await completeLatestAttempt(task.id, isDead ? "dead" : "failed", message, worker);
  await logEvent({
    level: isDead ? "error" : "warn",
    source: "async-task",
    eventType: isDead ? "task.dead" : "task.failed",
    message,
    projectId: task.projectId ?? undefined,
    taskId: task.id,
    metadata: { attemptCount: nextAttemptCount, maxAttempts: task.maxAttempts, runAfter: isDead ? null : runAfter }
  });
  await recordMetric({ name: isDead ? "async_task.dead" : "async_task.failed", value: 1, unit: "count", tags: { type: task.type } });
  return prisma.asyncTask.findUniqueOrThrow({ where: { id: task.id } });
}

async function expireOpenAttempts(taskId: string) {
  const endedAt = new Date();
  await prisma.asyncTaskAttempt.updateMany({
    where: { taskId, endedAt: null },
    data: {
      status: "expired",
      endedAt,
      error: "Task lease expired before reclaim."
    }
  });
}

async function completeLatestAttempt(taskId: string, status: string, error?: string, ownerWorkerId = workerId()) {
  const attempt = await prisma.asyncTaskAttempt.findFirst({
    where: { taskId, workerId: ownerWorkerId, endedAt: null },
    orderBy: { startedAt: "desc" }
  });
  if (!attempt) return;
  const endedAt = new Date();
  await prisma.asyncTaskAttempt.update({
    where: { id: attempt.id },
    data: {
      status,
      endedAt,
      durationMs: Math.max(0, endedAt.getTime() - attempt.startedAt.getTime()),
      error
    }
  });
}
