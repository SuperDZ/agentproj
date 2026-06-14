import { describe, expect, it } from "vitest";
import { createMockResearchRun } from "@/lib/hermes/mock";
import { parseHermesResearchOutput } from "@/lib/hermes/parser";

describe("Hermes mock adapter", () => {
  it("returns schema-valid research output with at least seven competitors", async () => {
    const run = await createMockResearchRun({
      projectId: "p1",
      idea: "为客户经理设计一个 AI 财富产品推荐系统",
      industry: "fintech",
      targetUser: "customer managers"
    });

    expect(run.mode).toBe("mock");
    expect(run.status).toBe("completed");
    const parsed = parseHermesResearchOutput(run.rawOutput);
    expect(parsed.competitors.length).toBeGreaterThanOrEqual(7);
    expect(parsed.differentiation.should_build).toContain("通用应用生成器");
    expect(parsed.summary).toContain("Hermes（智能体运行框架）");
  });
});
