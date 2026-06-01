import { z } from "zod";

export const competitorSchema = z.object({
  name: z.string(),
  type: z.enum(["open_source", "commercial", "internal_tool", "alternative"]),
  url: z.string().url().or(z.string().startsWith("https://")),
  description: z.string(),
  core_features: z.array(z.string()),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  reusable_ideas: z.array(z.string()),
  threat_level: z.number().min(0).max(100),
  reuse_strategy: z.enum(["reuse", "fork", "reference_only", "avoid", "unknown"])
});

export const hermesResearchOutputSchema = z.object({
  query_keywords: z.array(z.string()),
  summary: z.string(),
  competitors: z.array(competitorSchema).min(7),
  differentiation: z.object({
    redundancy_risk: z.number().min(0).max(100),
    differentiation_score: z.number().min(0).max(100),
    should_build: z.string(),
    mvp_reframe: z.string(),
    must_have_features: z.array(z.string()),
    should_not_build_features: z.array(z.string()),
    reuse_strategy: z.array(z.string())
  }),
  prd: z.record(z.string(), z.unknown()),
  codex_pack_seed: z.record(z.string(), z.unknown()),
  monitor_plan: z.object({
    what_to_monitor: z.array(z.string()),
    metrics: z.array(z.string()),
    competitor_drift_signals: z.array(z.string()),
    hermes_cron_suggestion: z.string(),
    suggested_schedule: z.string(),
    next_iteration_actions: z.array(z.string())
  })
});

export type HermesResearchOutput = z.infer<typeof hermesResearchOutputSchema>;
export type HermesCompetitor = z.infer<typeof competitorSchema>;

export type CreateResearchRunInput = {
  projectId: string;
  idea: string;
  industry: string;
  targetUser: string;
  financialSuitability?: boolean;
  preferredTechStack?: string;
};

export type HermesRunStatus = "queued" | "running" | "completed" | "failed" | "completed_without_output";
export type HermesMode = "real" | "mock";

export type HermesRunResult = {
  hermesRunId: string;
  mode: HermesMode;
  status: HermesRunStatus;
  rawOutput: string;
  parsedOutput?: HermesResearchOutput;
};

export type HermesEvent = {
  id: string;
  at: string;
  message: string;
  level: "info" | "warning" | "error";
};
