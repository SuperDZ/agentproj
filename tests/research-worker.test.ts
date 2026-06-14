import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockResearchRun, createMockHermesOutput } from "@/lib/hermes/mock";
import type { HermesRunResult } from "@/lib/hermes/types";

const state = vi.hoisted(() => ({
  projects: [] as Array<Record<string, unknown>>,
  researchRuns: [] as Array<Record<string, unknown>>,
  competitors: [] as Array<Record<string, unknown>>
}));

const hermesMock = vi.hoisted(() => ({
  mode: vi.fn(),
  createResearchRun: vi.fn(),
  getRunResult: vi.fn()
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

function sortByCreatedAtAsc(left: Record<string, unknown>, right: Record<string, unknown>) {
  return (left.createdAt as Date).getTime() - (right.createdAt as Date).getTime();
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
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations))
  }
}));

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
  hermesMock.mode.mockReturnValue("mock");
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

    expect(result).toMatchObject({ processed: true, action: "claimed", runId: "run_1", status: "completed" });
    expect(state.researchRuns[0].status).toBe("completed");
    expect(state.researchRuns[0].parsedOutputJson).toEqual(expect.any(String));
    expect(state.competitors.length).toBeGreaterThanOrEqual(7);
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

    expect(result).toMatchObject({ processed: true, action: "claimed", runId: "run_2", status: "running" });
    expect(state.researchRuns[0]).toMatchObject({
      hermesRunId: "hermes_1",
      status: "running",
      parsedOutputJson: null,
      completedAt: null
    });
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

    expect(result).toMatchObject({ processed: true, action: "refreshed", runId: "run_3", status: "completed" });
    expect(state.researchRuns[0].status).toBe("completed");
    expect(state.researchRuns[0].parsedOutputJson).toEqual(expect.any(String));
    expect(state.competitors.length).toBeGreaterThanOrEqual(7);
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
});
