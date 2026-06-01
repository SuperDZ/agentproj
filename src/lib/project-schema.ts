import { z } from "zod";

export const booleanLike = z
  .union([z.boolean(), z.enum(["true", "false"]), z.literal("on")])
  .optional()
  .transform((value) => value === true || value === "true" || value === "on");

export const createProjectSchema = z.object({
  name: z.string().trim().optional(),
  idea: z.string().trim().min(1, "Product idea is required."),
  industry: z.string().trim().min(1, "Industry is required.").default("general"),
  targetUser: z.string().trim().min(1, "Target user is required.").default("product team"),
  needFinancialSuitabilityCheck: booleanLike,
  needContinuousCompetitorMonitoring: booleanLike,
  preferredTechStack: z.string().trim().optional().nullable()
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export function projectNameFromIdea(idea: string) {
  return idea.split(/[，。,.]/)[0].slice(0, 48) || "Untitled SpecFlow Project";
}
