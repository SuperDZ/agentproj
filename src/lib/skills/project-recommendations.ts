import type { RecommendedSkillSource, SkillInventoryItem, SkillKind } from "@/lib/skills/skill-types";
import { readSkillsInventoryCache } from "@/lib/hermes/control";

export const projectSkillToolRecommendationsArtifact = "project_skill_tool_recommendations";

type ProjectRecommendationInput = {
  idea: string;
  ideaExplanation?: string;
  industry?: string;
  targetUser?: string;
  needFinancialSuitabilityCheck?: boolean;
  needContinuousCompetitorMonitoring?: boolean;
};

const domainRules: Array<{ pattern: RegExp; terms: string[]; reason: string }> = [
  { pattern: /金融|银行|理财|信贷|风控|保险|证券|fintech|finance|risk/i, terms: ["finance", "risk", "compliance", "audit", "data", "analysis", "report"], reason: "金融、风控或合规场景需要强化审计、数据分析和风险边界。" },
  { pattern: /教育|课程|学习|培训|考试|教研|education|learning/i, terms: ["education", "course", "learning", "document", "content"], reason: "教育场景需要课程内容、学习路径和资料处理能力。" },
  { pattern: /招聘|人力|人才|简历|面试|hr|recruit/i, terms: ["recruit", "resume", "interview", "hr", "document", "workflow"], reason: "招聘与人力场景需要简历、面试和流程管理能力。" },
  { pattern: /电商|零售|商品|订单|库存|门店|retail|commerce/i, terms: ["commerce", "retail", "product", "order", "dashboard", "chart"], reason: "电商零售场景需要商品、订单、指标和运营分析能力。" },
  { pattern: /客户|用户运营|画像|crm|cdp|客服|私域/i, terms: ["crm", "customer", "user", "segment", "analytics", "dashboard"], reason: "客户运营场景需要用户分析、分群和运营决策能力。" },
  { pattern: /ppt|汇报|路演|演示|deck|presentation/i, terms: ["ppt", "deck", "slide", "presentation", "report"], reason: "汇报展示场景需要演示文稿和报告生成能力。" },
  { pattern: /原型|设计|画布|流程图|白板|prototype|wireframe|canvas/i, terms: ["prototype", "wireframe", "canvas", "diagram", "excalidraw", "tldraw"], reason: "原型与可视化场景需要画布、流程图和交互设计能力。" },
  { pattern: /图表|报表|指标|看板|dashboard|chart|analytics/i, terms: ["chart", "dashboard", "analytics", "metric", "recharts", "report"], reason: "指标看板场景需要图表、报表和分析能力。" },
  { pattern: /代码|开发|工程|api|前端|后端|全栈|github|react|next/i, terms: ["code", "github", "react", "next", "api", "test", "review"], reason: "工程实现类项目需要代码、API、评审和测试能力。" },
  { pattern: /研究|论文|调研|竞品|市场|research|paper|competitor/i, terms: ["research", "paper", "competitor", "market", "analysis"], reason: "研究调研场景需要资料检索、竞品分析和报告结构能力。" }
];

const phaseRules: Array<{ phase: string; pattern: RegExp; terms: string[] }> = [
  { phase: "项目规划", pattern: /规划|需求|prd|用户|问题|范围|roadmap|requirement|product/i, terms: ["prd", "product", "requirement", "planning", "workflow", "document"] },
  { phase: "竞品调研", pattern: /竞品|市场|调研|研究|论文|趋势|competitor|market|research|paper/i, terms: ["research", "paper", "competitor", "market", "search", "arxiv"] },
  { phase: "数据分析", pattern: /数据|指标|图表|报表|分析|看板|dashboard|analytics|chart|metric/i, terms: ["data", "analysis", "analytics", "chart", "dashboard", "report"] },
  { phase: "原型设计", pattern: /原型|设计|画布|流程|白板|prototype|wireframe|canvas|diagram/i, terms: ["prototype", "wireframe", "canvas", "diagram", "design"] },
  { phase: "工程实现", pattern: /代码|开发|工程|api|前端|后端|测试|github|react|next/i, terms: ["code", "github", "api", "test", "review", "react", "next"] },
  { phase: "汇报交付", pattern: /汇报|ppt|路演|演示|文档|报告|deck|presentation|report/i, terms: ["ppt", "deck", "slide", "presentation", "report", "document"] },
  { phase: "持续监控", pattern: /监控|定时|预警|追踪|rss|monitor|watch|alert|cron/i, terms: ["monitor", "watch", "rss", "alert", "cron", "competitor"] },
  { phase: "安全审核", pattern: /合规|安全|审核|风控|权限|risk|security|compliance|audit/i, terms: ["risk", "security", "compliance", "audit", "review", "policy"] }
];

const categoryRules: Array<{ category: string; terms: string[] }> = [
  { category: "研究与检索", terms: ["research", "paper", "arxiv", "search", "market", "competitor"] },
  { category: "文档与PRD", terms: ["prd", "document", "writing", "report", "requirement", "product"] },
  { category: "数据与分析", terms: ["data", "analysis", "analytics", "chart", "dashboard", "metric", "finance"] },
  { category: "原型与可视化", terms: ["prototype", "wireframe", "canvas", "diagram", "design", "vision"] },
  { category: "工程与代码", terms: ["code", "github", "api", "test", "review", "react", "next"] },
  { category: "监控与自动化", terms: ["monitor", "watch", "rss", "alert", "cron", "workflow"] },
  { category: "安全与合规", terms: ["risk", "security", "compliance", "audit", "policy"] }
];

