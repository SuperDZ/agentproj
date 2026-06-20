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
const has = (text: string, words: readonly string[]) => words.some((word) => text.toLowerCase().includes(word.toLowerCase()));

export function scoreOpportunity(input: EvaluationInput): ScoreReason {
  const reasons: string[] = [];
  let score = 20;
  if (input.idea.length > 30) {
    score += 25;
    reasons.push("命题具备初始范围定义所需的信息量。");
  } else {
    reasons.push("命题较短，需要补充业务背景。");
  }
  if (input.targetUser.length > 3) {
    score += 20;
    reasons.push("目标用户明确。");
  }
  if (input.industry.length > 3) {
    score += 15;
    reasons.push("行业语境明确。");
  }
  if (has(input.idea, ["MVP", "workflow", "agent", "decision", "handoff", "customer", "manager", "客户", "工作流", "决策", "交接", "智能体"])) {
    score += 20;
    reasons.push("命题具备 MVP（最小可行产品）工作流可行性。");
  }
  return { score: clamp(score), reasons };
}

export function scoreCompetitive(input: EvaluationInput): ScoreReason {
  const reasons: string[] = [];
  const competitorCountScore = Math.min(input.competitors.length * 8, 40);
  const avgThreat = input.competitors.length ? input.competitors.reduce((sum, item) => sum + item.threatLevel, 0) / input.competitors.length : 100;
  const reusable = input.competitors.filter((item) => ["reuse", "reference_only", "fork"].includes(item.reuseStrategy)).length;
  const score = competitorCountScore + (100 - avgThreat) * 0.25 + reusable * 3 + input.differentiationScore * 0.25;
  reasons.push(`已记录 ${input.competitors.length} 个竞品用于对比。`);
  reasons.push(`平均威胁等级为 ${Math.round(avgThreat)}，差异化分数为 ${input.differentiationScore}。`);
  reasons.push(`${reusable} 个竞品存在可复用或仅供参考的经验。`);
  return { score: clamp(score), reasons };
}

export function scoreSpecification(input: EvaluationInput): ScoreReason {
  const checks = [
    ["目标用户", ["Target Users", "目标用户"]],
    ["痛点", ["Pain Points", "核心痛点", "痛点"]],
    ["用户故事", ["User Stories", "用户故事"]],
    ["验收标准", ["Acceptance Criteria", "验收标准", "验收"]],
    ["数据模型", ["Data Models", "数据模型"]],
    ["API 合约", ["API Contracts", "API 合约", "API"]]
  ] as const;
  const reasons: string[] = [];
  const hits = checks.filter(([label, terms]) => {
    const ok = has(input.prdMarkdown, terms);
    reasons.push(`${ok ? "包含" : "缺少"}${label}。`);
    return ok;
  }).length;
  return { score: clamp((hits / checks.length) * 100), reasons };
}

export function scorePrototype(input: EvaluationInput): ScoreReason {
  const checks = [
    ["命题", ["Idea", "命题"]],
    ["Hermes 研究", ["Hermes Research", "Hermes 研究"]],
    ["竞品矩阵", ["Competitor Matrix", "竞品矩阵"]],
    ["PDRS", ["PDRS"]],
    ["Codex Pack", ["Codex Pack"]],
    ["监控计划", ["Monitor Plan", "监控计划"]],
    ["非目标", ["Non-goals", "非目标"]],
    ["运行命令", ["Run Commands", "运行命令"]]
  ] as const;
  const joined = `${input.prdMarkdown}\n${input.codexPackText ?? ""}`;
  const reasons: string[] = [];
  const hits = checks.filter(([label, terms]) => {
    const ok = has(joined, terms);
    reasons.push(`${ok ? "覆盖" : "未覆盖"}${label}。`);
    return ok;
  }).length;
  return { score: clamp((hits / checks.length) * 100), reasons };
}

export function scorePromptReadiness(input: EvaluationInput): ScoreReason {
  const text = input.codexPackText || input.prdMarkdown;
  const checks = [
    ["产品目标", ["Product Goal", "产品目标"]],
    ["技术栈", ["Tech Stack", "技术栈"]],
    ["页面", ["Pages", "页面"]],
    ["数据模型", ["Data Models", "数据模型"]],
    ["API 合约", ["API Contracts", "API 合约", "API"]],
    ["任务", ["Tasks", "任务"]],
    ["验收标准", ["Acceptance Criteria", "验收标准"]],
    ["运行命令", ["Run Commands", "运行命令"]],
    ["安全边界", ["Security Boundaries", "安全边界"]]
  ] as const;
  const reasons = checks.map(([label, terms]) => `${has(text, terms) ? "就绪" : "需要补充"}：${label}。`);
  const hits = checks.filter(([, terms]) => has(text, terms)).length;
  return { score: clamp((hits / checks.length) * 100), reasons };
}

export function evaluateProject(input: EvaluationInput): EvaluationResult {
  const opportunityScore = scoreOpportunity(input);
  const competitiveScore = scoreCompetitive(input);
  const specificationScore = scoreSpecification(input);
  const prototypeScore = scorePrototype(input);
  const promptReadinessScore = scorePromptReadiness(input);
  const pdrs = Number(
    (
      opportunityScore.score * 0.3 +
      competitiveScore.score * 0.2 +
      specificationScore.score * 0.25 +
      prototypeScore.score * 0.1 +
      promptReadinessScore.score * 0.15
    ).toFixed(1)
  );
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
      "不得漂移为通用 AI（人工智能）应用生成器。",
      "第三方 Skills（技能）在审查前只能作为参考。",
      "金融适当性输出不得承诺保本、收益确定或无风险。"
    ],
    nextActions:
      decision === "abandon_or_reframe"
        ? ["导出前重新定义目标用户和差异化工作流。"]
        : ["导出 Codex Pack（编码任务包）。", "人工复核安全边界和金融表述。", "安排竞品漂移监控。"]
  };
}
