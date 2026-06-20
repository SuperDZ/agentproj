import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

export type ObservabilityLevel = "debug" | "info" | "warn" | "error";

type CommonContext = {
  traceId?: string;
  projectId?: string;
  taskId?: string;
};

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

function durationMs(startedAt: Date, endedAt = new Date()) {
  return Math.max(0, endedAt.getTime() - startedAt.getTime());
}

export async function logEvent(input: CommonContext & {
  level?: ObservabilityLevel;
  source: string;
  eventType: string;
  message: string;
  metadata?: unknown;
}) {
  try {
    return await prisma.operationalEvent.create({
      data: {
        level: input.level ?? "info",
        source: input.source,
        eventType: input.eventType,
        message: input.message,
        traceId: input.traceId,
        projectId: input.projectId,
        taskId: input.taskId,
        metadataJson: safeJson(input.metadata)
      }
    });
  } catch {
    return null;
  }
}

export async function recordMetric(input: {
  name: string;
  value: number;
  unit?: string;
  tags?: unknown;
}) {
  try {
    return await prisma.metricSample.create({
      data: {
        name: input.name,
        value: input.value,
        unit: input.unit,
        tagsJson: safeJson(input.tags)
      }
    });
  } catch {
    return null;
  }
}

export type SpanHandle = {
  traceId: string;
  spanId: string;
  startedAt: Date;
};

export async function startSpan(input: CommonContext & {
  name: string;
  parentSpanId?: string;
  attributes?: unknown;
}): Promise<SpanHandle> {
  const span: SpanHandle = {
    traceId: input.traceId || randomUUID(),
    spanId: randomUUID(),
    startedAt: new Date()
  };

  try {
    await prisma.traceSpan.create({
      data: {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: input.parentSpanId,
        name: input.name,
        status: "running",
        startedAt: span.startedAt,
        projectId: input.projectId,
        taskId: input.taskId,
        attributesJson: safeJson(input.attributes)
      }
    });
  } catch {
    // Observability must never break the product path.
  }

  return span;
}

export async function finishSpan(span: SpanHandle | undefined, input?: {
  status?: "ok" | "error" | "cancelled";
  attributes?: unknown;
}) {
  if (!span) return null;
  const endedAt = new Date();
  try {
    return await prisma.traceSpan.update({
      where: { spanId: span.spanId },
      data: {
        status: input?.status ?? "ok",
        endedAt,
        durationMs: durationMs(span.startedAt, endedAt),
        attributesJson: safeJson(input?.attributes)
      }
    });
  } catch {
    return null;
  }
}

export async function recordModelInvocation(input: CommonContext & {
  provider: string;
  model: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
  latencyMs: number;
  status: "ok" | "error" | "fallback";
  error?: string;
}) {
  try {
    return await prisma.modelInvocation.create({
      data: {
        provider: input.provider,
        model: input.model,
        promptTokens: Number.isFinite(Number(input.promptTokens)) ? Number(input.promptTokens) : null,
        completionTokens: Number.isFinite(Number(input.completionTokens)) ? Number(input.completionTokens) : null,
        totalTokens: Number.isFinite(Number(input.totalTokens)) ? Number(input.totalTokens) : null,
        estimatedCostUsd: Number.isFinite(Number(input.estimatedCostUsd)) ? Number(input.estimatedCostUsd) : null,
        latencyMs: Math.max(0, Math.round(input.latencyMs)),
        status: input.status,
        projectId: input.projectId,
        traceId: input.traceId,
        error: input.error
      }
    });
  } catch {
    return null;
  }
}