function normalizeName(value: string) {
  return value.toLowerCase().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").trim();
}

function tokenize(input: ProjectRecommendationInput) {
  const text = [
    input.idea,
    input.ideaExplanation,
    input.industry,
    input.targetUser,
    input.needFinancialSuitabilityCheck ? "金融 风控 合规 risk compliance audit" : "",
    input.needContinuousCompetitorMonitoring ? "竞品 监控 research competitor monitor" : ""
  ].filter(Boolean).join("\n");
  const terms = new Set(text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/).filter((item) => item.length >= 2));
  for (const rule of domainRules) {
    if (rule.pattern.test(text)) rule.terms.forEach((term) => terms.add(term.toLowerCase()));
  }
  return { text, terms };
}

function scoreItem(item: SkillInventoryItem, terms: Set<string>, projectText: string) {
  const haystack = `${item.name} ${item.category || ""} ${item.descriptionZh || ""} ${item.path || ""}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += term.length > 4 ? 3 : 2;
  }
  for (const rule of domainRules) {
    if (rule.pattern.test(projectText) && rule.terms.some((term) => haystack.includes(term))) score += 8;
  }
  if (item.source === "installed" || item.source === "custom") score += 1;
  if (item.safety.status === "passed") score += 2;
  if (item.whitelisted) score += 2;
  return score;
}

function classifyItem(item: SkillInventoryItem) {
  const haystack = `${item.name} ${item.category || ""} ${item.descriptionZh || ""} ${item.path || ""}`.toLowerCase();
  return categoryRules.find((rule) => rule.terms.some((term) => haystack.includes(term)))?.category || (item.kind === "tool" ? "工具执行" : "通用技能");
}

function matchedPhases(item: SkillInventoryItem, projectText: string) {
  const haystack = `${item.name} ${item.category || ""} ${item.descriptionZh || ""} ${item.path || ""}`.toLowerCase();
  const phases = phaseRules
    .filter((rule) => rule.pattern.test(projectText) || rule.terms.some((term) => haystack.includes(term)))
    .filter((rule) => rule.terms.some((term) => haystack.includes(term)) || rule.pattern.test(`${projectText}\n${haystack}`))
    .map((rule) => rule.phase);
  return Array.from(new Set(phases)).slice(0, 3);
}

function domainReasons(item: SkillInventoryItem, projectText: string) {
  const haystack = `${item.name} ${item.category || ""} ${item.descriptionZh || ""} ${item.path || ""}`.toLowerCase();
  return domainRules
    .filter((rule) => rule.pattern.test(projectText) && rule.terms.some((term) => haystack.includes(term)))
    .map((rule) => rule.reason)
    .slice(0, 2);
}

function toRecommendedSource(item: SkillInventoryItem, score: number, projectText: string): RecommendedSkillSource {
  const phases = matchedPhases(item, projectText);
  const reasons = domainReasons(item, projectText);
  const category = classifyItem(item);
  return {
    name: item.name,
    kind: item.kind as SkillKind,
    sourceType: item.source === "custom" ? "official" : item.source === "optional" ? "curated-index" : "community-library",
    purpose: [
      `分类：${category}`,
      `可能使用阶段：${phases.length ? phases.join("、") : "项目规划、竞品调研或交付阶段"}`,
      `推荐依据：${reasons[0] || "与当前项目输入、行业、目标用户或功能语义存在匹配。"}`,
      item.descriptionZh || "本地 Hermes 能力，可作为项目执行资源候选。",
      `推荐计数：${score}`
    ],
    usage: `项目创建时基于全局资源索引计算匹配分。该资源可能用于：${phases.length ? phases.join("、") : "项目规划、调研或交付"}。`,
    enabled: false
  };
}

export async function generateProjectSkillToolRecommendations(input: ProjectRecommendationInput) {
  const inventory = await readSkillsInventoryCache("global");
  const { text, terms } = tokenize(input);
  const rank = (items: SkillInventoryItem[], limit: number) => items
    .map((item) => ({ item, score: scoreItem(item, terms, text) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
    .slice(0, limit)
    .map(({ item, score }) => toRecommendedSource(item, score, text));

  const skills = rank(inventory.installedSkills, 8);
  const tools = rank(inventory.installedTools, 8);

  return {
    generatedAt: new Date().toISOString(),
    basis: {
      idea: input.idea,
      industry: input.industry || "",
      targetUser: input.targetUser || "",
      indexSource: "global-skills-inventory-cache"
    },
    skills,
    tools
  };
}

export function parseProjectSkillToolRecommendations(content?: string): RecommendedSkillSource[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { skills?: RecommendedSkillSource[]; tools?: RecommendedSkillSource[] };
    return [...(parsed.skills ?? []), ...(parsed.tools ?? [])]
      .filter((item) => item?.name)
      .map((item) => ({
        ...item,
        name: item.name,
        kind: item.kind,
        sourceType: item.sourceType || "community-library",
        purpose: Array.isArray(item.purpose) ? item.purpose : [],
        usage: item.usage || "项目级推荐。",
        enabled: Boolean(item.enabled)
      }));
  } catch {
    return [];
  }
}

export function recommendedNameSet(items: RecommendedSkillSource[]) {
  return new Set(items.map((item) => normalizeName(item.name)));
}
