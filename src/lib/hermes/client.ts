import { createMockResearchRun, getMockEvents } from "./mock";
import { parseHermesResearchOutput } from "./parser";
import type { CreateResearchRunInput, HermesEvent, HermesRunResult, HermesRunStatus } from "./types";

function hermesMode(): "real" | "mock" {
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

export const hermesClient = {
  mode: hermesMode,

  async createResearchRun(input: CreateResearchRunInput): Promise<HermesRunResult> {
    if (hermesMode() === "mock") return createMockResearchRun(input);

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
    if (hermesMode() === "mock") {
      return {
        hermesRunId: runId,
        mode: "mock",
        status: "completed",
        rawOutput: JSON.stringify({ status: "completed", runId }, null, 2)
      };
    }
    const response = await hermesFetch(`/runs/${runId}`);
    return normalizeRunResponse(response, runId);
  },

  async getRunStatus(runId: string): Promise<HermesRunStatus> {
    if (hermesMode() === "mock") return "completed";
    const response = await hermesFetch(`/runs/${runId}`);
    if (response.status === "completed" || response.status === "succeeded" || response.status === "success") return "completed";
    return normalizeStatus(response.status, false);
  },

  async getRunEvents(runId: string): Promise<HermesEvent[]> {
    if (hermesMode() === "mock") return getMockEvents(runId);
    const response = await hermesFetch(`/runs/${runId}/events`);
    return response.events ?? [];
  },

  async createMonitorJob(projectId: string, schedule: string) {
    if (hermesMode() === "mock") {
      return { hermesCronJobId: `mock_cron_${projectId}_${Date.now()}`, status: "active", schedule };
    }
    return hermesFetch("/cron/jobs", {
      method: "POST",
      body: JSON.stringify({ projectId, schedule, task: "competitor-monitor" })
    });
  }
};
