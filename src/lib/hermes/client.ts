import { createFallbackPlanningOutput, createMockEvaluationOutput, createMockResearchRun, getMockEvents } from "./mock";
import { parseHermesResearchOutput } from "./parser";
import type { CreatePlanningRunInput, CreateResearchRunInput, HermesEvaluationInput, HermesEvaluationOutput, HermesEvent, HermesMode, HermesPlanningOutput, HermesRunResult, HermesRunStatus } from "./types";

function hermesMode(): HermesMode {
  if (process.env.HERMES_MODE === "local") return "local";
  return process.env.HERMES_MODE === "real" && Boolean(process.env.HERMES_API_BASE_URL) ? "real" : "mock";
}

async function hermesFetch(path: string, init?: RequestInit) {
  const base = process.env.HERMES_API_BASE_URL;
  if (!base) throw new Error("HERMES_API_BASE_URL is required for real mode.");
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (process.env.HERMES_API_KEY) headers.set("authorization", `Bearer ${process.env.HERMES_API_KEY}`);
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`Hermes API ${response.status}: ${await response.text()}`);
  return response.json();
}

function hasResearchOutput(response: Record<string, unknown>) {
  return Boolean(response.output ?? response.result ?? response.rawOutput);
}

function researchOutputPath(runId: string) {
  return process.env.HERMES_RESEARCH_OUTPUT_PATH_TEMPLATE?.replace("{runId}", encodeURIComponent(runId));
}

function extractOutputFromEvents(response: Record<string, unknown>) {
  const events = Array.isArray(response.events) ? response.events : [];
  for (const event of events.toReversed()) {
    if (!event || typeof event !== "object") continue;
    const candidate = event as Record<string, unknown>;
    const artifact = candidate.artifact && typeof candidate.artifact === "object" ? (candidate.artifact as Record<string, unknown>) : undefined;
    const output = candidate.output ?? candidate.result ?? candidate.rawOutput ?? artifact?.output ?? artifact?.content;
    if (output) return output;
  }
  return undefined;
}

function normalizeStatus(status: unknown, hasOutput: boolean): HermesRunStatus {
  if (status === "completed" || status === "succeeded" || status === "success") return hasOutput ? "completed" : "completed_without_output";
  if (status === "failed" || status === "error") return "failed";
  if (status === "running" || status === "in_progress") return "running";
  if (status === "queued" || status === "pending") return "queued";
  return hasOutput ? "completed" : "queued";
}

