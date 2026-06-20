import { createFallbackPlanningOutput, createMockEvaluationOutput, createMockResearchRun, getMockEvents } from "./mock";
import { parseHermesResearchOutput } from "./parser";
import type { CreatePlanningRunInput, CreateResearchRunInput, HermesEvaluationInput, HermesEvaluationOutput, HermesEvent, HermesMode, HermesPlanningOutput, HermesRunResult, HermesRunStatus } from "./types";
import { finishSpan, logEvent, recordMetric, startSpan } from "@/lib/observability";

function hermesMode(): HermesMode {
  if (process.env.HERMES_MODE === "mock") return "mock";
  if (process.env.HERMES_MODE === "local") return "local";
  return "real";
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

function resourceUsageFromResponse(response: Record<string, unknown>, input?: CreateResearchRunInput): HermesRunResult["resourceUsage"] {
  const raw = response.resourceUsage ?? response.resource_usage ?? response.skillToolUsage ?? response.skill_tool_usage ?? response.usage;
  if (!raw && !input) return undefined;

  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const skills = Array.isArray(record.skills) ? record.skills : Array.isArray(response.usedSkills) ? response.usedSkills : undefined;
  const tools = Array.isArray(record.tools) ? record.tools : Array.isArray(response.usedTools) ? response.usedTools : undefined;

  type UsageResource = NonNullable<HermesRunResult["resourceUsage"]>["skills"][number];

  function normalize(items: unknown, fallback: CreateResearchRunInput["enabledSkills"]): UsageResource[] {
    if (Array.isArray(items)) {
      return items.map((item) => {
        if (typeof item === "string") return { name: item, callCount: 1, status: "used" as const };
        const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const status: UsageResource["status"] = value.status === "planned" ? "planned" : value.status === "not_reported" ? "not_reported" : "used";
        return {
          name: String(value.name || value.id || value.path || "unknown"),
          path: value.path ? String(value.path) : undefined,
          purpose: stringArrayClean(value.purpose),
          callCount: Number.isFinite(Number(value.callCount ?? value.calls ?? value.count)) ? Number(value.callCount ?? value.calls ?? value.count) : 1,
          status,
          reason: value.reason ? String(value.reason) : undefined
        };
      }).filter((item) => item.name && item.name !== "unknown");
    }
    return (fallback ?? []).map((item) => ({
      name: item.name,
      path: item.path,
      purpose: item.purpose,
      callCount: 0,
      status: "not_reported" as const,
      reason: input?.resourceMode === "manual" ? "已传给 Hermes，远端未返回具体调用次数。" : "Hermes 自主模式未返回具体调用次数。"
    }));
  }

  return {
    mode: record.mode === "auto" || input?.resourceMode === "auto" ? "auto" : "manual",
    skills: normalize(skills, input?.resourceMode === "manual" ? input.enabledSkills : undefined),
    tools: normalize(tools, input?.resourceMode === "manual" ? input.enabledTools : undefined),
    raw
  };
}

function normalizeRunResponse(response: Record<string, unknown>, fallbackRunId?: string, input?: CreateResearchRunInput): HermesRunResult {
  const output = response.output ?? response.result ?? response.rawOutput;
  const rawOutput = output ? (typeof output === "string" ? output : JSON.stringify(output, null, 2)) : JSON.stringify(response, null, 2);
  const status = normalizeStatus(response.status, Boolean(output));

  return {
    hermesRunId: String(response.id ?? response.run_id ?? fallbackRunId ?? "unknown"),
    mode: hermesMode(),
    status,
    rawOutput,
    parsedOutput: output ? parseHermesResearchOutput(rawOutput) : undefined,
    resourceUsage: resourceUsageFromResponse(response, input)
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
    const startedAt = Date.now();
    const span = await startSpan({ name: "hermes.createResearchRun", projectId: input.projectId, attributes: { mode, resourceMode: input.resourceMode } });
    try {
      let result: HermesRunResult;
      if (mode === "mock") {
        result = await createMockResearchRun(input);
      } else if (mode === "local") {
        const { createLocalResearchRun } = await import("./local");
        result = await createLocalResearchRun(input);
      } else {
        const response = await hermesFetch("/runs/research", {
          method: "POST",
          body: JSON.stringify({
            input: input.resourceMode === "auto"
              ? {
                projectId: input.projectId,
                idea: input.idea,
                explanation: input.explanation,
                industry: input.industry,
                targetUser: input.targetUser,
                financialSuitability: input.financialSuitability,
                preferredTechStack: input.preferredTechStack,
                resourceMode: "auto",
                resourceInstruction: "Autonomously select suitable Hermes skills and tools for this research run. Do not use caller-provided manual resource configuration."
              }
              : input,
            ...(input.resourceMode === "manual" ? {
              skills: input.enabledSkills?.map((item) => item.name) ?? [],
              tools: input.enabledTools?.map((item) => item.name) ?? []
            } : {
              resourceSelection: "auto"
            }),
            safety: { yolo: false, thirdPartySkillsReferenceOnly: true }
          })
        });
        result = normalizeRunResponse(response, undefined, input);
      }

      const latencyMs = Date.now() - startedAt;
      await finishSpan(span, { status: "ok", attributes: { mode, status: result.status, hermesRunId: result.hermesRunId, latencyMs } });
      await recordMetric({ name: "hermes.call.latency_ms", value: latencyMs, unit: "ms", tags: { mode, operation: "createResearchRun", status: result.status } });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finishSpan(span, { status: "error", attributes: { mode, error: message } });
      await logEvent({ level: "error", source: "hermes-client", eventType: "hermes.create_failed", message, projectId: input.projectId, traceId: span.traceId, metadata: { mode } });
      throw error;
    }
  },

  async getRunResult(runId: string): Promise<HermesRunResult> {
    const mode = hermesMode();
    const startedAt = Date.now();
    const span = await startSpan({ name: "hermes.getRunResult", attributes: { mode, runId } });
    try {
      let result: HermesRunResult;
      if (mode === "mock" || mode === "local") {
        result = {
          hermesRunId: runId,
          mode,
          status: mode === "local" ? "completed_without_output" : "completed",
          rawOutput: JSON.stringify({ status: "completed", runId }, null, 2)
        };
      } else {
        const response = await hermesFetch(`/runs/${runId}`);
        if (hasResearchOutput(response)) {
          result = normalizeRunResponse(response, runId);
        } else {
          const outputPath = researchOutputPath(runId);
          if (outputPath) {
            const outputResponse = await hermesFetch(outputPath);
            result = hasResearchOutput(outputResponse)
              ? normalizeRunResponse({ ...response, ...outputResponse }, runId)
              : normalizeRunResponse(mergeRunOutput(response, outputResponse), runId);
          } else {
            const eventsResponse = await hermesFetch(`/runs/${runId}/events`);
            const eventOutput = extractOutputFromEvents(eventsResponse);
            result = eventOutput ? normalizeRunResponse(mergeRunOutput(response, eventOutput), runId) : normalizeRunResponse(response, runId);
          }
        }
      }
      const latencyMs = Date.now() - startedAt;
      await finishSpan(span, { status: "ok", attributes: { mode, runId, status: result.status, latencyMs } });
      await recordMetric({ name: "hermes.call.latency_ms", value: latencyMs, unit: "ms", tags: { mode, operation: "getRunResult", status: result.status } });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finishSpan(span, { status: "error", attributes: { mode, runId, error: message } });
      await logEvent({ level: "error", source: "hermes-client", eventType: "hermes.refresh_failed", message, traceId: span.traceId, metadata: { mode, runId } });
      throw error;
    }
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
