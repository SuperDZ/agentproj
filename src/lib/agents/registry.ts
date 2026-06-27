import type { AgentContextKey, AgentReviewMode } from "@/lib/agents/schemas";

export type AgentDefinition = {
  key: string;
  role: string;
  label: string;
  promptVersion: string;
  contextKeys: AgentContextKey[];
  systemPrompt: string;
};

export const agentRegistry = {
  "research-agent": {
    key: "research-agent",
    role: "research",
    label: "Research Agent",
    promptVersion: "research-agent@1.0.0",
    contextKeys: ["projectSummary", "researchSummary", "competitorSummary"],
    systemPrompt: [
      "You are a research review agent for SpecFlow Agent.",
      "Review market research completeness, factual consistency, competitor coverage, and differentiation evidence.",
      "Return only JSON matching the required schema."
    ].join("\n")
  },
  "product-agent": {
    key: "product-agent",
    role: "product",
    label: "Product Agent",
    promptVersion: "product-agent@1.0.0",
    contextKeys: ["projectSummary", "researchSummary", "prdSummary"],
    systemPrompt: [
      "You are a senior product review agent.",
      "Review user value, scope boundaries, acceptance criteria, and PRD clarity.",
      "Return only JSON matching the required schema."
    ].join("\n")
  },
  "architecture-agent": {
    key: "architecture-agent",
    role: "architecture",
    label: "Architecture Agent",
    promptVersion: "architecture-agent@1.0.0",
    contextKeys: ["prdSummary", "techStackSummary", "artifactManifest"],
    systemPrompt: [
      "You are a software architecture review agent.",
      "Review module boundaries, persistence, async execution, scalability, and data ownership.",
      "Architecture, security, and data-integrity risks outrank delivery schedule.",
      "Return only JSON matching the required schema."
    ].join("\n")
  },
  "engineering-agent": {
    key: "engineering-agent",
    role: "engineering",
    label: "Engineering Agent",
    promptVersion: "engineering-agent@1.0.0",
    contextKeys: ["prdSummary", "techStackSummary", "artifactManifest"],
    systemPrompt: [
      "You are an engineering implementation review agent.",
      "Review maintainability, type contracts, error handling, migration risk, and implementation complexity.",
      "Return only JSON matching the required schema."
    ].join("\n")
  },
  "qa-agent": {
    key: "qa-agent",
    role: "qa",
    label: "QA Agent",
    promptVersion: "qa-agent@1.0.0",
    contextKeys: ["prdSummary", "techStackSummary", "evaluationSummary"],
    systemPrompt: [
      "You are a QA lead review agent.",
      "Review acceptance criteria, regression coverage, boundary cases, and release testability.",
      "Return only JSON matching the required schema."
    ].join("\n")
  },
  "release-agent": {
    key: "release-agent",
    role: "release",
    label: "Release Agent",
    promptVersion: "release-agent@1.0.0",
    contextKeys: ["techStackSummary", "artifactManifest", "environmentSummary"],
    systemPrompt: [
      "You are a release readiness review agent.",
      "Review migration, environment, rollback, deployment, and operational readiness risks.",
      "Return only JSON matching the required schema."
    ].join("\n")
  },
  "synthesizer-agent": {
    key: "synthesizer-agent",
    role: "synthesizer",
    label: "Synthesizer Agent",
    promptVersion: "synthesizer-agent@1.0.0",
    contextKeys: ["projectSummary", "artifactManifest", "environmentSummary"],
    systemPrompt: [
      "You are the consensus synthesizer for a multi-agent review.",
      "You must include these sections: Executive Summary, Consensus Decision, Top Findings, Conflict & Tradeoffs, Recommended Next Actions.",
      "Conflict hierarchy: security > architecture > data integrity > release safety > engineering maintainability > QA coverage > product schedule > presentation polish.",
      "Do not downgrade high or critical technical risk because of product schedule pressure.",
      "Return only JSON matching the required schema."
    ].join("\n")
  }
} satisfies Record<string, AgentDefinition>;

export type AgentKey = keyof typeof agentRegistry;

export function getAgentDefinition(agentKey: string) {
  const definition = agentRegistry[agentKey as AgentKey];
  if (!definition) throw new Error(`Unknown agent key: ${agentKey}`);
  return definition;
}

export function agentKeysForMode(mode: AgentReviewMode = "default") {
  if (mode === "fast") return ["product-agent", "engineering-agent", "qa-agent"];
  if (mode === "strict") {
    return ["research-agent", "product-agent", "architecture-agent", "engineering-agent", "qa-agent", "release-agent"];
  }
  return ["research-agent", "product-agent", "architecture-agent", "engineering-agent", "qa-agent"];
}
