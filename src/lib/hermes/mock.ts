import { evaluateProject } from "@/lib/evaluation/engine";
import type { CreatePlanningRunInput, CreateResearchRunInput, HermesEvaluationInput, HermesEvaluationOutput, HermesEvent, HermesPlanningOutput, HermesResearchOutput, HermesRunResult } from "./types";

export function createMockPlanningOutput(input: CreatePlanningRunInput): HermesPlanningOutput {
  return {
    pmPlanningAdvice: [
      `项目命题：${input.idea}`,
      input.explanation ? `补充解释：${input.explanation}` : "",
      `目标用户：${input.targetUser}`,
      `行业语境：${input.industry}`,
      "规划建议：先把汇报展示助手输入并入项目规划，明确问题、用户、边界和 3-5 个核心功能，再进入 Hermes 竞品调研。",
      "确认问题：目标用户是否存在高频、强痛点、可验证的决策或交付场景；当前方案是否能避免通用化与同质化。"
    ].filter(Boolean).join("\n"),
    problemAndUsers: `${input.targetUser} 在 ${input.industry} 场景中需要解决：${input.idea}`,
    coreFeatures: [
      "问题与用户确认",
      "Hermes 项目规划建议",
      "竞品矩阵与差异化判断",
      "PRD 生成与编辑",
      "PDRS 运行评估"
    ]
  };
}

export function createFallbackPlanningOutput(input: CreatePlanningRunInput): HermesPlanningOutput {
  const idea = input.idea.trim();
  const rawIndustry = input.industry.trim();
  const rawTargetUser = input.targetUser.trim();
  const industry = !rawIndustry || rawIndustry.toLowerCase() === "auto" || rawIndustry === "未指定"
    ? inferIndustry(idea)
    : rawIndustry;
  const targetUser = !rawTargetUser || rawTargetUser.toLowerCase() === "auto" || rawTargetUser === "未指定"
    ? inferTargetUser(idea)
    : rawTargetUser;
  const explanation = input.explanation?.trim();
  const scenario = explanation ? `补充约束：${explanation}` : `核心命题：${idea}`;

  return {
    pmPlanningAdvice: [
      `项目命题：${idea}`,
      `行业语境：${industry}`,
      `目标用户：${targetUser}`,
      scenario,
      "规划建议：先验证目标用户的高频任务、现有替代方案和使用动机，再把 MVP 范围压缩到一个可在短周期内验证的核心闭环。",
      "研究重点：竞品调研需要回答用户现在如何解决该问题、哪些功能已高度同质化、哪些数据或流程是本项目真正的差异化入口。"
    ].filter(Boolean).join("\n"),
    problemAndUsers: `${targetUser} 在 ${industry} 场景中，需要更低成本、更可靠地完成与“${idea}”相关的关键任务；当前需要验证该任务是否足够高频、痛点是否明确、现有方案是否存在效率或质量缺口。`,
    coreFeatures: [
      "用户问题与使用场景确认",
      "竞品与替代方案对比",
      "差异化 MVP 范围定义",
      "核心任务流程与验收标准",
      "风险边界与下一轮验证计划"
    ]
  };
}

function inferIndustry(idea: string) {
  if (/客户画像|CRM|私域|用户运营|会员/.test(idea)) return "客户管理与用户运营";
  if (/金融|投顾|理财|风控|信贷/.test(idea)) return "金融科技";
  if (/教育|课程|学习|培训/.test(idea)) return "教育科技";
  if (/招聘|简历|人才|面试/.test(idea)) return "人力资源科技";
  if (/电商|零售|商品|订单/.test(idea)) return "电商与零售";
  return "目标业务场景";
}

function inferTargetUser(idea: string) {
  if (/客户画像|CRM|私域|用户运营|会员/.test(idea)) return "增长负责人、客户运营团队和销售管理者";
  if (/金融|投顾|理财|风控|信贷/.test(idea)) return "金融业务负责人、合规人员和风险控制团队";
  if (/教育|课程|学习|培训/.test(idea)) return "教学运营负责人、教师和学习管理人员";
  if (/招聘|简历|人才|面试/.test(idea)) return "招聘负责人、HRBP 和用人团队";
  if (/电商|零售|商品|订单/.test(idea)) return "电商运营、商品运营和门店管理者";
  return "需要解决该问题的业务负责人和一线执行人员";
}

export function createMockEvaluationOutput(input: HermesEvaluationInput): HermesEvaluationOutput {
  const base = evaluateProject({
    idea: input.idea,
    industry: input.industry,
    targetUser: input.targetUser,
    competitors: input.competitors,
    differentiationScore: input.differentiationScore,
    prdMarkdown: input.prd,
    codexPackText: input.codexPackText
  });

  return {
    ...base,
    risks: [
      ...base.risks,
      "Hermes 评估依据来自 PRD、差异化判断、竞品矩阵和前一次调研结果；若前序调研缺失，分数只能作为临时判断。"
    ],
    nextActions: [
      "补齐 PRD 中的验收标准、数据模型、API 合同和非目标边界。",
      "复核竞品矩阵中高威胁产品的相同点，确认是否需要重构 MVP 范围。",
      ...base.nextActions
    ].slice(0, 5)
  };
}

