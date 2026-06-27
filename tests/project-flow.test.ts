import { describe, expect, it } from "vitest";
import {
  aggregatePrdReviewGate,
  getLatestCodexPackArtifacts,
  getLatestResearch,
  isReviewerRole,
  isReportAssistantReady,
  mergePrdReviewReviewer,
  normalizeInitialProjectPlanning,
  normalizePrdReviewGate,
  normalizeRoadmap,
  parseReportAssistantContext,
  parseTechStackRecommendations,
  renderPrdReviewMarkdown
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

  it("aggregates PRD Review Gate only when all reviewers completed", () => {
    const reviewers = ["Product", "UX", "Engineering", "QA", "Compliance", "Business"].map((role) => ({
      role,
      status: "completed",
      verdict: "PASS",
      summary: `${role} passed`,
      findings: ["PRD is reviewable."],
      requiredChanges: [],
      suggestions: [],
      riskLevel: "LOW",
      confidence: 0.8
    }));

    const result = aggregatePrdReviewGate(reviewers as never);

    expect(result.status).toBe("completed");
    expect(result.gateDecision).toBe("PASS");
  });

  it("sets PRD Review Gate to BLOCK or WARN from completed reviewer verdicts", () => {
    const base = ["Product", "UX", "Engineering", "QA", "Compliance", "Business"].map((role) => ({
      role,
      status: "completed",
      verdict: "PASS",
      summary: `${role} passed`,
      findings: ["PRD is reviewable."],
      requiredChanges: [],
      suggestions: [],
      riskLevel: "LOW",
      confidence: 0.8
    }));

    expect(aggregatePrdReviewGate(base.map((item) => item.role === "QA" ? { ...item, verdict: "WARN" } : item) as never).gateDecision).toBe("WARN");
    expect(aggregatePrdReviewGate(base.map((item) => item.role === "Compliance" ? { ...item, verdict: "BLOCK" } : item) as never).gateDecision).toBe("BLOCK");
  });

  it("does not aggregate PRD Review Gate when a reviewer is missing, failed, or invalid", () => {
    const missing = normalizePrdReviewGate({
      reviewers: [
        { role: "Product", verdict: "PASS", summary: "ok", findings: ["ok"], requiredChanges: [], suggestions: [], riskLevel: "LOW", confidence: 0.8 }
      ]
    });
    const invalid = normalizePrdReviewGate({
      reviewers: ["Product", "UX", "Engineering", "QA", "Compliance", "Business"].map((role) => ({
        role,
        verdict: role === "UX" ? "MAYBE" : "PASS",
        summary: "ok",
        findings: role === "Engineering" ? [] : ["ok"],
        requiredChanges: [],
        suggestions: [],
        riskLevel: "LOW",
        confidence: role === "QA" ? undefined : 0.8
      }))
    });

    expect(missing.status).toBe("incomplete");
    expect(missing.gateDecision).toBeUndefined();
    expect(missing.missingReviewers).toContain("UX");
    expect(invalid.status).toBe("incomplete");
    expect(invalid.gateDecision).toBeUndefined();
    expect(invalid.failedReviewers).toEqual(expect.arrayContaining(["UX", "Engineering", "QA"]));
  });

  it("renders incomplete PRD Review Gate as not suitable for Codex handoff", () => {
    const result = normalizePrdReviewGate({ reviewers: [] });

    expect(renderPrdReviewMarkdown(result)).toContain("Gate 未完成，不能作为 Codex Pack 交接依据");
  });

  it("replaces only one PRD reviewer when regenerating a role", () => {
    const existing = normalizePrdReviewGate({
      reviewers: ["Product", "UX", "Engineering", "QA", "Compliance", "Business"].map((role) => ({
        role,
        verdict: "PASS",
        summary: `${role} original`,
        findings: ["ok"],
        requiredChanges: [],
        suggestions: [],
        riskLevel: "LOW",
        confidence: 0.8
      }))
    });

    const merged = mergePrdReviewReviewer(existing, {
      role: "UX",
      status: "completed",
      verdict: "BLOCK",
      summary: "UX regenerated",
      findings: ["主路径缺少错误状态。"],
      requiredChanges: ["补充错误状态。"],
      suggestions: [],
      riskLevel: "HIGH",
      confidence: 0.9
    }, "fixed-time");

    expect(merged.gateDecision).toBe("BLOCK");
    expect(merged.generatedAt).toBe("fixed-time");
    expect(merged.reviewers.find((reviewer) => reviewer.role === "UX")?.summary).toBe("UX regenerated");
    expect(merged.reviewers.find((reviewer) => reviewer.role === "Product")?.summary).toBe("Product original");
  });

  it("accepts only declared PRD reviewer roles", () => {
    expect(isReviewerRole("Product")).toBe(true);
    expect(isReviewerRole("Security")).toBe(false);
  });

  it("normalizes Roadmap enum fields to valid values", () => {
    const roadmap = normalizeRoadmap({
      items: [
        { title: "Build", stage: "bad", priority: "bad", type: "bad", acceptanceCriteria: "done" }
      ]
    }, { generatedAt: "now", items: [] });

    expect(roadmap.items[0].stage).toBe("NOW");
    expect(roadmap.items[0].priority).toBe("P0");
    expect(roadmap.items[0].type).toBe("RESEARCH");
  });
});
