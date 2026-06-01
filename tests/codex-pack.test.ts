import { describe, expect, it } from "vitest";
import { evaluateProject } from "@/lib/evaluation/engine";
import { generateCodexPack } from "@/lib/export/codex-pack";
import { createMockHermesOutput } from "@/lib/hermes/mock";

describe("Codex Pack generator", () => {
  it("generates all required files and a complete codex prompt", () => {
    const project = { name: "SpecFlow", idea: "Build a decision gate", industry: "devtools", targetUser: "PMs" };
    const research = createMockHermesOutput({ projectId: "p1", ...project });
    const evaluation = evaluateProject({
      idea: project.idea,
      industry: project.industry,
      targetUser: project.targetUser,
      competitors: research.competitors.map((c) => ({ threatLevel: c.threat_level, reuseStrategy: c.reuse_strategy })),
      differentiationScore: research.differentiation.differentiation_score,
      prdMarkdown: "Product Goal Target Users Core Pain Points User Stories Acceptance Criteria Data Models API Contracts Non-goals",
      codexPackText: "Product Goal Tech Stack Pages Data Models API Contracts Tasks Acceptance Criteria Run Commands Security Boundaries"
    });

    const files = generateCodexPack(project, research, evaluation);
    expect(files.map((file) => file.filename)).toEqual([
      "README.md",
      "PRD.md",
      "competitor_report.md",
      "evaluation_report.md",
      "api_spec.md",
      "tasks.md",
      "codex_prompt.md",
      "monitor_plan.md"
    ]);
    expect(files.find((file) => file.filename === "codex_prompt.md")?.content).toContain("Security Boundaries");
    expect(files.find((file) => file.filename === "evaluation_report.md")?.content).toContain("Prompt Readiness Score");
  });
});
