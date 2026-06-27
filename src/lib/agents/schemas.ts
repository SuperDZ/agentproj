import { z } from "zod";

export const agentTargetTypes = ["research", "prd", "codex_pack", "release", "ppt"] as const;
export const agentReviewModes = ["fast", "default", "strict"] as const;
export const agentDecisions = ["pass", "needs_revision", "blocked"] as const;
export const findingSeverities = ["info", "low", "medium", "high", "critical"] as const;
export const findingCategories = [
  "research",
  "product",
  "architecture",
  "engineering",
  "qa",
  "release",
  "security",
  "cost",
  "data_integrity",
  "presentation"
] as const;

export type AgentTargetType = typeof agentTargetTypes[number];
export type AgentReviewMode = typeof agentReviewModes[number];
export type AgentDecision = typeof agentDecisions[number];
export type FindingSeverity = typeof findingSeverities[number];
export type FindingCategory = typeof findingCategories[number];

export const createAgentReviewSchema = z.object({
  targetType: z.enum(agentTargetTypes),
  targetArtifactId: z.string().min(1).optional(),
  agentKeys: z.array(z.string().min(1)).min(1).optional(),
  mode: z.enum(agentReviewModes).default("default").optional(),
  force: z.boolean().default(false).optional()
});

export const agentEvidenceSchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().optional(),
  quote: z.string().optional()
});

export const agentFindingInputSchema = z.object({
  severity: z.enum(findingSeverities),
  category: z.enum(findingCategories),
  title: z.string().min(1).max(180),
  description: z.string().min(1).max(3000),
  evidence: z.array(agentEvidenceSchema).default([]),
  recommendation: z.string().max(3000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  dedupeKey: z.string().min(1).max(220)
});

export const agentOutputSchema = z.object({
  summary: z.string().min(1).max(5000),
  decisionSuggestion: z.enum(agentDecisions),
  findings: z.array(agentFindingInputSchema).default([])
});

export type AgentFindingInput = z.infer<typeof agentFindingInputSchema>;
export type AgentOutput = z.infer<typeof agentOutputSchema>;

export type AgentContextKey =
  | "projectSummary"
  | "researchSummary"
  | "prdSummary"
  | "techStackSummary"
  | "competitorSummary"
  | "evaluationSummary"
  | "artifactManifest"
  | "environmentSummary";

export type AgentReviewSnapshot = {
  projectId: string;
  targetType: AgentTargetType;
  targetArtifactId?: string;
  targetChecksum?: string;
  projectSummary: string;
  researchSummary: string;
  prdSummary: string;
  techStackSummary: string;
  competitorSummary: string;
  evaluationSummary: string;
  artifactManifest: Array<{ id: string; artifactType: string; createdAt: string; size?: number }>;
  environmentSummary: string;
  createdAt: string;
  schemaVersion: "1.0";
};