function normalizeRunResponse(response: Record<string, unknown>, fallbackRunId?: string): HermesRunResult {
  const output = response.output ?? response.result ?? response.rawOutput;
  const rawOutput = output ? (typeof output === "string" ? output : JSON.stringify(output, null, 2)) : JSON.stringify(response, null, 2);
  const status = normalizeStatus(response.status, Boolean(output));

  return {
    hermesRunId: String(response.id ?? response.run_id ?? fallbackRunId ?? "unknown"),
    mode: hermesMode(),
    status,
    rawOutput,
    parsedOutput: output ? parseHermesResearchOutput(rawOutput) : undefined
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n|[,;，；]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function stringArrayClean(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n|[,;，；、]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizePlanningOutput(value: unknown, fallback: HermesPlanningOutput): HermesPlanningOutput {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const coreFeatures = stringArrayClean(record.coreFeatures ?? record.core_features ?? record.features).slice(0, 5);
  return {
    pmPlanningAdvice: typeof record.pmPlanningAdvice === "string" && record.pmPlanningAdvice.trim()
      ? record.pmPlanningAdvice
      : typeof record.planning_advice === "string" && record.planning_advice.trim()
        ? record.planning_advice
        : fallback.pmPlanningAdvice,
    problemAndUsers: typeof record.problemAndUsers === "string" && record.problemAndUsers.trim()
      ? record.problemAndUsers
      : typeof record.problem_and_users === "string" && record.problem_and_users.trim()
        ? record.problem_and_users
        : fallback.problemAndUsers,
    coreFeatures: coreFeatures.length >= 3 ? coreFeatures : fallback.coreFeatures
  };
}

function normalizeScoreReason(value: unknown, fallback: { score: number; reasons: string[] }) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const score = Number(record.score);
  return {
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : fallback.score,
    reasons: stringArrayClean(record.reasons).length ? stringArrayClean(record.reasons) : fallback.reasons
  };
}

function normalizeEvaluationOutput(value: unknown, fallback: HermesEvaluationOutput): HermesEvaluationOutput {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const pdrs = Number(record.pdrs);
  const decision = String(record.decision || fallback.decision);
  const allowedDecision = decision === "export" || decision === "export_with_risk" || decision === "revise_before_export" || decision === "abandon_or_reframe"
    ? decision
    : fallback.decision;
  return {
    pdrs: Number.isFinite(pdrs) ? Math.max(0, Math.min(100, Number(pdrs.toFixed(1)))) : fallback.pdrs,
    opportunityScore: normalizeScoreReason(record.opportunityScore ?? record.opportunity_score, fallback.opportunityScore),
    competitiveScore: normalizeScoreReason(record.competitiveScore ?? record.competitive_score, fallback.competitiveScore),
    specificationScore: normalizeScoreReason(record.specificationScore ?? record.specification_score, fallback.specificationScore),
    prototypeScore: normalizeScoreReason(record.prototypeScore ?? record.prototype_score, fallback.prototypeScore),
    promptReadinessScore: normalizeScoreReason(record.promptReadinessScore ?? record.prompt_readiness_score, fallback.promptReadinessScore),
    redundancyRisk: Number.isFinite(Number(record.redundancyRisk ?? record.redundancy_risk)) ? Math.max(0, Math.min(100, Math.round(Number(record.redundancyRisk ?? record.redundancy_risk)))) : fallback.redundancyRisk,
    differentiationScore: Number.isFinite(Number(record.differentiationScore ?? record.differentiation_score)) ? Math.max(0, Math.min(100, Math.round(Number(record.differentiationScore ?? record.differentiation_score)))) : fallback.differentiationScore,
    decision: allowedDecision,
    risks: stringArrayClean(record.risks).length ? stringArrayClean(record.risks) : fallback.risks,
    nextActions: stringArrayClean(record.nextActions ?? record.next_actions).length ? stringArrayClean(record.nextActions ?? record.next_actions) : fallback.nextActions
  };
}

function mergeRunOutput(runResponse: Record<string, unknown>, output: unknown) {
  return {
    ...runResponse,
    output,
    status: runResponse.status ?? "completed"
  };
}

export const hermesClient = {
  mode: hermesMode,

  async createPlanningRun(input: CreatePlanningRunInput): Promise<HermesPlanningOutput> {
    const fallback = createFallbackPlanningOutput(input);
    const mode = hermesMode();
    if (mode === "mock") return fallback;
    if (mode === "local") {
      const { createLocalPlanningRun } = await import("./local");
      return createLocalPlanningRun(input);
    }

    const response = await hermesFetch("/runs/planning", {
      method: "POST",
      body: JSON.stringify({
        input,
        outputSchema: {
          pmPlanningAdvice: "string",
          problemAndUsers: "string",
          coreFeatures: "string[3..5]"
        },
        safety: { yolo: false, thirdPartySkillsReferenceOnly: true }
      })
    });

    return normalizePlanningOutput(response.output ?? response.result ?? response, fallback);
  },

  async createResearchRun(input: CreateResearchRunInput): Promise<HermesRunResult> {
    const mode = hermesMode();
    if (mode === "mock") return createMockResearchRun(input);
    if (mode === "local") {
      const { createLocalResearchRun } = await import("./local");
      return createLocalResearchRun(input);
    }

    const response = await hermesFetch("/runs/research", {
      method: "POST",
      body: JSON.stringify({
        input,
        skills: ["planning", "document-analysis", "competitive-research"],
        safety: { yolo: false, thirdPartySkillsReferenceOnly: true }
      })
    });

    return normalizeRunResponse(response);
  },

  async getRunResult(runId: string): Promise<HermesRunResult> {
    const mode = hermesMode();
    if (mode === "mock" || mode === "local") {
      return {
        hermesRunId: runId,
        mode,
        status: mode === "local" ? "completed_without_output" : "completed",
        rawOutput: JSON.stringify({ status: "completed", runId }, null, 2)
      };
    }
    const response = await hermesFetch(`/runs/${runId}`);
    if (hasResearchOutput(response)) return normalizeRunResponse(response, runId);

    const outputPath = researchOutputPath(runId);
    if (outputPath) {
      const outputResponse = await hermesFetch(outputPath);
      if (hasResearchOutput(outputResponse)) return normalizeRunResponse({ ...response, ...outputResponse }, runId);
      return normalizeRunResponse(mergeRunOutput(response, outputResponse), runId);
    }

    const eventsResponse = await hermesFetch(`/runs/${runId}/events`);
    const eventOutput = extractOutputFromEvents(eventsResponse);
    if (eventOutput) return normalizeRunResponse(mergeRunOutput(response, eventOutput), runId);

    return normalizeRunResponse(response, runId);
  },

  async evaluateReadiness(input: HermesEvaluationInput): Promise<HermesEvaluationOutput> {
    const fallback = createMockEvaluationOutput(input);
    const mode = hermesMode();
    if (mode === "mock" || mode === "local") return fallback;

    const response = await hermesFetch("/runs/evaluate", {
      method: "POST",
      body: JSON.stringify({
        input: {
          projectId: input.projectId,
          idea: input.idea,
          industry: input.industry,
          targetUser: input.targetUser,
          prd: input.prd,
          differentiation: input.differentiation,
          competitorMatrix: input.competitorMatrix,
          previousHermesResearch: input.previousHermesResearch,
          codexPackText: input.codexPackText
        },
        outputSchema: {
          pdrs: "number",
          opportunityScore: "{ score:number, reasons:string[] }",
          competitiveScore: "{ score:number, reasons:string[] }",
          specificationScore: "{ score:number, reasons:string[] }",
          prototypeScore: "{ score:number, reasons:string[] }",
          promptReadinessScore: "{ score:number, reasons:string[] }",
          redundancyRisk: "number",
          differentiationScore: "number",
          decision: "export|export_with_risk|revise_before_export|abandon_or_reframe",
          risks: "string[]",
          nextActions: "string[]"
        },
        safety: { yolo: false, thirdPartySkillsReferenceOnly: true }
      })
    });

    return normalizeEvaluationOutput(response.output ?? response.result ?? response, fallback);
  },

  async getRunStatus(runId: string): Promise<HermesRunStatus> {
    if (hermesMode() === "mock" || hermesMode() === "local") return "completed";
    const response = await hermesFetch(`/runs/${runId}`);
    return normalizeStatus(response.status, hasResearchOutput(response));
  },

  async getRunEvents(runId: string): Promise<HermesEvent[]> {
    if (hermesMode() === "mock") return getMockEvents(runId);
    if (hermesMode() === "local") return [{ id: `${runId}-local`, at: new Date().toISOString(), level: "info", message: "Local Hermes CLI run completed." }];
    const response = await hermesFetch(`/runs/${runId}/events`);
    return response.events ?? [];
  },

  async createMonitorJob(projectId: string, schedule: string) {
    const mode = hermesMode();
    if (mode === "mock" || mode === "local") {
      return { hermesCronJobId: `${mode}_cron_${projectId}_${Date.now()}`, status: "active", schedule };
    }
    return hermesFetch("/cron/jobs", {
      method: "POST",
      body: JSON.stringify({ projectId, schedule, task: "competitor-monitor" })
    });
  }
};
