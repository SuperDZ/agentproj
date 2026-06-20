import type { EvaluationResult } from "@/lib/evaluation/engine";
import type { HermesResearchOutput } from "@/lib/hermes/types";

export type PackProject = {
  name: string;
  idea: string;
  industry: string;
  targetUser: string;
  preferredTechStack?: string | null;
  planningAdvice?: string;
  ideaExplanation?: string;
  interviewContext?: {
    problemDiscovery?: string;
    requirementDefinition?: string;
    coreFeatures?: string[];
  };
  modelConfig?: {
    provider?: string;
    model?: string;
    usageMode?: string;
    codexCliCommand?: string;
  };
};

export type CodexPackFile = { filename: string; content: string };

function list(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function numbered(items: string[]) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function coreFeatures(project: PackProject, research?: HermesResearchOutput) {
  const candidates = project.interviewContext?.coreFeatures?.length
    ? project.interviewContext.coreFeatures
    : research?.differentiation.must_have_features?.length
      ? research.differentiation.must_have_features
      : ["汇报展示助手", "Hermes（智能体运行框架）研究", "竞品矩阵", "PRD（产品需求文档）生成", "Codex Pack（编码任务包）导出"];
  return candidates.slice(0, 5);
}

function topThreeFeatures(project: PackProject, research?: HermesResearchOutput) {
  return coreFeatures(project, research).slice(0, 3);
}

function positioning(project: PackProject, research?: HermesResearchOutput) {
  return research?.differentiation.mvp_reframe ?? `一个 90 分钟面试工作台，把 ${project.idea} 转化为可辩护的 PRD（产品需求文档）、原型说明、路演大纲和 Codex（编码代理）实施计划。`;
}

function interviewContextMarkdown(project: PackProject) {
  const problem = project.interviewContext?.problemDiscovery?.trim();
  const requirements = project.interviewContext?.requirementDefinition?.trim();
  if (!problem && !requirements) return "";
  return `\n## 汇报展示助手上下文\n${problem ? `\n### 确认问题与用户\n${problem}\n` : ""}${requirements ? `\n### 范围定义\n${requirements}\n` : ""}`;
}

function modelConfigLine(project: PackProject) {
  const config = project.modelConfig;
  if (!config?.provider && !config?.model) return "默认项目模型配置。";
  const command = config.usageMode === "codex-cli" ? `，CLI：${config.codexCliCommand || "codex"}` : "";
  return `${config.provider || "unknown"} / ${config.model || "default"} / ${config.usageMode || "api"}${command}`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function generatePrdMarkdown(project: PackProject, research?: HermesResearchOutput) {
  const d = research?.differentiation;
  return `# PRD: ${project.name}

## 1. 产品目标
${typeof research?.prd.product_goal === "string" ? research.prd.product_goal : `在进入 AI（人工智能）编码前，判断 ${project.idea} 是否值得建设，并形成可交付的产品规格。`}

## 2. 目标用户
${project.targetUser}
${interviewContextMarkdown(project)}

## 3. 核心痛点
- 现场面试会把问题发现、需求定义、原型说明和实施计划压缩到很短时间内。
- 团队经常在验证用户、竞品、范围和风险前直接进入编码。
- 通用 AI（人工智能）应用生成器容易制造同质化产品，缺少 PRD（产品需求文档）和编码交接质量门槛。

## 4. 竞品发现
${research ? research.competitors.map((item) => `- **${item.name}**（${item.type}）：${item.description}`).join("\n") : "- 请先运行 Hermes（智能体运行框架）研究以填充竞品发现。"}

## 5. 差异化 MVP（最小可行产品）
${d?.mvp_reframe ?? positioning(project, research)}

## 6. 核心功能
${list(coreFeatures(project, research))}

## 7. 用户故事
- 作为项目创建者，我可以输入命题和解释，由系统先生成产品经理视角规划建议。
- 作为汇报者，我可以修改确认问题与用户、3-5 个核心功能，再触发 Hermes（智能体运行框架）研究。
- 作为 AI（人工智能）编码用户，我可以在 PRD（产品需求文档）之后选择技术栈，并导出 Codex Pack（编码任务包）。

## 8. 验收标准
- 创建项目后不自动运行 Hermes 研究、PRD、评估或 Codex Pack。
- Hermes 研究按钮仅在确认问题与用户、3-5 个核心功能存在后可用。
- PRD 生成后才展示技术栈建议。
- 第三方 Skills（技能）导入前必须显示来源、star 数和安全状态。

## 9. 数据模型
Project, ResearchRun, Competitor, Evaluation, GeneratedArtifact, MonitorJob, MonitorReport.

## 10. API 合约
POST /api/projects, GET /api/projects/:id, POST /api/projects/:id/research, POST /api/projects/:id/generate-prd, POST /api/projects/:id/tech-stack, POST /api/projects/:id/export.

## 11. 非目标
${list(d?.should_not_build_features ?? ["不建设通用应用生成器。", "不自动执行未经审查的第三方 Skills（技能）。", "不跳过用户确认直接进入研究和编码。"])}

## 12. 风险
- Hermes（智能体运行框架）真实 API（应用程序接口）端点可能变化，所有调用必须留在适配器之后。
- 技术栈建议必须基于 PRD（产品需求文档）和项目约束，不能在创建阶段提前固定。
- 模型配置：${modelConfigLine(project)}
`;
}

export function generateProductPrdMarkdown(project: PackProject, research?: HermesResearchOutput) {
  const features = coreFeatures(project, research);
  const differentiation = research?.differentiation;
  const productGoal = typeof research?.prd.product_goal === "string"
    ? research.prd.product_goal
    : `验证并建设“${project.idea}”的最小可行产品，使 ${project.targetUser} 能在明确场景中完成关键任务，并形成可交付给设计、研发和测试的规格。`;
  const competitorEvidence = research?.competitors.length
    ? research.competitors.map((item) => `- **${item.name}**（${item.type}）：${item.description}；可参考点：${item.reusable_ideas.join("、") || "待验证"}；威胁等级：${item.threat_level}。`).join("\n")
    : "- 暂无 Hermes 前一轮调研结果。PRD 当前只能基于项目规划建议和汇报展示助手输入生成，竞品证据标记为待验证。";
  const featureSpecs = features.map((feature, index) => `### ${index + 1}. ${feature}
- 用户价值：帮助 ${project.targetUser} 在目标场景中更快完成与“${project.idea}”相关的关键任务。
- 交互流程：进入功能入口，补充必要输入，系统给出结构化结果，用户可编辑、保存或进入下一环节。
- 系统行为：校验必填信息，保留生成来源，失败时展示可操作错误，不静默失败。
- 边界情况：输入不足、研究结果缺失、模型返回不完整、重复生成覆盖旧版本。
- 验收标准：用户能完成一次端到端操作；输出内容包含来源、结论、约束和下一步；异常状态有明确反馈。`).join("\n\n");

  return `# PRD: ${project.name}

## 1. 产品目标
${productGoal}

## 2. 背景与问题定义
${project.planningAdvice?.trim() || `项目初始命题：${project.idea}`}
${project.ideaExplanation?.trim() ? `\n补充解释：${project.ideaExplanation.trim()}` : ""}

## 3. 目标用户
${project.targetUser}
${interviewContextMarkdown(project)}

## 4. 核心痛点
- 用户需要在有限时间内把问题、用户、范围、竞品证据和交付物对齐。
- 团队如果绕过需求澄清直接进入实现，容易产生同质化功能和不可验收规格。
- 当前阶段需要把项目规划、汇报展示助手输入和 Hermes 研究结论合并成工程可执行文档。

## 5. 相关产品与竞品证据
${competitorEvidence}

## 6. 产品定位与差异化 MVP（最小可行产品）
${differentiation?.mvp_reframe ?? positioning(project, research)}

差异化判断：${differentiation?.should_build ?? "待 Hermes 研究进一步验证。"}

## 7. 范围
### 7.1 本期必须建设
${list(features)}

### 7.2 本期不建设
${list(differentiation?.should_not_build_features ?? ["不建设与核心场景无关的通用平台能力。", "不自动采信未验证的竞品或市场结论。", "不跳过用户确认直接进入工程生成。"])}

## 8. 功能需求
${featureSpecs}

## 9. 用户故事
- 作为目标用户，我可以明确当前问题、使用场景和成功标准，避免需求描述停留在抽象想法。
- 作为产品负责人，我可以基于 Hermes 调研查看相关产品、差异化机会和不可建设范围。
- 作为研发负责人，我可以读取结构化 PRD，直接拆分任务、数据模型、API 和测试用例。

## 10. 数据模型
- Project：项目名称、命题、行业、目标用户、技术栈偏好、状态。
- GeneratedArtifact：项目规划建议、汇报展示助手上下文、PRD、技术栈建议和导出文件。
- ResearchRun：Hermes 研究输入、状态、原始输出和解析后的结构化 JSON。
- Competitor：竞品名称、类型、链接、核心功能、优劣势、威胁等级和复用策略。
- Evaluation：PDRS（产品决策就绪分）、机会分、竞争分、规格分、原型分和风险原因。

## 11. API 合约
- POST /api/projects：创建项目并生成初始规划建议。
- POST /api/projects/:id/research：运行 Hermes 研究。
- POST /api/projects/:id/generate-prd：读取规划、汇报助手和 Hermes 调研后生成 PRD。
- POST /api/projects/:id/tech-stack：基于 PRD 和约束生成技术栈建议。
- POST /api/projects/:id/export：导出 Codex Pack（编码任务包）。

## 12. 成功指标
- PRD 完整度：目标、用户、范围、功能、验收、风险、数据/API 均存在。
- 证据覆盖：至少引用 Hermes 前一轮调研中的竞品、差异化判断或监控信号。
- 工程可执行性：每个核心功能至少包含系统行为和验收标准。
- 用户反馈：生成、保存、失败、重试均有明确页面反馈。

## 13. 验收标准
- 点击“生成 PRD”后，系统读取当前项目规划建议、汇报展示助手上下文和最新 Hermes 研究结果。
- 生成结果不能只复述固定模板，必须包含当前项目名称、目标用户、核心功能和竞品证据。
- 如果没有 Hermes 研究结果，文档必须显式标注竞品证据“待验证”。
- 保存后的 PRD 可继续用于技术栈建议、PDRS 评估和 Codex Pack 导出。

## 14. 风险与约束
- 公开 PRD 模板只能作为结构参考，不能伪造竞品内部 PRD 或未提供的私有资料。
- Hermes（智能体运行框架）真实 API（应用程序接口）端点可能变化，调用必须留在适配器之后。
- 模型配置：${modelConfigLine(project)}

## 15. 待验证问题
- 相关产品是否存在公开 PRD、路线图、帮助文档或开源 issue 可进一步引用。
- 目标用户是否认可当前 3-5 个核心功能的优先级。
- MVP 的技术边界和数据合规边界是否需要进一步收紧。
`;
}

export function generateMonitorPlan(project: PackProject, research?: HermesResearchOutput) {
  const plan = research?.monitor_plan;
  return `# 监控计划：${project.name}

## 监控对象
${list(plan?.what_to_monitor ?? ["竞品发布", "AI（人工智能）编码工作流变化", "Hermes（智能体运行框架）运行时变化", "Skills（技能）生态成熟度"])}

## 指标
${list(plan?.metrics ?? ["功能重合度", "威胁等级", "差异化漂移分数"])}

## 漂移信号
${list(plan?.competitor_drift_signals ?? ["竞品新增 PRD（产品需求文档）导出", "竞品新增研究 Agent（智能体）", "竞品新增原型生成能力"])}

## Hermes 定时任务建议
${plan?.hermes_cron_suggestion ?? "每周运行一次 mock（模拟）或真实 Hermes 扫描。"}

## 下一轮行动
${list(plan?.next_iteration_actions ?? ["刷新竞品矩阵", "重新计算 PDRS（产品决策就绪分）", "更新 Codex Pack（编码任务包）"])}
`;
}

export function generateInterviewRunbook(project: PackProject, research?: HermesResearchOutput) {
  return `# 90 分钟面试运行手册：${project.name}

## 时间轴
- 00:00-00:10 命题框定：明确用户、场景、业务目标和约束。
- 00:10-00:25 发现：识别痛点、替代方案、风险假设和证据缺口。
- 00:25-00:40 定义：筛选 3-5 个核心功能点。
- 00:40-00:55 PRD（产品需求文档）：写清目标、用户、故事、验收和非目标。
- 00:55-01:10 原型：生成页面流、交互说明和数据状态。
- 01:10-01:30 Codex（编码代理）交接：产出实施提示词、任务顺序和测试计划。

## 候选功能池
${list(coreFeatures(project, research))}
${interviewContextMarkdown(project)}
`;
}

export function generatePrototypeSpec(project: PackProject, research?: HermesResearchOutput) {
  return `# 原型规格：${project.name}

## 原型目标
展示从命题录入、汇报展示助手、Hermes（智能体运行框架）研究、PRD（产品需求文档）、技术栈建议到 Codex Pack（编码任务包）的端到端工作流。

## 页面流
1. 项目规划建议
2. 汇报展示助手
3. Hermes 研究
4. 竞品矩阵与差异化判断
5. PRD 和技术栈建议
6. PDRS（产品决策就绪分）与 Codex Pack

## 已选核心点
${list(topThreeFeatures(project, research))}
`;
}

export function generatePrototypeWireframeSvg(project: PackProject, research?: HermesResearchOutput, evaluation?: EvaluationResult) {
  const selected = topThreeFeatures(project, research);
  const safeName = escapeXml(project.name);
  const safeIdea = escapeXml(project.idea.slice(0, 120));
  const featureLines = selected.map((feature, index) => `<text x="930" y="${318 + index * 34}" class="small">0${index + 1}. ${escapeXml(feature)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900" role="img" aria-label="${safeName} 的原型线框图">
  <defs><style>.bg{fill:#f8fafc}.panel{fill:#fff;stroke:#d4d4d8;stroke-width:1.5}.dark{fill:#111827}.accent{fill:#eff6ff;stroke:#93c5fd;stroke-width:1.5}.text{fill:#18181b;font-family:Arial,Helvetica,sans-serif}.title{font-size:28px;font-weight:700}.h{font-size:18px;font-weight:700}.body{font-size:14px}.small{font-size:12px}.muted{fill:#71717a}</style></defs>
  <rect class="bg" width="1440" height="900"/>
  <rect class="dark" x="0" y="0" width="1440" height="76"/>
  <text x="36" y="47" class="text title" fill="#fff">SpecFlow 工作台</text>
  <text x="1180" y="47" class="text body" fill="#fbbf24">90 分钟交付</text>
  <rect class="panel" x="32" y="108" width="300" height="650" rx="8"/><text x="56" y="148" class="text h">01 规划建议</text><text x="56" y="190" class="text small muted">${safeIdea}</text>
  <rect class="panel" x="372" y="108" width="300" height="650" rx="8"/><text x="396" y="148" class="text h">02 汇报展示助手</text><text x="396" y="190" class="text small muted">问题与用户、3-5 个核心功能</text>
  <rect class="panel" x="712" y="108" width="300" height="650" rx="8"/><text x="736" y="148" class="text h">03 Hermes 研究</text><text x="736" y="190" class="text small muted">竞品矩阵、差异化、监控计划</text>
  <rect class="panel" x="1052" y="108" width="300" height="650" rx="8"/><text x="1076" y="148" class="text h">04 PRD 与 Codex</text><text x="1076" y="190" class="text small muted">技术栈建议后再导出</text>
  <rect class="accent" x="900" y="280" width="360" height="170" rx="8"/><text x="930" y="312" class="text body">已选核心点</text>${featureLines}
  <text x="56" y="820" class="text body">PDRS：${escapeXml(String(evaluation?.pdrs ?? "待评估"))}</text>
</svg>`;
}

export function generatePitchDeckOutline(project: PackProject, research?: HermesResearchOutput, evaluation?: EvaluationResult) {
  return `# 路演大纲：${project.name}

1. 执行摘要：${positioning(project, research)}
2. 问题与用户：${project.targetUser}
3. 市场与竞品证据：展示竞品矩阵、威胁等级和可复用经验。
4. 产品方案：${coreFeatures(project, research).join("、")}
5. 风险与边界：第三方 Skills（技能）导入、金融表述和模型输出必须可审计。
6. 决策：${evaluation?.decision ?? "待定"}，PDRS（产品决策就绪分）：${evaluation?.pdrs ?? "待定"}。
`;
}

export function generateVibeCodingPlan(project: PackProject, research?: HermesResearchOutput) {
  return `# Vibe Coding（氛围式编码）实施计划：${project.name}

## 建设目标
实现一个从命题到 PRD（产品需求文档）、技术栈建议和 Codex（编码代理）交接的工作台。

## 技术栈
${project.preferredTechStack || "待用户在 PRD 生成后选择。"}

## 优先建设功能
${numbered(coreFeatures(project, research))}

## 测试计划
- 单元测试覆盖 Hermes（智能体运行框架）输出解析、白名单持久化、PRD 生成和 Codex Pack（编码任务包）生成。
- 集成测试覆盖项目创建后不自动研究、用户保存汇报助手后才允许研究、PRD 后生成技术栈建议。
`;
}

export function generateToolSkillPlan() {
  return `# Tools（工具）与 Skills（技能）参考计划

## 安全策略
- 开源来源必须展示真实链接、star 数和安全状态。
- 本地白名单只表示本机用户信任或官方内置检查通过，不代表全网安全认证。
- 未经审查的 Skills（技能）可以作为参考导入，但必须保留红色风险标识。
- 未通过安全检查的项禁止导入。
`;
}

export function generateCodexPack(project: PackProject, research: HermesResearchOutput | undefined, evaluation: EvaluationResult, prdMarkdown?: string): CodexPackFile[] {
  const prd = prdMarkdown || generateProductPrdMarkdown(project, research);
  const techStack = project.preferredTechStack || "待用户在 PRD（产品需求文档）之后选择技术栈";
  const competitorReport = `# 竞品报告\n\n${research?.competitors.map((item) => `## ${item.name}\n- 类型：${item.type}\n- URL：${item.url}\n- 威胁等级：${item.threat_level}\n- 复用策略：${item.reuse_strategy}\n- 核心功能：${item.core_features.join("、")}`).join("\n\n") ?? "请先运行 Hermes（智能体运行框架）研究。"}`;
  const evaluationReport = `# 评估报告\n\n- PDRS（产品决策就绪分）：${evaluation.pdrs}\n- 决策：${evaluation.decision}\n- 同质化风险：${evaluation.redundancyRisk}\n- 差异化分数：${evaluation.differentiationScore}\n\n## Prompt（提示词）就绪分\n${list(evaluation.promptReadinessScore.reasons)}\n\n## 风险\n${list(evaluation.risks)}\n\n## 下一步行动\n${list(evaluation.nextActions)}`;
  const apiSpec = "# API 合约\n\n- POST /api/projects\n- POST /api/projects/:id/research\n- POST /api/projects/:id/generate-prd\n- POST /api/projects/:id/tech-stack\n- POST /api/projects/:id/export\n";
  const tasks = `# 任务\n\n1. 实现汇报展示助手 artifact 保存。\n2. 接入 Hermes（智能体运行框架）研究前置校验。\n3. 在 PRD（产品需求文档）后生成技术栈建议。\n4. 导出 Codex Pack（编码任务包）。`;
  const codexPrompt = `# Codex（编码代理）提示词

## Product Goal
${project.idea}

## Tech Stack
${techStack}

## Pages
项目规划建议、汇报展示助手、Hermes Research（Hermes 研究）、Competitor Matrix（竞品矩阵）、PRD（产品需求文档）、技术栈建议、PDRS、Codex Pack、Monitor Plan（监控计划）。

## Data Models
Project, ResearchRun, Competitor, Evaluation, GeneratedArtifact, MonitorJob, MonitorReport.

## API Contracts
${apiSpec}

## Tasks
${tasks}

## Acceptance Criteria
- 创建项目后不自动运行 Hermes 研究。
- 只有用户保存确认问题与用户、3-5 个核心功能后，才能触发 Hermes 研究。
- PRD 生成后才展示技术栈建议。

## Run Commands
- npm install
- npx prisma migrate dev
- npm run dev
- npm test

## Security Boundaries
- 第三方 Skills（技能）必须经过白名单或人工审查。
- 未通过安全检查的 Skill（技能）禁止导入。
- 原始模型输出必须持久化用于审计。`;

  const readme = `# ${project.name}\n\n${project.idea}\n\n## 面试交付物\n- 90 分钟运行手册\n- PRD（产品需求文档）\n- 原型规格\n- 路演大纲\n- Vibe Coding（氛围式编码）实施计划\n- Codex（编码代理）就绪任务包\n`;
  return [
    { filename: "README.md", content: readme },
    { filename: "PRD.md", content: prd },
    { filename: "interview_runbook.md", content: generateInterviewRunbook(project, research) },
    { filename: "prototype_spec.md", content: generatePrototypeSpec(project, research) },
    { filename: "prototype_wireframe.svg", content: generatePrototypeWireframeSvg(project, research, evaluation) },
    { filename: "pitch_deck_outline.md", content: generatePitchDeckOutline(project, research, evaluation) },
    { filename: "competitor_report.md", content: competitorReport },
    { filename: "evaluation_report.md", content: evaluationReport },
    { filename: "api_spec.md", content: apiSpec },
    { filename: "tasks.md", content: tasks },
    { filename: "codex_prompt.md", content: codexPrompt },
    { filename: "vibe_coding_plan.md", content: generateVibeCodingPlan(project, research) },
    { filename: "tool_skill_plan.md", content: generateToolSkillPlan() },
    { filename: "monitor_plan.md", content: generateMonitorPlan(project, research) }
  ];
}

export function packToClipboardText(files: CodexPackFile[]) {
  return files.map((file) => `===== ${file.filename} =====\n${file.content}`).join("\n\n");
}
