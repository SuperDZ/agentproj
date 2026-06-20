import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockResearchRun, createMockHermesOutput } from "@/lib/hermes/mock";
import type { HermesRunResult } from "@/lib/hermes/types";

const state = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  researchRuns: [] as Array<Record<string, unknown>>,
  competitors: [] as Array<Record<string, unknown>>,
  artifacts: [] as Array<Record<string, unknown>>,
  asyncTasks: [] as Array<Record<string, unknown>>,
  asyncTaskAttempts: [] as Array<Record<string, unknown>>,
  workerHeartbeats: [] as Array<Record<string, unknown>>
}));

const hermesMock = vi.hoisted(() => ({
  mode: vi.fn(),
  createResearchRun: vi.fn(),
  getRunResult: vi.fn()
}));

const cacheMock = vi.hoisted(() => ({
  acquireIdempotencyKey: vi.fn(),
  cacheDelete: vi.fn(),
  publishTaskNotification: vi.fn(),
  waitForTaskNotification: vi.fn()
}));

function matchesRun(run: Record<string, unknown>, where: Record<string, unknown>) {
  if (where.id && run.id !== where.id) return false;
  if (where.status && run.status !== where.status) return false;
  if ("hermesRunId" in where) {
    const condition = where.hermesRunId;
    if (condition === null && run.hermesRunId !== null) return false;
    if (condition && typeof condition === "object" && "not" in condition && run.hermesRunId === condition.not) return false;
  }
  if ("parsedOutputJson" in where && run.parsedOutputJson !== where.parsedOutputJson) return false;
  if (where.createdAt && typeof where.createdAt === "object" && "lt" in where.createdAt) {
    if (!((run.createdAt as Date) < (where.createdAt.lt as Date))) return false;
  }
  return true;
}

function matchesTask(task: Record<string, unknown>, where: Record<string, unknown>) {
  const orConditions = Array.isArray(where.OR) ? where.OR as Array<Record<string, unknown>> : null;
  if (where.id && task.id !== where.id) return false;
  if (where.projectId && task.projectId !== where.projectId) return false;
  if (where.type && task.type !== where.type) return false;
  if ("lockedBy" in where && task.lockedBy !== where.lockedBy) return false;
  if (where.status) {
    const condition = where.status;
    if (condition && typeof condition === "object" && "in" in condition) {
      if (!Array.isArray(condition.in) || !condition.in.includes(task.status)) return false;
    } else if (task.status !== condition) {
      return false;
    }
  }
  if (where.runAfter && typeof where.runAfter === "object" && "lte" in where.runAfter) {
    if (!((task.runAfter as Date) <= (where.runAfter.lte as Date))) return false;
  }
  if (where.lockExpiresAt && typeof where.lockExpiresAt === "object" && "lte" in where.lockExpiresAt) {
    if (!task.lockExpiresAt || !((task.lockExpiresAt as Date) <= (where.lockExpiresAt.lte as Date))) return false;
  }
  if (orConditions && !orConditions.some((item) => matchesTask(task, item))) return false;
  return true;
}

function sortByCreatedAtAsc(left: Record<string, unknown>, right: Record<string, unknown>) {
  return (left.createdAt as Date).getTime() - (right.createdAt as Date).getTime();
}

function sortTasks(left: Record<string, unknown>, right: Record<string, unknown>) {
  const priority = Number(right.priority ?? 0) - Number(left.priority ?? 0);
  return priority || sortByCreatedAtAsc(left, right);
}

