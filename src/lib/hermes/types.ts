import { z } from "zod";
import type { EvaluationInput, EvaluationResult } from "@/lib/evaluation/engine";

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
    reuse_strategy: z.array(z.string()),
    score_basis: z.array(z.string()).optional(),
    reasoning: z.string().optional(),
    similar_products: z
      .array(z.object({
        name: z.string(),
        same_points: z.array(z.string()),
        modification_suggestions: z.array(z.string())
      }))
      .optional(),
    modification_suggestions: z.array(z.string()).optional()
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
  explanation?: string;
  industry: string;
  targetUser: string;
  financialSuitability?: boolean;
  preferredTechStack?: string;
  resourceMode?: "manual" | "auto";
  enabledSkills?: Array<{ name: string; path?: string; purpose?: string[]; description?: string }>;
  enabledTools?: Array<{ name: string; path?: string; purpose?: string[]; description?: string }>;
};

export type CreatePlanningRunInput = {
  projectId: string;
  idea: string;
  explanation?: string;
  industry: string;
  targetUser: string;
  recommendedSkills?: Array<{ name: string; purpose?: string[] }>;
  recommendedTools?: Array<{ name: string; purpose?: string[] }>;
};

export type HermesPlanningOutput = {
  pmPlanningAdvice: string;
  problemAndUsers: string;
  coreFeatures: string[];
};

export type HermesEvaluationInput = EvaluationInput & {
  projectId: string;
  prd: string;
  differentiation: unknown;
  competitorMatrix: unknown[];
  previousHermesResearch?: unknown;
};

export type HermesEvaluationOutput = EvaluationResult;

export type HermesRunStatus = "queued" | "running" | "completed" | "failed" | "completed_without_output" | "completed_with_fallback";
export type HermesMode = "real" | "mock" | "local";

export type HermesRunResult = {
  hermesRunId: string;
  mode: HermesMode;
  status: HermesRunStatus;
  rawOutput: string;
  parsedOutput?: HermesResearchOutput;
  resourceUsage?: {
    mode: "manual" | "auto";
    skills: Array<{ name: string; path?: string; purpose?: string[]; callCount?: number; status?: "used" | "planned" | "not_reported"; reason?: string }>;
    tools: Array<{ name: string; path?: string; purpose?: string[]; callCount?: number; status?: "used" | "planned" | "not_reported"; reason?: string }>;
    raw?: unknown;
  };
};

export type HermesEvent = {
  id: string;
  at: string;
  message: string;
  level: "info" | "warning" | "error";
};
