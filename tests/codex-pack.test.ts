import { describe, expect, it } from "vitest";
import { evaluateProject } from "@/lib/evaluation/engine";
import { generateCodexPack, generateProductPrdMarkdown } from "@/lib/export/codex-pack";
import { createMockHermesOutput } from "@/lib/hermes/mock";

describe("Codex Pack generator", () => {
  it("generates all required files and a complete codex prompt", () => {
    const project = {
      name: "SpecFlow",
      idea: "Build a decision gate",
      industry: "devtools",
      targetUser: "PMs",
      interviewContext: {
        problemDiscovery: "Candidates need a defensible interview story before coding.",
        requirementDefinition: "The first demo must export PRD, prototype, PPT, and coding handoff.",
        coreFeatures: ["Interview discovery", "Top 3 scope", "PPTX export"]
      }
    };
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
      "interview_runbook.md",
      "prototype_spec.md",
      "prototype_wireframe.svg",
      "pitch_deck_outline.md",
      "competitor_report.md",
      "evaluation_report.md",
      "api_spec.md",
      "tasks.md",
      "codex_prompt.md",
      "vibe_coding_plan.md",
      "tool_skill_plan.md",
      "monitor_plan.md"
    ]);
    expect(files.find((file) => file.filename === "codex_prompt.md")?.content).toContain("Security Boundaries");
    expect(files.find((file) => file.filename === "evaluation_report.md")?.content).toContain("Prompt（提示词）就绪分");
    expect(files.find((file) => file.filename === "interview_runbook.md")?.content).toContain("90 分钟面试运行手册");
    expect(files.find((file) => file.filename === "prototype_spec.md")?.content).toContain("页面流");
    expect(files.find((file) => file.filename === "prototype_wireframe.svg")?.content).toContain("<svg");
    expect(files.find((file) => file.filename === "pitch_deck_outline.md")?.content).toContain("路演大纲");
    expect(files.find((file) => file.filename === "vibe_coding_plan.md")?.content).toContain("Vibe Coding（氛围式编码）实施计划");
    expect(files.find((file) => file.filename === "PRD.md")?.content).toContain("Candidates need a defensible interview story");
    expect(files.find((file) => file.filename === "prototype_wireframe.svg")?.content).toContain("Interview discovery");
  });

  it("generates a PRD from planning advice, report assistant context, and Hermes research", () => {
    const project = {
      name: "SpecFlow",
      idea: "AI product decision workspace",
      industry: "devtools",
      targetUser: "product managers",
      planningAdvice: "Focus on validated product scope before implementation.",
      interviewContext: {
        problemDiscovery: "PMs need to validate users and scope before coding.",
        requirementDefinition: "The first version must produce a credible handoff.",
        coreFeatures: ["Scope confirmation", "Competitor evidence", "PRD export"]
      }
    };
    const research = createMockHermesOutput({ projectId: "p1", ...project });

    const prd = generateProductPrdMarkdown(project, research);

    expect(prd).toContain("Focus on validated product scope");
    expect(prd).toContain("Scope confirmation");
    expect(prd).toContain(research.competitors[0].name);
    expect(prd).toContain("Hermes 前一轮调研");
    expect(prd).toContain("不能伪造竞品内部 PRD");
  });

  it("includes optional Evidence PDRS, Roadmap, and PRD Review artifacts in the pack", () => {
    const project = {
      name: "SpecFlow",
      idea: "Build a decision gate",
      industry: "devtools",
      targetUser: "PMs",
      supplementalArtifacts: [
        { filename: "EVIDENCE_PDRS.md", content: "# Evidence-based PDRS" },
        { filename: "ROADMAP.md", content: "# Roadmap" },
        { filename: "PRD_REVIEW.md", content: "# PRD Review Gate\n\n> Gate 未完成，不能作为 Codex Pack 交接依据。" }
      ]
    };
    const research = createMockHermesOutput({ projectId: "p1", ...project });
    const evaluation = evaluateProject({
      idea: project.idea,
      industry: project.industry,
      targetUser: project.targetUser,
      competitors: research.competitors.map((c) => ({ threatLevel: c.threat_level, reuseStrategy: c.reuse_strategy })),
      differentiationScore: research.differentiation.differentiation_score,
      prdMarkdown: "Product Goal Target Users Core Pain Points User Stories Acceptance Criteria Data Models API Contracts Non-goals"
    });

    const files = generateCodexPack(project, research, evaluation);

    expect(files.map((file) => file.filename)).toEqual(expect.arrayContaining(["EVIDENCE_PDRS.md", "ROADMAP.md", "PRD_REVIEW.md"]));
    expect(files.find((file) => file.filename === "PRD_REVIEW.md")?.content).toContain("Gate 未完成，不能作为 Codex Pack 交接依据");
  });
});