vi.mock("@/lib/hermes/client", () => ({
  hermesClient: hermesMock
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    researchRun: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        state.researchRuns.filter((run) => matchesRun(run, where)).sort(sortByCreatedAtAsc)[0] ?? null
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        state.researchRuns.find((run) => run.id === where.id) ?? null
      ),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const run = state.researchRuns.find((item) => item.id === where.id);
        if (!run) throw new Error("ResearchRun not found");
        return run;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const run = state.researchRuns.find((item) => item.id === where.id);
        if (!run) throw new Error("ResearchRun not found");
        Object.assign(run, data);
        return run;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const matches = state.researchRuns.filter((run) => matchesRun(run, where));
        matches.forEach((run) => Object.assign(run, data));
        return { count: matches.length };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const run = {
          id: `run_${state.researchRuns.length + 1}`,
          hermesRunId: null,
          rawOutput: null,
          parsedOutputJson: null,
          completedAt: null,
          createdAt: new Date(),
          ...data
        };
        state.researchRuns.push(run);
        return run;
      })
    },
    project: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const project = state.projects.find((item) => item.id === where.id);
        if (!project) throw new Error("Project not found");
        return {
          ...project,
          researchRuns: state.researchRuns
            .filter((run) => run.projectId === where.id)
            .sort((left, right) => (right.createdAt as Date).getTime() - (left.createdAt as Date).getTime()),
          competitors: state.competitors.filter((competitor) => competitor.projectId === where.id),
          evaluations: [],
          artifacts: project.artifacts ?? [],
          monitorJobs: []
        };
      })
    },
    competitor: {
      deleteMany: vi.fn(async ({ where }: { where: { projectId: string } }) => {
        state.competitors = state.competitors.filter((competitor) => competitor.projectId !== where.projectId);
        return { count: 0 };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const competitor = { id: `competitor_${state.competitors.length + 1}`, ...data };
        state.competitors.push(competitor);
        return competitor;
      })
    },
    generatedArtifact: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const artifact = { id: `artifact_${state.artifacts.length + 1}`, createdAt: new Date(), ...data };
        state.artifacts.push(artifact);
        return artifact;
      })
    },
    asyncTask: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const task = {
          id: `task_${state.asyncTasks.length + 1}`,
          type: "",
          projectId: null,
          status: "queued",
          payloadJson: "{}",
          resultJson: null,
          priority: 0,
          attemptCount: 0,
          maxAttempts: 3,
          runAfter: new Date(),
          lockedBy: null,
          lockExpiresAt: null,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
          ...data
        };
        state.asyncTasks.push(task);
        return task;
      }),
      findFirst: vi.fn(async ({ where = {} }: { where?: Record<string, unknown> }) =>
        state.asyncTasks.filter((task) => matchesTask(task, where)).sort(sortTasks)[0] ?? null
      ),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const task = state.asyncTasks.find((item) => item.id === where.id);
        if (!task) throw new Error("AsyncTask not found");
        return task;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const task = state.asyncTasks.find((item) => item.id === where.id);
        if (!task) throw new Error("AsyncTask not found");
        Object.assign(task, data, { updatedAt: new Date() });
        return task;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const matches = state.asyncTasks.filter((task) => matchesTask(task, where));
        matches.forEach((task) => Object.assign(task, data, { updatedAt: new Date() }));
        return { count: matches.length };
      })
    },
    asyncTaskAttempt: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const attempt = {
          id: `attempt_${state.asyncTaskAttempts.length + 1}`,
          status: "running",
          startedAt: new Date(),
          endedAt: null,
          durationMs: null,
          error: null,
          metadataJson: null,
          ...data
        };
        state.asyncTaskAttempts.push(attempt);
        return attempt;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        state.asyncTaskAttempts
          .filter((attempt) => attempt.taskId === where.taskId && attempt.endedAt === where.endedAt)
          .sort((left, right) => (right.startedAt as Date).getTime() - (left.startedAt as Date).getTime())[0] ?? null
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const attempt = state.asyncTaskAttempts.find((item) => item.id === where.id);
        if (!attempt) throw new Error("AsyncTaskAttempt not found");
        Object.assign(attempt, data);
        return attempt;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const matches = state.asyncTaskAttempts.filter((attempt) => {
          if (where.taskId && attempt.taskId !== where.taskId) return false;
          if (where.workerId && attempt.workerId !== where.workerId) return false;
          if ("endedAt" in where && attempt.endedAt !== where.endedAt) return false;
          return true;
        });
        matches.forEach((attempt) => Object.assign(attempt, data));
        return { count: matches.length };
      })
    },
    workerHeartbeat: {
      upsert: vi.fn(async ({ where, create, update }: { where: { workerId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const existing = state.workerHeartbeats.find((item) => item.workerId === where.workerId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const heartbeat = { id: `heartbeat_${state.workerHeartbeats.length + 1}`, lastSeenAt: new Date(), ...create };
        state.workerHeartbeats.push(heartbeat);
        return heartbeat;
      })
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  }
}));

vi.mock("@/lib/cache/redis", () => cacheMock);

const originalEnv = { ...process.env };

