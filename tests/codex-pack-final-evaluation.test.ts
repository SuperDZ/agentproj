import { describe, expect, it } from "vitest";
import { evaluateProject } from "@/lib/evaluation/engine";
import { generateCodexPack, packToClipboardText } from "@/lib/export/codex-pack";
import { createMockHermesOutput } from "@/lib/hermes/mock";

describe("Codex Pack final evaluation", () => {
  it("allows prompt readiness to be recomputed from generated pack files", () => {
    const project = { name: "SpecFlow", idea: "Build a competitive decision gate", industry: "devtools", targetUser: "PMs" };
    const research = createMockHermesOutput({ projectId: "p1", ...project });
    const provisional = evaluateProject({
      idea: project.idea,
      industry: project.industry,
      targetUser: project.targetUser,
      competitors: research.competitors.map((competitor) => ({ threatLevel: competitor.threat_level, reuseStrategy: competitor.reuse_strategy })),
      differentiationScore: research.differentiation.differentiation_score,
      prdMarkdown: "Product Goal Target Users Core Pain Points User Stories Acceptance Criteria Data Models API Contracts Non-goals"
    });
    const files = generateCodexPack(project, research, provisional);
    const finalEvaluation = evaluateProject({
      idea: project.idea,
      industry: project.industry,
      targetUser: project.targetUser,
      competitors: research.competitors.map((competitor) => ({ threatLevel: competitor.threat_level, reuseStrategy: competitor.reuse_strategy })),
      differentiationScore: research.differentiation.differentiation_score,
      prdMarkdown: files.find((file) => file.filename === "PRD.md")?.content ?? "",
      codexPackText: packToClipboardText(files)
    });

    expect(finalEvaluation.promptReadinessScore.score).toBe(100);
  });
});
