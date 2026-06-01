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
});
