export type ScoreReason = { score: number; reasons: string[] };
export type EvaluationInput = {
  idea: string;
  industry: string;
  targetUser: string;
  competitors: Array<{ threatLevel: number; reuseStrategy: string }>;
  differentiationScore: number;
  prdMarkdown: string;
  codexPackText?: string;
};

export type EvaluationResult = {
  pdrs: number;
  opportunityScore: ScoreReason;
  competitiveScore: ScoreReason;
  specificationScore: ScoreReason;
  prototypeScore: ScoreReason;
  promptReadinessScore: ScoreReason;
  redundancyRisk: number;
  differentiationScore: number;
  decision: "export" | "export_with_risk" | "revise_before_export" | "abandon_or_reframe";
  risks: string[];
  nextActions: string[];
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const has = (text: string, words: string[]) => words.some((word) => text.toLowerCase().includes(word.toLowerCase()));

export function scoreOpportunity(input: EvaluationInput): ScoreReason {
  const reasons: string[] = [];
  let score = 20;
  if (input.idea.length > 30) { score += 25; reasons.push("Product idea has enough detail for initial scoping."); }
  else reasons.push("Product idea is short and should be expanded.");
  if (input.targetUser.length > 3) { score += 20; reasons.push("Target user is explicit."); }
  else reasons.push("Target user is not explicit.");
  if (input.industry.length > 3) { score += 15; reasons.push("Industry context is present."); }
  if (has(input.idea, ["MVP", "workflow", "agent", "decision", "handoff", "customer", "manager", "客户"])) { score += 20; reasons.push("Idea appears feasible for an MVP workflow."); }
  return { score: clamp(score), reasons };
}

export function scoreCompetitive(input: EvaluationInput): ScoreReason {
  const reasons: string[] = [];
  const competitorCountScore = Math.min(input.competitors.length * 8, 40);
  const avgThreat = input.competitors.length ? input.competitors.reduce((sum, c) => sum + c.threatLevel, 0) / input.competitors.length : 100;
  const reusable = input.competitors.filter((c) => ["reuse", "reference_only", "fork"].includes(c.reuseStrategy)).length;
  const score = competitorCountScore + (100 - avgThreat) * 0.25 + reusable * 3 + input.differentiationScore * 0.25;
  reasons.push(`${input.competitors.length} competitors documented for comparison.`);
  reasons.push(`Average threat is ${Math.round(avgThreat)}, balanced by differentiation score ${input.differentiationScore}.`);
  reasons.push(`${reusable} competitors have reusable or reference-only lessons.`);
  return { score: clamp(score), reasons };
}

export function scoreSpecification(input: EvaluationInput): ScoreReason {
  const checks = [
    ["target users", ["Target Users", "目标用户"]],
    ["pain points", ["Pain Points", "痛点"]],
    ["user stories", ["User Stories", "用户故事"]],
    ["acceptance criteria", ["Acceptance Criteria", "验收"]],
    ["data models", ["Data Models", "数据模型"]],
    ["API contracts", ["API Contracts", "API"]]
  ] as const;
  const reasons: string[] = [];
  const hits = checks.filter(([label, terms]) => {
    const ok = has(input.prdMarkdown, terms);
    reasons.push(`${ok ? "Includes" : "Missing"} ${label}.`);
    return ok;
  }).length;
  return { score: clamp((hits / checks.length) * 100), reasons };
}

export function scorePrototype(input: EvaluationInput): ScoreReason {
  const checks = ["Idea", "Hermes Research", "Competitor Matrix", "PDRS", "Codex Pack", "Monitor Plan", "Non-goals", "Run Commands"];
  const reasons: string[] = [];
  const joined = `${input.prdMarkdown}\n${input.codexPackText ?? ""}`;
  const hits = checks.filter((term) => {
    const ok = has(joined, [term]);
    reasons.push(`${ok ? "Covers" : "Does not cover"} ${term}.`);
    return ok;
  }).length;
  return { score: clamp((hits / checks.length) * 100), reasons };
}

export function scorePromptReadiness(input: EvaluationInput): ScoreReason {
  const text = input.codexPackText || input.prdMarkdown;
  const checks = ["Product Goal", "Tech Stack", "Pages", "Data Models", "API Contracts", "Tasks", "Acceptance Criteria", "Run Commands", "Security Boundaries"];
  const reasons = checks.map((term) => `${has(text, [term]) ? "Ready" : "Needs detail"}: ${term}.`);
  const hits = checks.filter((term) => has(text, [term])).length;
  return { score: clamp((hits / checks.length) * 100), reasons };
}

export function evaluateProject(input: EvaluationInput): EvaluationResult {
  const opportunityScore = scoreOpportunity(input);
  const competitiveScore = scoreCompetitive(input);
  const specificationScore = scoreSpecification(input);
  const prototypeScore = scorePrototype(input);
  const promptReadinessScore = scorePromptReadiness(input);
  const pdrs = Number((
    opportunityScore.score * 0.25 +
    competitiveScore.score * 0.25 +
    specificationScore.score * 0.25 +
    prototypeScore.score * 0.15 +
    promptReadinessScore.score * 0.1
  ).toFixed(1));
  const decision = pdrs >= 85 ? "export" : pdrs >= 70 ? "export_with_risk" : pdrs >= 50 ? "revise_before_export" : "abandon_or_reframe";
  const redundancyRisk = clamp(100 - input.differentiationScore * 0.6 + (input.competitors.length > 6 ? 20 : 35));
  return {
    pdrs,
    opportunityScore,
    competitiveScore,
    specificationScore,
    prototypeScore,
    promptReadinessScore,
    redundancyRisk,
    differentiationScore: input.differentiationScore,
    decision,
    risks: [
      "Do not drift into another generic AI app builder.",
      "Third-party skills are reference-only until reviewed.",
      "Financial suitability output must not promise guaranteed returns or no-risk outcomes."
    ],
    nextActions: decision === "abandon_or_reframe"
      ? ["Reframe target user and differentiated workflow before export."]
      : ["Export Codex Pack.", "Run one manual review of security and financial claims.", "Schedule competitor drift monitoring."]
  };
}
