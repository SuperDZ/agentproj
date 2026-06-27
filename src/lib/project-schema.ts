import { z } from "zod";
import { defaultModelForProvider, modelProviderValues } from "@/lib/model/providers";

export const booleanLike = z
  .union([z.boolean(), z.enum(["true", "false"]), z.literal("on")])
  .optional()
  .transform((value) => value === true || value === "true" || value === "on");

export const monitorCadenceSchema = z.enum(["daily", "weekly", "monthly"]);

export const monitorTaskConfigSchema = z.object({
  task: z.string().trim().min(1),
  startAt: z.string().trim().min(1),
  cadence: monitorCadenceSchema
});

export const modelConfigSchema = z.object({
  provider: z.enum(modelProviderValues).default("deepseek"),
  model: z.string().trim().min(1).default("deepseek-chat"),
  usageMode: z.literal("api").default("api")
});

function parseMonitorTaskConfigs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return z.array(monitorTaskConfigSchema).parse(parsed);
  } catch {
    return [];
  }
}

export const createProjectSchema = z
  .object({
    name: z.string().trim().optional(),
    idea: z.string().trim().min(1, "Product idea is required."),
    ideaExplanation: z.string().trim().optional().nullable(),
    industry: z.string().trim().min(1, "Industry is required.").default("auto"),
    targetUser: z.string().trim().min(1, "Target user is required.").default("auto"),
    needFinancialSuitabilityCheck: booleanLike,
    needContinuousCompetitorMonitoring: booleanLike,
    preferredTechStack: z.string().trim().optional().nullable(),
    monitorTasks: z.string().trim().optional().nullable(),
    monitorTaskConfigs: z.unknown().transform(parseMonitorTaskConfigs),
    problemDiscovery: z.string().trim().optional().nullable(),
    requirementDefinition: z.string().trim().optional().nullable(),
    coreFeatures: z.string().trim().optional().nullable(),
    modelProvider: z.enum(modelProviderValues).default("deepseek"),
    modelName: z.string().trim().optional().nullable()
  })
  .transform((input) => ({
    ...input,
    needFinancialSuitabilityCheck: isFinancialIndustry(`${input.industry} ${input.idea} ${input.ideaExplanation ?? ""}`) && input.needFinancialSuitabilityCheck,
    preferredTechStack: input.preferredTechStack || null,
    modelConfig: modelConfigSchema.parse({
      provider: input.modelProvider,
      model: input.modelName || defaultModelForProvider(input.modelProvider),
      usageMode: "api"
    })
  }));

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export function projectNameFromIdea(idea: string) {
  return idea.split(/[,.，。；;!?！？]/)[0].trim().slice(0, 48) || "Untitled SpecFlow Project";
}

export function isFinancialIndustry(value: string) {
  return /金融|证券|银行|保险|理财|财富|fintech|finance|financial|bank|wealth|insurance|securities/i.test(value);
}
