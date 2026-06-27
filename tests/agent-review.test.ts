import { describe, expect, it } from "vitest";
import { evaluateGatePolicy, maxDecision } from "@/lib/agents/gate-policy";
import { agentKeysForMode, agentRegistry } from "@/lib/agents/registry";
import { createAgentReviewSchema } from "@/lib/agents/schemas";
import { normalizeAgentOutputForReview } from "@/lib/agents/runtime";

describe("agent review gate policy", () => {
  it("blocks when a critical consensus finding is open", () => {
    const result = evaluateGatePolicy({
      targetType: "codex_pack",
      consensusFindings: [{ severity: "critical", status: "open" }],
      agentRuns: [{ agentKey: "qa-agent", status: "succeeded" }]
    });

    expect(result.decision).toBe("blocked");
    expect(result.counts.critical).toBe(1);
  });

  it("counts only open findings for gate decisions", () => {
    const result = evaluateGatePolicy({
      targetType: "prd",
      consensusFindings: [
        { severity: "critical", status: "superseded" },
        { severity: "high", status: "resolved" },
        { severity: "medium", status: "open" }
      ],
      agentRuns: [{ agentKey: "product-agent", status: "succeeded" }]
    });

    expect(result.decision).toBe("pass");
    expect(result.counts.critical).toBe(0);
    expect(result.counts.high).toBe(0);
  });

  it("does not allow LLM suggested decision to downgrade deterministic severity", () => {
    expect(maxDecision("blocked", "pass")).toBe("blocked");
    expect(maxDecision("needs_revision", "pass")).toBe("needs_revision");
  });

  it("blocks release if release-agent did not succeed", () => {
    const result = evaluateGatePolicy({
      targetType: "release",
      consensusFindings: [],
      agentRuns: [{ agentKey: "qa-agent", status: "succeeded" }]
    });

    expect(result.decision).toBe("blocked");
  });
});

describe("agent registry", () => {
  it("declares selective context keys for every non-synthesizer agent", () => {
    const definitions = Object.values(agentRegistry).filter((agent) => agent.key !== "synthesizer-agent");

    expect(definitions.length).toBeGreaterThan(0);
    definitions.forEach((definition) => {
      expect(definition.contextKeys.length).toBeGreaterThan(0);
      expect(definition.contextKeys.length).toBeLessThan(8);
    });
  });

  it("maps review modes to deterministic agent sets", () => {
    expect(agentKeysForMode("fast")).toEqual(["product-agent", "engineering-agent", "qa-agent"]);
    expect(agentKeysForMode("default")).toContain("architecture-agent");
    expect(agentKeysForMode("strict")).toContain("release-agent");
  });
});

describe("agent review request schema", () => {
  it("accepts a codex_pack review request", () => {
    const parsed = createAgentReviewSchema.parse({
      targetType: "codex_pack",
      mode: "default",
      force: true
    });

    expect(parsed).toMatchObject({ targetType: "codex_pack", mode: "default", force: true });
  });
});

describe("agent review output normalization", () => {
  it("normalizes model confidence and missing dedupe keys before schema validation", () => {
    const output = normalizeAgentOutputForReview({
      summary: "Needs changes.",
      decisionSuggestion: "warn",
      findings: [
        {
          severity: "major",
          category: "product",
          title: "Clarify scope",
          description: "The scope is ambiguous.",
          confidence: 85,
          evidence: [{ sourceType: "prd", quote: "TBD" }]
        },
        {
          severity: "high",
          category: "unknown",
          title: "Add tests",
          description: "Test coverage is underspecified.",
          confidence: "62%"
        }
      ]
    }, "product-agent");

    expect(output.decisionSuggestion).toBe("pass");
    expect(output.findings[0]).toMatchObject({
      severity: "medium",
      category: "product",
      confidence: 0.85,
      dedupeKey: "product-clarify-scope"
    });
    expect(output.findings[1]).toMatchObject({
      severity: "high",
      category: "engineering",
      confidence: 0.62,
      dedupeKey: "engineering-add-tests"
    });
  });

  it("uses a caller-provided fallback for missing synthesizer fields", () => {
    const output = normalizeAgentOutputForReview({}, "synthesizer-agent", {
      summary: "Rule blocked the review because a critical finding is open.",
      decisionSuggestion: "blocked",
      findings: []
    });

    expect(output).toMatchObject({
      summary: "Rule blocked the review because a critical finding is open.",
      decisionSuggestion: "blocked"
    });
  });
});
