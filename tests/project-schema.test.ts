import { describe, expect, it } from "vitest";
import { createProjectSchema } from "@/lib/project-schema";

describe("project schema", () => {
  it("parses boolean-like values without treating false as true", () => {
    const parsed = createProjectSchema.parse({
      idea: "Build SpecFlow",
      industry: "devtools",
      targetUser: "PMs",
      needFinancialSuitabilityCheck: "false",
      needContinuousCompetitorMonitoring: "true"
    });

    expect(parsed.needFinancialSuitabilityCheck).toBe(false);
    expect(parsed.needContinuousCompetitorMonitoring).toBe(true);
  });

  it("rejects empty ideas", () => {
    expect(() => createProjectSchema.parse({ idea: "", industry: "devtools", targetUser: "PMs" })).toThrow();
  });

  it("disables financial suitability checks outside financial industries", () => {
    const parsed = createProjectSchema.parse({
      idea: "Build a workflow tool",
      industry: "enterprise SaaS",
      targetUser: "PMs",
      needFinancialSuitabilityCheck: "true",
      needContinuousCompetitorMonitoring: "false"
    });

    expect(parsed.needFinancialSuitabilityCheck).toBe(false);
  });

  it("keeps monitor task preferences and cadence", () => {
    const parsed = createProjectSchema.parse({
      idea: "Build a competitor monitoring product",
      industry: "fintech",
      targetUser: "PMs",
      needFinancialSuitabilityCheck: "true",
      needContinuousCompetitorMonitoring: "true",
      monitorTasks: "pricing changes, regulatory signals",
      monitorTaskConfigs: JSON.stringify([{ task: "pricing changes", startAt: "2026-06-04", cadence: "daily" }])
    });

    expect(parsed.needFinancialSuitabilityCheck).toBe(true);
    expect(parsed.monitorTasks).toBe("pricing changes, regulatory signals");
    expect(parsed.monitorTaskConfigs[0]).toEqual({ task: "pricing changes", startAt: "2026-06-04", cadence: "daily" });
  });

  it("keeps interview discovery context and core features", () => {
    const parsed = createProjectSchema.parse({
      idea: "Build an interview prep workflow",
      industry: "fintech",
      targetUser: "PM candidates",
      needFinancialSuitabilityCheck: "true",
      needContinuousCompetitorMonitoring: "true",
      problemDiscovery: "Interviewers need to see reasoning before screens.",
      requirementDefinition: "Export PRD, prototype, PPT, and coding plan.",
      coreFeatures: "discovery, scope, pptx",
      modelProvider: "codex-cli",
      modelName: "codex-cli-default",
      modelUsageMode: "codex-cli",
      codexCliCommand: "codex"
    });

    expect(parsed.problemDiscovery).toContain("reasoning");
    expect(parsed.requirementDefinition).toContain("PRD");
    expect(parsed.coreFeatures).toBe("discovery, scope, pptx");
    expect(parsed.modelConfig.provider).toBe("codex-cli");
    expect(parsed.modelConfig.codexCliCommand).toBe("codex");
  });
});
