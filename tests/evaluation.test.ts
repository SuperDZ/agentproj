import { describe, expect, it } from "vitest";
import { evaluateProject } from "@/lib/evaluation/engine";

describe("evaluation engine", () => {
  it("computes PDRS and decision with explainable sub-scores", () => {
    const result = evaluateProject({
      idea: "Build a competitive-research-aware product decision and Codex handoff agent for AI coding teams.",
      industry: "AI devtools",
      targetUser: "founders and PMs",
      competitors: Array.from({ length: 7 }, (_, index) => ({ threatLevel: 50 + index, reuseStrategy: "reference_only" })),
      differentiationScore: 88,
      prdMarkdown: "Product Goal Target Users Core Pain Points User Stories Acceptance Criteria Data Models API Contracts Non-goals",
      codexPackText: "Product Goal Tech Stack Pages Data Models API Contracts Tasks Acceptance Criteria Run Commands Security Boundaries"
    });

    expect(result.pdrs).toBeGreaterThanOrEqual(70);
    expect(result.decision).toMatch(/export/);
    expect(result.opportunityScore.reasons.length).toBeGreaterThan(0);
    expect(result.specificationScore.score).toBe(100);
  });
});