beforeEach(() => {
  state.projects = [{
    id: "p1",
    name: "SpecFlow",
    idea: "SpecFlow",
    industry: "devtools",
    targetUser: "PMs",
    preferredTechStack: null,
    needFinancialSuitabilityCheck: false,
    needContinuousCompetitorMonitoring: false,
    artifacts: []
  }];
  state.researchRuns = [];
  state.competitors = [];
  state.artifacts = [];
  state.asyncTasks = [];
  state.asyncTaskAttempts = [];
  state.workerHeartbeats = [];
  hermesMock.mode.mockReturnValue("mock");
  cacheMock.acquireIdempotencyKey.mockResolvedValue(true);
  cacheMock.cacheDelete.mockResolvedValue(true);
  cacheMock.publishTaskNotification.mockResolvedValue(true);
  cacheMock.waitForTaskNotification.mockResolvedValue(false);
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("research worker", () => {
  it("claims a queued mock run, completes it, and persists competitors", async () => {
    state.researchRuns.push({
      id: "run_1",
      projectId: "p1",
      hermesRunId: null,
      mode: "mock",
      status: "queued",
      inputPrompt: "prompt",
      rawOutput: null,
      parsedOutputJson: null,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      completedAt: null
    });
    hermesMock.createResearchRun.mockImplementation(createMockResearchRun);

    const { processResearchWorkerOnce } = await import("@/lib/services/project-flow");
    const result = await processResearchWorkerOnce();

    expect(result).toMatchObject({ processed: true, action: "succeeded", runId: "run_1", status: "completed" });
    expect(state.researchRuns[0].status).toBe("completed");
    expect(state.researchRuns[0].parsedOutputJson).toEqual(expect.any(String));
    expect(state.competitors.length).toBeGreaterThanOrEqual(7);
    expect(state.asyncTasks[0].status).toBe("succeeded");
  });

  it("persists an external real Hermes run without requiring immediate parsed output", async () => {
    state.researchRuns.push({
      id: "run_2",
      projectId: "p1",
      hermesRunId: null,
      mode: "real",
      status: "queued",
      inputPrompt: "prompt",
      rawOutput: null,
      parsedOutputJson: null,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      completedAt: null
    });
    hermesMock.createResearchRun.mockResolvedValue({
      hermesRunId: "hermes_1",
      mode: "real",
      status: "queued",
      rawOutput: "{\"id\":\"hermes_1\",\"status\":\"queued\"}"
    } satisfies HermesRunResult);

    const { processResearchWorkerOnce } = await import("@/lib/services/project-flow");
    const result = await processResearchWorkerOnce();

    expect(result).toMatchObject({ processed: true, action: "waited", runId: "run_2", status: "running" });
    expect(state.researchRuns[0]).toMatchObject({
      hermesRunId: "hermes_1",
      status: "running",
      parsedOutputJson: null,
      completedAt: null
    });
    expect(state.asyncTasks[0].status).toBe("waiting");
  });

  it("refreshes a running external run and persists final parsed output", async () => {
    const output = createMockHermesOutput({ projectId: "p1", idea: "SpecFlow", industry: "devtools", targetUser: "PMs" });
    state.researchRuns.push({
      id: "run_3",
      projectId: "p1",
      hermesRunId: "hermes_2",
      mode: "real",
      status: "running",
      inputPrompt: "prompt",
      rawOutput: null,
      parsedOutputJson: null,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      completedAt: null
    });
    hermesMock.getRunResult.mockResolvedValue({
      hermesRunId: "hermes_2",
      mode: "real",
      status: "completed",
      rawOutput: JSON.stringify(output),
      parsedOutput: output
    } satisfies HermesRunResult);

    const { processResearchWorkerOnce } = await import("@/lib/services/project-flow");
    const result = await processResearchWorkerOnce();

    expect(result).toMatchObject({ processed: true, action: "succeeded", runId: "run_3", status: "completed" });
    expect(state.researchRuns[0].status).toBe("completed");
    expect(state.researchRuns[0].parsedOutputJson).toEqual(expect.any(String));
    expect(state.competitors.length).toBeGreaterThanOrEqual(7);
    expect(state.asyncTasks[0].status).toBe("succeeded");
  });

  it("resets stale running runs that never received an external Hermes run id", async () => {
    process.env.HERMES_RESEARCH_STALE_RUNNING_MS = String(15 * 60 * 1000);
    state.researchRuns.push({
      id: "run_4",
      projectId: "p1",
      hermesRunId: null,
      mode: "real",
      status: "running",
      inputPrompt: "prompt",
      rawOutput: null,
      parsedOutputJson: null,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      completedAt: null
    });

    const { resetStaleResearchRuns } = await import("@/lib/services/project-flow");
    const result = await resetStaleResearchRuns(new Date("2026-06-01T00:16:00.000Z"));

    expect(result.count).toBe(1);
    expect(state.researchRuns[0].status).toBe("queued");
    expect(state.researchRuns[0].rawOutput).toContain("recovered");
  });

  it("does not create another active run when the research idempotency key is held", async () => {
    cacheMock.acquireIdempotencyKey.mockResolvedValueOnce(false);
    state.researchRuns.push({
      id: "run_existing",
      projectId: "p1",
      hermesRunId: null,
      mode: "real",
      status: "queued",
      inputPrompt: "prompt",
      rawOutput: null,
      parsedOutputJson: null,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      completedAt: null
    });

    const { runProjectResearch } = await import("@/lib/services/project-flow");
    const result = await runProjectResearch("p1");

    expect(result?.id).toBe("run_existing");
    expect(state.researchRuns).toHaveLength(1);
    expect(cacheMock.acquireIdempotencyKey).toHaveBeenCalledWith("research:start:p1", 10);
  });

  it("does not let a worker complete a task after losing its lease", async () => {
    process.env.SPECFLOW_WORKER_ID = "worker-a";
    const task = {
      id: "task_lost",
      type: "research.run",
      projectId: "p1",
      status: "running",
      payloadJson: "{}",
      resultJson: null,
      priority: 0,
      attemptCount: 0,
      maxAttempts: 3,
      runAfter: new Date(),
      lockedBy: "worker-b",
      lockExpiresAt: new Date(Date.now() + 60_000),
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null
    };
    state.asyncTasks.push(task);
    state.asyncTaskAttempts.push({
      id: "attempt_b",
      taskId: task.id,
      workerId: "worker-b",
      status: "running",
      startedAt: new Date(),
      endedAt: null
    });

    const { completeTask } = await import("@/lib/async-tasks/store");
    const result = await completeTask(task as never, { ok: true });

    expect(result.status).toBe("running");
    expect(state.asyncTasks[0].resultJson).toBeNull();
    expect(state.asyncTaskAttempts[0].endedAt).toBeNull();
  });
});
