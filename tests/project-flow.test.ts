import { describe, expect, it } from "vitest";
import {
  getLatestCodexPackArtifacts,
  getLatestResearch,
  isReportAssistantReady,
  normalizeInitialProjectPlanning,
  parseReportAssistantContext,
  parseTechStackRecommendations
} from "@/lib/services/project-flow";
import { createMockHermesOutput } from "@/lib/hermes/mock";

describe("project-flow helpers", () => {
  it("does not fall back to stale research when the latest run has no parsed output", () => {
    const oldOutput = createMockHermesOutput({ projectId: "p1", idea: "Old", industry: "devtools", targetUser: "PMs" });
    const project = {
      researchRuns: [
        { parsedOutputJson: null },
        { parsedOutputJson: JSON.stringify(oldOutput) }
      ]
    };

    expect(getLatestResearch(project as never)).toBeUndefined();
  });

  it("deduplicates Codex Pack artifacts by newest artifact type", () => {
    const project = {
      artifacts: [
        { artifactType: "PRD.md", content: "new prd" },
        { artifactType: "README.md", content: "readme" },
        { artifactType: "PRD.md", content: "old prd" },
        { artifactType: "unrelated", content: "skip" }
      ]
    };

    expect(getLatestCodexPackArtifacts(project as never).map((artifact) => artifact.content)).toEqual(["new prd", "readme"]);
  });

  it("requires confirmed problem/users and three to five core features before research", () => {
    const project = {
      artifacts: [
        {
          artifactType: "report_assistant_context",
          content: JSON.stringify({
            problemAndUsers: "客户经理需要在推荐财富产品前完成适当性解释。",
            coreFeatures: ["用户画像", "产品匹配", "风险解释"]
          })
        }
      ]
    };

    const context = parseReportAssistantContext(project);
    expect(isReportAssistantReady(context)).toBe(true);
    expect(isReportAssistantReady({ problemAndUsers: "", coreFeatures: ["a", "b", "c"] })).toBe(false);
    expect(isReportAssistantReady({ problemAndUsers: "x", coreFeatures: ["a", "b"] })).toBe(false);
  });

  it("normalizes tech stack recommendation list fields from model artifacts", () => {
    const project = {
      artifacts: [
        {
          artifactType: "tech_stack_recommendations",
          content: JSON.stringify([
            {
              id: "next",
              name: "Next.js",
              reason: "适合快速交付。",
              components: "Next.js App Router",
              risks: "需要控制服务端和客户端职责边界。",
              recommendation: "high"
            }
          ])
        }
      ]
    };

    expect(parseTechStackRecommendations(project)).toEqual([
      {
        id: "next",
        name: "Next.js",
        reason: "适合快速交付。",
        components: ["Next.js App Router"],
        risks: ["需要控制服务端和客户端职责边界。"],
        recommendation: "high"
      }
    ]);
  });

  it("falls back when initial planning model output misses required fields", () => {
    const fallback = {
      pmPlanningAdvice: "先确认问题。",
      problemAndUsers: "客户经理需要完成产品适当性解释。",
      coreFeatures: ["用户画像", "产品匹配", "风险解释"]
    };

    expect(normalizeInitialProjectPlanning({}, fallback)).toEqual(fallback);
    expect(normalizeInitialProjectPlanning({ pmPlanningAdvice: "模型建议", coreFeatures: ["A", "B"] }, fallback)).toEqual({
      pmPlanningAdvice: "模型建议",
      problemAndUsers: fallback.problemAndUsers,
      coreFeatures: fallback.coreFeatures
    });
  });
});