export function createMockHermesOutput(input: CreateResearchRunInput): HermesResearchOutput {
  const guardrail = input.financialSuitability
    ? "项目涉及金融语境，必须加入适当性校验、风险揭示和可解释边界，不得承诺收益、保本或无风险。"
    : "项目必须明确合规、安全和第三方 Skills（技能）使用边界。";

  const competitors = [
    ["Bolt / Lovable class tools", "commercial", "https://bolt.new", "从自然语言快速生成全栈原型的商业工具。", 82],
    ["v0 / Figma Make class tools", "commercial", "https://v0.dev", "以 UI（用户界面）生成为核心的界面代码生成系统。", 74],
    ["Productboard / Aha! class tools", "commercial", "https://www.productboard.com", "用于反馈、路线图、优先级和干系人协同的产品管理套件。", 68],
    ["PostHog / Amplitude class tools", "commercial", "https://posthog.com", "用于度量用户行为和功能效果的产品分析平台。", 55],
    ["LangSmith / Braintrust class tools", "commercial", "https://www.langchain.com/langsmith", "面向 LLM（大语言模型）的评估与可观测平台。", 61],
    ["Hermes Agent", "open_source", "https://github.com/NousResearch/hermes-agent", "具备 Skills（技能）、工具调用和定时任务能力的 Agent（智能体）运行时。", 49],
    ["GitHub Spec Kit", "open_source", "https://github.com/github/spec-kit", "规格驱动开发工作流，可把产品意图转成可实施任务。", 58]
  ] as const;

  return {
    query_keywords: [input.idea, input.industry, input.targetUser, "AI（人工智能）产品决策", "竞品研究 Agent（智能体）"],
    summary: `Hermes（智能体运行框架）研究认为，${input.idea} 不应做成通用 AI（人工智能）应用生成器。更合理的切入点是面向 ${input.targetUser}、服务于 ${input.industry} 场景的产品决策与工程交接工作流。${input.explanation ? `用户补充解释形成的关键约束是：${input.explanation}。` : ""}${guardrail}`,
    competitors: competitors.map(([name, type, url, description, threat]) => {
      const reuseStrategy = name === "Hermes Agent" ? "reuse" : "reference_only";
      return {
      name,
      type: type as "open_source" | "commercial",
      url,
      description,
      core_features: ["结构化输入", "产物生成", "协同复核"],
      strengths: ["上手快", "用户心智清晰", "已有成熟工作流"],
      weaknesses: ["项目策略门槛弱", "竞品意识有限", "容易生成同质化方案"],
      reusable_ideas: ["可视化产物", "审计记录", "结构化任务交接"],
      threat_level: threat,
      reuse_strategy: reuseStrategy as "reuse" | "reference_only"
    };
    }),
    differentiation: {
      redundancy_risk: 64,
      differentiation_score: 86,
      should_build: "应建设具备竞品研究意识的产品决策与 Codex（编码代理）交接助手，而不是再做一个通用应用生成器。",
      mvp_reframe: `先建设一个面向 ${input.targetUser} 的工作台，在代码生成前把命题转化为可辩护的 PRD（产品需求文档）、竞品矩阵、差异化判断和 Codex（编码代理）任务包。`,
      must_have_features: [
        "汇报展示助手",
        "Hermes（智能体运行框架）研究任务",
        "竞品矩阵与差异化判断",
        "PRD（产品需求文档）生成与编辑",
        "PRD 后技术栈建议"
      ],
      should_not_build_features: [
        "通用应用生成器",
        "未经审查的第三方 Skills（技能）自动执行",
        "金融收益承诺或无风险表述",
        "完整分析平台替代品"
      ],
      reuse_strategy: [
        "将 Hermes（智能体运行框架）作为受控研究边界。",
        "第三方 Skills（技能）仅在白名单或人工审查后导入。",
        "借鉴规格优先交接结构，但不声称已经完成生产级集成。"
      ]
    },
    prd: {
      product_goal: `帮助 ${input.targetUser} 在交给 Codex（编码代理）前判断 ${input.idea} 是否值得建设。`,
      target_users: input.targetUser,
      industry: input.industry,
      non_goals: ["完整应用生成器", "第三方 Skills（技能）自动执行", "金融投顾自动化"]
    },
    codex_pack_seed: {
      stack: input.preferredTechStack || "Next.js, TypeScript, Prisma, Tailwind CSS, Vitest",
      pages: ["首页", "新建项目", "项目工作台", "导出任务包"],
      run_commands: ["npm install", "npx prisma migrate dev", "npm run dev", "npm test"]
    },
    monitor_plan: {
      what_to_monitor: ["新的 AI（人工智能）应用生成器", "规格优先 Agent（智能体）工具", "Hermes API（应用程序接口）变化", "Skills（技能）生态成熟度"],
      metrics: ["新增竞品数量", "功能重合度", "威胁等级变化", "差异化漂移分数"],
      competitor_drift_signals: ["竞品新增 PRD（产品需求文档）导出", "竞品新增研究 Agent（智能体）", "Hermes（智能体运行框架）改变 Skills API（技能应用程序接口）"],
      hermes_cron_suggestion: "每周运行竞品扫描，每月复核 Skills（技能）目录。",
      suggested_schedule: "0 9 * * 1",
      next_iteration_actions: ["刷新竞品矩阵", "重新计算 PDRS（产品决策就绪分）", "更新 Codex Pack（编码任务包）", "复核安全边界"]
    }
  };
}

export async function createMockResearchRun(input: CreateResearchRunInput): Promise<HermesRunResult> {
  const parsedOutput = createMockHermesOutput(input);
  return {
    hermesRunId: `mock_${Date.now()}`,
    mode: "mock",
    status: "completed",
    rawOutput: JSON.stringify(parsedOutput, null, 2),
    parsedOutput
  };
}

export function getMockEvents(runId: string): HermesEvent[] {
  return [
    { id: `${runId}-1`, at: new Date().toISOString(), level: "info", message: "已加载参考 Skills（技能）目录。" },
    { id: `${runId}-2`, at: new Date().toISOString(), level: "info", message: "已生成 mock（模拟）竞品矩阵。" },
    { id: `${runId}-3`, at: new Date().toISOString(), level: "info", message: "已校验研究输出 schema（结构约束）。" }
  ];
}
