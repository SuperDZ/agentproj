import type { Prisma } from "@prisma/client";
import { evaluateProject, type EvaluationResult } from "@/lib/evaluation/engine";
import {
  generateCodexPack,
  generatePitchDeckOutline,
  generatePrdMarkdown,
  generateProductPrdMarkdown,
  generatePrototypeSpec,
  packToClipboardText,
  type CodexPackFile,
  type PackProject
} from "@/lib/export/codex-pack";
import { hermesClient } from "@/lib/hermes/client";
import { parseHermesResearchOutput } from "@/lib/hermes/parser";
import type { HermesMode, HermesResearchOutput, HermesRunStatus } from "@/lib/hermes/types";
import { prisma } from "@/lib/db/prisma";
import { generateJsonWithModel, type ModelConfig } from "@/lib/model/client";

export const codexPackArtifactTypes = [
  "README.md",
  "PRD.md",
  "competitor_report.md",
  "evaluation_report.md",
  "api_spec.md",
  "tasks.md",
  "codex_prompt.md",
  "monitor_plan.md"
];

type ProjectWithFlowData = Awaited<ReturnType<typeof loadProjectFlowData>>;
type ArtifactLike = { artifactType: string; content: string };
type ProjectArtifacts = { artifacts: ArtifactLike[] };

export type ReportAssistantContext = {
  problemAndUsers: string;
  coreFeatures: string[];
};

export type TechStackRecommendation = {
  id: string;
  name: string;
  reason: string;
  components: string[];
  risks: string[];
  recommendation: "high" | "medium" | "low";
};

type MonitorJobOptions = {
  cadence?: "daily" | "weekly" | "monthly";
  tasks?: string[];
  taskConfigs?: Array<{ task: string; startAt: string; cadence: string }>;
};

type ReportDeckPackage = {
  prompt: string;
  deckTitle: string;
  slides: Array<{ title: string; bullets: string[]; speakerNotes: string }>;
  manuscript: string;
};

type InitialProjectPlanning = {
  pmPlanningAdvice: string;
  problemAndUsers: string;
  coreFeatures: string[];
};

type ResearchRunLike = {
  id: string;
  projectId: string;
  hermesRunId: string | null;
  status: string;
  parsedOutputJson: string | null;
};

export type ResearchWorkerResult = {
  processed: boolean;
  action: "idle" | "reset_stale" | "claimed" | "refreshed" | "failed";
  runId?: string;
  status?: string;
};

function stringsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\r?\n|[;；。]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function normalizeInitialProjectPlanning(value: unknown, fallback: InitialProjectPlanning): InitialProjectPlanning {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const pmPlanningAdvice = typeof record.pmPlanningAdvice === "string" && record.pmPlanningAdvice.trim()
    ? record.pmPlanningAdvice
    : fallback.pmPlanningAdvice;
  const problemAndUsers = typeof record.problemAndUsers === "string" && record.problemAndUsers.trim()
    ? record.problemAndUsers
    : fallback.problemAndUsers;
  const coreFeatures = stringsFromUnknown(record.coreFeatures).slice(0, 5);
  return {
    pmPlanningAdvice,
    problemAndUsers,
    coreFeatures: coreFeatures.length >= 3 ? coreFeatures : fallback.coreFeatures
  };
}

function normalizeReportDeckPackage(value: unknown, fallback: ReportDeckPackage): ReportDeckPackage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  const rawSlides = Array.isArray(record.slides) ? record.slides : [];
  const slides = rawSlides.map((slide, index) => {
    const item = slide && typeof slide === "object" ? slide as Record<string, unknown> : {};
    const fallbackSlide = fallback.slides[index] ?? fallback.slides[0];
    const bullets = [
      ...stringsFromUnknown(item.bullets),
      ...stringsFromUnknown(item.points),
      ...stringsFromUnknown(item.items),
      ...stringsFromUnknown(item.content)
    ];
    return {
      title: String(item.title || fallbackSlide.title),
      bullets: bullets.length ? bullets.slice(0, 6) : fallbackSlide.bullets,
      speakerNotes: String(item.speakerNotes || item.notes || item.content || fallbackSlide.speakerNotes || "")
    };
  });

  return {
    deckTitle: String(record.deckTitle || fallback.deckTitle),
    prompt: String(record.prompt || fallback.prompt),
    slides: slides.length ? slides : fallback.slides,
    manuscript: String(record.manuscript || fallback.manuscript)
  };
}

export async function loadProjectFlowData(projectId: string) {
  return prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      competitors: true,
      researchRuns: { orderBy: { createdAt: "desc" } },
      evaluations: { orderBy: { createdAt: "desc" } },
      artifacts: { orderBy: { createdAt: "desc" } },
      monitorJobs: { orderBy: { createdAt: "desc" } }
    }
  });
}

export function getLatestResearch(project: Pick<ProjectWithFlowData, "researchRuns">): HermesResearchOutput | undefined {
  const latestRun = project.researchRuns[0];
  if (latestRun?.parsedOutputJson) return parseHermesResearchOutput(latestRun.parsedOutputJson);
  if (latestRun) return undefined;
  return undefined;
}

export function getLatestPrd(project: Pick<ProjectWithFlowData, "artifacts">): string | undefined {
  return project.artifacts.find((artifact) => artifact.artifactType === "prd")?.content;
}

export function getLatestCodexPackArtifacts(project: Pick<ProjectWithFlowData, "artifacts">) {
  const seen = new Set<string>();
  return project.artifacts.filter((artifact) => {
    if (!codexPackArtifactTypes.includes(artifact.artifactType) || seen.has(artifact.artifactType)) return false;
    seen.add(artifact.artifactType);
    return true;
  });
}

export function collectCodexPackText(project: Pick<ProjectWithFlowData, "artifacts">): string | undefined {
  const artifacts = getLatestCodexPackArtifacts(project).filter((artifact) => artifact.artifactType !== "PRD.md");
  if (artifacts.length === 0) return undefined;
  return artifacts.map((artifact) => `# ${artifact.artifactType}\n${artifact.content}`).join("\n\n");
}

export function getArtifactContent(project: ProjectArtifacts, artifactType: string): string | undefined {
  return project.artifacts.find((artifact) => artifact.artifactType === artifactType)?.content;
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n|[,，、;]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

export function parseReportAssistantContext(project: ProjectArtifacts): ReportAssistantContext {
  const raw = parseJson<Record<string, unknown>>(getArtifactContent(project, "report_assistant_context"), {});
  return {
    problemAndUsers: typeof raw.problemAndUsers === "string" ? raw.problemAndUsers : "",
    coreFeatures: asStringArray(raw.coreFeatures).slice(0, 5)
  };
}

export function isReportAssistantReady(context: ReportAssistantContext): boolean {
  return context.problemAndUsers.trim().length > 0 && context.coreFeatures.length >= 3 && context.coreFeatures.length <= 5;
}

export function parseTechStackRecommendations(project: ProjectArtifacts): TechStackRecommendation[] {
  const raw = parseJson<unknown>(getArtifactContent(project, "tech_stack_recommendations"), []);
  const items = Array.isArray(raw) ? raw : [];
  return items.map((item, index): TechStackRecommendation => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const recommendation = String(record.recommendation || "medium").toLowerCase();
    return {
      id: String(record.id || record.name || `stack-${index + 1}`).trim(),
      name: String(record.name || record.id || `Stack ${index + 1}`).trim(),
      reason: String(record.reason || "").trim(),
      components: asStringArray(record.components),
      risks: asStringArray(record.risks),
      recommendation: recommendation === "high" || recommendation === "low" ? recommendation : "medium"
    };
  }).filter((item) => item.id && item.name);
}

export function buildDifferentiationBrief(research?: HermesResearchOutput) {
  const differentiation = research?.differentiation;
  return {
    scoreBasis: differentiation?.score_basis ?? [],
    similarProducts: differentiation?.similar_products?.map((item) => ({
      name: item.name,
      samePoints: item.same_points
    })) ?? [],
    modificationSuggestions: differentiation?.modification_suggestions ?? []
  };
}

function isAutoValue(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "auto" || normalized === "未指定";
}

function inferIndustryFromText(text: string) {
  if (/金融科技|金融|信贷|风控|银行|财富|理财|fintech|finance|financial/i.test(text)) return "金融科技";
  if (/客户画像|用户运营|客群|标签|CDP|CRM/i.test(text)) return "客户数据与用户运营";
  if (/教育|课程|学习|培训/.test(text)) return "教育科技";
  if (/招聘|简历|人才|面试/.test(text)) return "人力资源科技";
  if (/电商|零售|商品|订单/.test(text)) return "电商与零售";
  return "请根据项目命题与补充解释推断行业，禁止把 auto 理解为汽车行业";
}

function inferTargetUserFromText(text: string) {
  if (/一线人员|运营负责人|管理层|经营分析|客户服务|客户经理/.test(text)) return "一线业务人员、运营负责人、客户服务人员和管理层";
  if (/金融科技|金融|信贷|风控|银行|财富|理财/.test(text)) return "金融科技公司的业务运营、客户服务、风控分析和经营管理团队";
  if (/客户画像|用户运营|客群|标签|CDP|CRM/i.test(text)) return "客户运营团队、数据分析人员、一线服务人员和业务管理者";
  return "请根据项目命题与补充解释推断目标用户";
}

function buildResearchContext(project: ProjectWithFlowData) {
  const ideaExplanation = getArtifactContent(project, "idea_explanation") || "";
  const planningAdvice = getArtifactContent(project, "pm_planning_advice") || "";
  const reportContext = parseReportAssistantContext(project);
  const combinedText = [project.idea, project.industry, project.targetUser, ideaExplanation, planningAdvice, reportContext.problemAndUsers, reportContext.coreFeatures.join("\n")].join("\n");
  const industry = isAutoValue(project.industry) ? inferIndustryFromText(combinedText) : project.industry;
  const targetUser = isAutoValue(project.targetUser) ? inferTargetUserFromText(combinedText) : project.targetUser;
  const explanation = [
    "创建项目时用户填写的补充解释：",
    ideaExplanation || "未填写",
    "",
    "Hermes 创建阶段生成并由用户确认/编辑的问题与用户：",
    reportContext.problemAndUsers || "未填写",
    "",
    "Hermes 创建阶段生成并由用户确认/编辑的 3-5 个核心功能：",
    reportContext.coreFeatures.map((item) => `- ${item}`).join("\n") || "未填写",
    "",
    "项目规划建议：",
    planningAdvice || "未填写",
    "",
    "研究约束：必须以上述金融/业务背景为准；如果原始 industry 或 targetUser 为 auto，只表示用户未手工填写，不得解释为汽车行业 automotive。"
  ].join("\n");

  return {
    industry,
    targetUser,
    explanation,
    financialSuitability: project.needFinancialSuitabilityCheck || /金融科技|金融|信贷|风控|银行|财富|理财|fintech|finance|financial/i.test(combinedText)
  };
}

function buildProjectResearchRequest(project: ProjectWithFlowData) {
  const researchContext = buildResearchContext(project);
  return {
    inputPrompt: `Research competitors and product differentiation for: ${project.idea}\nIndustry: ${researchContext.industry}\nTarget user: ${researchContext.targetUser}\nContext:\n${researchContext.explanation}`,
    input: {
      projectId: project.id,
      idea: project.idea,
      explanation: researchContext.explanation,
      industry: researchContext.industry,
      targetUser: researchContext.targetUser,
      financialSuitability: researchContext.financialSuitability,
      preferredTechStack: project.preferredTechStack || undefined
    }
  };
}

function modelConfigFromProject(project: ProjectArtifacts): ModelConfig | undefined {
  return parseJson<ModelConfig | undefined>(getArtifactContent(project, "model_config"), undefined);
}

function packModelConfig(project: ProjectArtifacts) {
  const config = modelConfigFromProject(project);
  if (!config) return undefined;
  return {
    provider: config.provider,
    model: config.model,
    usageMode: config.usageMode,
    codexCliCommand: config.codexCliCommand ?? undefined
  };
}

function toPackProject(project: PackProject & Partial<ProjectArtifacts>): PackProject {
  const reportContext = project.artifacts ? parseReportAssistantContext({ artifacts: project.artifacts }) : { problemAndUsers: "", coreFeatures: [] };
  return {
    name: project.name,
    idea: project.idea,
    industry: project.industry,
    targetUser: project.targetUser,
    preferredTechStack: project.preferredTechStack,
    planningAdvice: project.artifacts ? getArtifactContent({ artifacts: project.artifacts }, "pm_planning_advice") : undefined,
    ideaExplanation: project.artifacts ? getArtifactContent({ artifacts: project.artifacts }, "idea_explanation") : undefined,
    interviewContext: {
      problemDiscovery: reportContext.problemAndUsers,
      requirementDefinition: reportContext.coreFeatures.join("\n"),
      coreFeatures: reportContext.coreFeatures
    },
    modelConfig: project.artifacts ? packModelConfig({ artifacts: project.artifacts }) : undefined
  };
}

export function evaluateProjectFlow(project: ProjectWithFlowData): { evaluation: EvaluationResult; research?: HermesResearchOutput; prd: string } {
  const research = getLatestResearch(project);
  const prd = getLatestPrd(project) || generatePrdMarkdown(toPackProject(project), research);
  const codexPackText = collectCodexPackText(project);
  const evaluation = evaluateProject({
    idea: project.idea,
    industry: project.industry,
    targetUser: project.targetUser,
    competitors: project.competitors.map((competitor) => ({ threatLevel: competitor.threatLevel, reuseStrategy: competitor.reuseStrategy })),
    differentiationScore: research?.differentiation.differentiation_score ?? 60,
    prdMarkdown: prd,
    codexPackText
  });
  return { evaluation, research, prd };
}

export async function persistResearchResult(projectId: string, runDbId: string, result: { hermesRunId: string; mode: HermesMode; status: HermesRunStatus; rawOutput: string; parsedOutput?: HermesResearchOutput }) {
  const runData: Prisma.ResearchRunUpdateInput = {
    hermesRunId: result.hermesRunId,
    mode: result.mode,
    status: result.status,
    rawOutput: result.rawOutput
  };
  if (result.parsedOutput) runData.parsedOutputJson = JSON.stringify(result.parsedOutput);
  if (["completed", "failed", "completed_without_output"].includes(result.status)) runData.completedAt = new Date();

  const mutations: Prisma.PrismaPromise<unknown>[] = [
    prisma.researchRun.update({
      where: { id: runDbId },
      data: runData
    })
  ];

  if (result.parsedOutput) {
    mutations.push(prisma.competitor.deleteMany({ where: { projectId } }));
    mutations.push(
      ...result.parsedOutput.competitors.map((competitor) =>
        prisma.competitor.create({
          data: {
            projectId,
            name: competitor.name,
            type: competitor.type,
            url: competitor.url,
            description: competitor.description,
            coreFeaturesJson: JSON.stringify(competitor.core_features),
            strengthsJson: JSON.stringify(competitor.strengths),
            weaknessesJson: JSON.stringify(competitor.weaknesses),
            reusableIdeasJson: JSON.stringify(competitor.reusable_ideas),
            threatLevel: competitor.threat_level,
            reuseStrategy: competitor.reuse_strategy
          }
        })
      )
    );
  }

  await prisma.$transaction(mutations);
}

export async function saveReportAssistantContext(projectId: string, context: ReportAssistantContext & { pmPlanningAdvice?: string }) {
  const writes: Prisma.PrismaPromise<unknown>[] = [
    prisma.generatedArtifact.create({
      data: {
        projectId,
        artifactType: "report_assistant_context",
        content: JSON.stringify({
          problemAndUsers: context.problemAndUsers.trim(),
          coreFeatures: context.coreFeatures.map((item) => item.trim()).filter(Boolean).slice(0, 5)
        })
      }
    })
  ];

  if (typeof context.pmPlanningAdvice === "string") {
    writes.push(prisma.generatedArtifact.create({ data: { projectId, artifactType: "pm_planning_advice", content: context.pmPlanningAdvice } }));
  }

  await prisma.$transaction(writes);
}

export async function generateInitialProjectPlanning(projectId: string) {
  const project = await loadProjectFlowData(projectId);
  const fallback = {
    pmPlanningAdvice: [
      `项目命题：${project.idea}`,
      `目标用户：${project.targetUser}`,
      "建议先确认真实问题、目标用户、使用场景和不可做范围，再进入竞品研究。",
      "Hermes 研究前至少保存 3-5 个核心功能，避免调研目标漂移。"
    ].join("\n"),
    problemAndUsers: `${project.targetUser} 需要解决：${project.idea}`,
    coreFeatures: ["问题与用户确认", "竞品研究", "差异化判断"]
  };
  const generated = normalizeInitialProjectPlanning(await generateJsonWithModel({
    config: modelConfigFromProject(project),
    system: "你是资深产品经理。只输出 JSON。",
    user: `为以下项目生成初始项目规划建议、确认后的问题与用户、3-5 个核心功能。\n项目：${project.idea}\n行业：${project.industry}\n目标用户：${project.targetUser}`,
    fallback
  }), fallback);

  await saveReportAssistantContext(projectId, {
    pmPlanningAdvice: generated.pmPlanningAdvice,
    problemAndUsers: generated.problemAndUsers,
    coreFeatures: generated.coreFeatures
  });
  return generated;
}

export async function generateInitialProjectPlanningWithHermes(projectId: string) {
  const project = await loadProjectFlowData(projectId);
  const fallback = {
    pmPlanningAdvice: [
      `项目命题：${project.idea}`,
      `目标用户：${project.targetUser}`,
      "规划建议：创建项目时先由 Hermes 形成项目规划建议，并把汇报展示助手的确认问题与核心功能并入同一块输入。",
      "进入研究前必须确认真实问题、目标用户、使用场景、不做范围和 3-5 个核心功能，避免调研目标漂移。"
    ].join("\n"),
    problemAndUsers: `${project.targetUser} 需要解决：${project.idea}`,
    coreFeatures: ["问题与用户确认", "Hermes 规划建议", "竞品矩阵", "差异化判断", "PRD 生成"]
  };
  const generated = normalizeInitialProjectPlanning(await hermesClient.createPlanningRun({
    projectId,
    idea: project.idea,
    explanation: getArtifactContent(project, "idea_explanation"),
    industry: project.industry,
    targetUser: project.targetUser
  }), fallback);

  await prisma.$transaction([
    prisma.generatedArtifact.create({ data: { projectId, artifactType: "hermes_initial_planning", content: JSON.stringify(generated) } }),
    prisma.generatedArtifact.create({
      data: {
        projectId,
        artifactType: "report_assistant_context",
        content: JSON.stringify({
          problemAndUsers: generated.problemAndUsers.trim(),
          coreFeatures: generated.coreFeatures.map((item) => item.trim()).filter(Boolean).slice(0, 5)
        })
      }
    }),
    prisma.generatedArtifact.create({ data: { projectId, artifactType: "pm_planning_advice", content: generated.pmPlanningAdvice } })
  ]);
  return generated;
}

function defaultTechStacks(): TechStackRecommendation[] {
  return [
    {
      id: "next-prisma",
      name: "Next.js + Prisma + PostgreSQL",
      reason: "适合快速交付全栈产品、服务端路由和结构化数据持久化。",
      components: ["Next.js App Router", "Prisma", "PostgreSQL", "Tailwind CSS"],
      risks: ["需要清晰划分服务端组件和客户端交互", "生产环境需要数据库迁移和连接池治理"],
      recommendation: "high"
    },
    {
      id: "react-api",
      name: "React + API 服务",
      reason: "适合前后端职责明确、后续需要拆分服务的项目。",
      components: ["React", "REST API", "Node.js", "PostgreSQL"],
      risks: ["初期工程复杂度高于单体 Next.js", "需要额外处理鉴权和部署编排"],
      recommendation: "medium"
    },
    {
      id: "python-fastapi",
      name: "FastAPI + React",
      reason: "适合模型调用、数据处理和后端任务较重的产品。",
      components: ["FastAPI", "React", "PostgreSQL", "Background Jobs"],
      risks: ["需要维护前后端双工程", "Node/Next 生态组件复用度较低"],
      recommendation: "medium"
    }
  ];
}

export async function generateTechStackRecommendations(projectId: string) {
  const project = await loadProjectFlowData(projectId);
  const prd = getLatestPrd(project) || generateProductPrdMarkdown(toPackProject(project), getLatestResearch(project));
  const fallback = { recommendations: defaultTechStacks() };
  const generated = await generateJsonWithModel({
    config: modelConfigFromProject(project),
    system: "你是资深软件架构师。只输出 JSON，字段为 recommendations 数组。",
    user: `基于 PRD 给出 3 个技术栈方案。每项包含 id,name,reason,components,rRisks/risks,recommendation(high|medium|low)。\nPRD:\n${prd}`,
    fallback
  });
  const recommendations = (generated.recommendations ?? fallback.recommendations).map((item) => ({
    ...item,
    risks: asStringArray((item as Record<string, unknown>).risks ?? (item as Record<string, unknown>).rRisks),
    components: asStringArray((item as Record<string, unknown>).components)
  })) as TechStackRecommendation[];
  await prisma.generatedArtifact.create({ data: { projectId, artifactType: "tech_stack_recommendations", content: JSON.stringify(recommendations) } });
  return recommendations;
}

export async function selectProjectTechStack(projectId: string, stackId: string) {
  const project = await loadProjectFlowData(projectId);
  const selected = parseTechStackRecommendations(project).find((stack) => stack.id === stackId);
  if (!selected) throw new Error("技术栈方案不存在。");
  const value = `${selected.name}: ${selected.components.join(", ")}`;
  await prisma.$transaction([
    prisma.project.update({ where: { id: projectId }, data: { preferredTechStack: value } }),
    prisma.generatedArtifact.create({ data: { projectId, artifactType: "selected_tech_stack", content: JSON.stringify(selected) } })
  ]);
  return selected;
}

export async function refreshLatestResearchRun(projectId: string) {
  const project = await loadProjectFlowData(projectId);
  const latestRun = project.researchRuns[0];
  if (!latestRun?.hermesRunId || latestRun.parsedOutputJson || ["failed", "completed_without_output"].includes(latestRun.status)) return latestRun;

  return refreshResearchRun(latestRun);
}

export async function runProjectResearch(projectId: string) {
  return startProjectResearch(projectId);
}

export async function startProjectResearch(projectId: string) {
  const project = await loadProjectFlowData(projectId);
  const latestRun = project.researchRuns[0];
  if (latestRun && ["queued", "running"].includes(latestRun.status)) return latestRun;

  const { inputPrompt } = buildProjectResearchRequest(project);
  const dbRun = await prisma.researchRun.create({
    data: {
      projectId,
      mode: hermesClient.mode(),
      status: "queued",
      inputPrompt
    }
  });

  return dbRun;
}

function coerceWorkerResult(result: { hermesRunId: string; mode: HermesMode; status: HermesRunStatus; rawOutput: string; parsedOutput?: HermesResearchOutput }) {
  if (!result.parsedOutput && (result.status === "queued" || result.status === "running")) {
    return { ...result, status: "running" as const };
  }
  return result;
}

function staleResearchRunThresholdMs() {
  const value = Number(process.env.HERMES_RESEARCH_STALE_RUNNING_MS ?? 15 * 60 * 1000);
  return Number.isFinite(value) && value > 0 ? value : 15 * 60 * 1000;
}

export function researchWorkerPollIntervalMs() {
  const value = Number(process.env.HERMES_RESEARCH_WORKER_POLL_MS ?? 5000);
  return Number.isFinite(value) && value > 0 ? value : 5000;
}

export async function resetStaleResearchRuns(now = new Date()) {
  const cutoff = new Date(now.getTime() - staleResearchRunThresholdMs());
  return prisma.researchRun.updateMany({
    where: {
      status: "running",
      hermesRunId: null,
      createdAt: { lt: cutoff }
    },
    data: {
      status: "queued",
      rawOutput: `Research worker recovered this stale run at ${now.toISOString()}.`
    }
  });
}

async function claimNextQueuedResearchRun(): Promise<ResearchRunLike | null> {
  const next = await prisma.researchRun.findFirst({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" }
  });
  if (!next) return null;

  const claimed = await prisma.researchRun.updateMany({
    where: { id: next.id, status: "queued" },
    data: { status: "running" }
  });
  if (claimed.count === 0) return claimNextQueuedResearchRun();

  return prisma.researchRun.findUniqueOrThrow({ where: { id: next.id } });
}

export async function refreshResearchRun(run: ResearchRunLike) {
  if (!run.hermesRunId || run.parsedOutputJson || ["failed", "completed", "completed_without_output"].includes(run.status)) {
    return prisma.researchRun.findUnique({ where: { id: run.id } });
  }

  const result = coerceWorkerResult(await hermesClient.getRunResult(run.hermesRunId));
  await persistResearchResult(run.projectId, run.id, result);
  return prisma.researchRun.findUnique({ where: { id: run.id } });
}

async function processClaimedResearchRun(run: ResearchRunLike): Promise<ResearchWorkerResult> {
  try {
    if (run.hermesRunId) {
      const refreshed = await refreshResearchRun(run);
      return { processed: true, action: "refreshed", runId: run.id, status: refreshed?.status };
    }

    const project = await loadProjectFlowData(run.projectId);
    const { input } = buildProjectResearchRequest(project);
    const result = coerceWorkerResult(await hermesClient.createResearchRun(input));
    await persistResearchResult(run.projectId, run.id, result);
    return { processed: true, action: "claimed", runId: run.id, status: result.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.researchRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        rawOutput: message,
        completedAt: new Date()
      }
    });
    return { processed: true, action: "failed", runId: run.id, status: "failed" };
  }
}

export async function processResearchWorkerOnce(): Promise<ResearchWorkerResult> {
  const reset = await resetStaleResearchRuns();
  if (reset.count > 0) return { processed: true, action: "reset_stale", status: "queued" };

  const runningExternalRun = await prisma.researchRun.findFirst({
    where: {
      status: "running",
      hermesRunId: { not: null },
      parsedOutputJson: null
    },
    orderBy: { createdAt: "asc" }
  });
  if (runningExternalRun) return processClaimedResearchRun(runningExternalRun);

  const claimed = await claimNextQueuedResearchRun();
  if (!claimed) return { processed: false, action: "idle" };
  return processClaimedResearchRun(claimed);
}

export async function runResearchWorkerLoop() {
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!stopping) {
    const result = await processResearchWorkerOnce();
    if (!result.processed) {
      await new Promise((resolve) => setTimeout(resolve, researchWorkerPollIntervalMs()));
    }
  }
}

export async function generateProjectPrd(projectId: string) {
  const project = await loadProjectFlowData(projectId);
  const content = generatePrdMarkdown(toPackProject(project), getLatestResearch(project));
  return prisma.generatedArtifact.create({ data: { projectId, artifactType: "prd", content } });
}

export async function saveProjectPrd(projectId: string, content: string) {
  return prisma.generatedArtifact.create({ data: { projectId, artifactType: "prd", content } });
}

function competitorMatrixForEvaluation(project: ProjectWithFlowData) {
  return project.competitors.map((competitor) => ({
    name: competitor.name,
    type: competitor.type,
    url: competitor.url,
    description: competitor.description,
    threatLevel: competitor.threatLevel,
    reuseStrategy: competitor.reuseStrategy,
    coreFeatures: parseJson<string[]>(competitor.coreFeaturesJson, []),
    strengths: parseJson<string[]>(competitor.strengthsJson, []),
    weaknesses: parseJson<string[]>(competitor.weaknessesJson, []),
    reusableIdeas: parseJson<string[]>(competitor.reusableIdeasJson, [])
  }));
}

function persistEvaluation(projectId: string, evaluation: EvaluationResult) {
  return prisma.evaluation.create({
    data: {
      projectId,
      pdrs: evaluation.pdrs,
      opportunityScore: evaluation.opportunityScore.score,
      competitiveScore: evaluation.competitiveScore.score,
      specificationScore: evaluation.specificationScore.score,
      prototypeScore: evaluation.prototypeScore.score,
      promptReadinessScore: evaluation.promptReadinessScore.score,
      redundancyRisk: evaluation.redundancyRisk,
      differentiationScore: evaluation.differentiationScore,
      decision: evaluation.decision,
      risksJson: JSON.stringify(evaluation.risks),
      nextActionsJson: JSON.stringify(evaluation.nextActions),
      scoreReasonsJson: JSON.stringify({
        opportunity: evaluation.opportunityScore.reasons,
        competitive: evaluation.competitiveScore.reasons,
        specification: evaluation.specificationScore.reasons,
        prototype: evaluation.prototypeScore.reasons,
        promptReadiness: evaluation.promptReadinessScore.reasons
      })
    }
  });
}

export async function evaluateProjectById(projectId: string): Promise<EvaluationResult> {
  const project = await loadProjectFlowData(projectId);
  const { evaluation } = evaluateProjectFlow(project);
  const research = getLatestResearch(project);
  const prd = getLatestPrd(project) || generateProductPrdMarkdown(toPackProject(project), research);
  const hermesEvaluation = await hermesClient.evaluateReadiness({
    projectId,
    idea: project.idea,
    industry: project.industry,
    targetUser: project.targetUser,
    competitors: project.competitors.map((competitor) => ({ threatLevel: competitor.threatLevel, reuseStrategy: competitor.reuseStrategy })),
    differentiationScore: research?.differentiation.differentiation_score ?? evaluation.differentiationScore,
    prdMarkdown: prd,
    prd,
    codexPackText: collectCodexPackText(project),
    differentiation: research?.differentiation ?? buildDifferentiationBrief(research),
    competitorMatrix: competitorMatrixForEvaluation(project),
    previousHermesResearch: research
  });
  await persistEvaluation(projectId, hermesEvaluation);
  return hermesEvaluation;
}

export async function exportProjectCodexPack(projectId: string): Promise<CodexPackFile[]> {
  const project = await loadProjectFlowData(projectId);
  const { evaluation, research, prd } = evaluateProjectFlow(project);
  const draftFiles = generateCodexPack(toPackProject(project), research, evaluation, prd);
  const finalEvaluation = evaluateProject({
    idea: project.idea,
    industry: project.industry,
    targetUser: project.targetUser,
    competitors: project.competitors.map((competitor) => ({ threatLevel: competitor.threatLevel, reuseStrategy: competitor.reuseStrategy })),
    differentiationScore: research?.differentiation.differentiation_score ?? 60,
    prdMarkdown: prd,
    codexPackText: packToClipboardText(draftFiles)
  });
  const files = generateCodexPack(toPackProject(project), research, finalEvaluation, prd);
  await prisma.$transaction([
    prisma.generatedArtifact.deleteMany({ where: { projectId, artifactType: { in: codexPackArtifactTypes } } }),
    ...files.map((file) => prisma.generatedArtifact.create({ data: { projectId, artifactType: file.filename, content: file.content } }))
  ]);
  return files;
}

export async function generateProjectPrototypePrompt(projectId: string) {
  const project = await loadProjectFlowData(projectId);
  const research = getLatestResearch(project);
  const prd = getLatestPrd(project) || generateProductPrdMarkdown(toPackProject(project), research);
  const brief = buildDifferentiationBrief(research);
  const prompt = [
    `为项目「${project.name}」设计一个可交互产品原型。`,
    "",
    "硬性要求：",
    "- 第一屏直接呈现可用工作台，不要做营销落地页。",
    "- 覆盖核心工作流、空状态、加载状态、错误状态和保存反馈。",
    "- 视觉风格克制、信息密度适中，适合业务型 SaaS 工具。",
    "- 使用项目已选技术栈约束实现方式。",
    "",
    `技术栈：${project.preferredTechStack || "待选择"}`,
    "",
    "PRD 摘要：",
    prd.slice(0, 4000),
    "",
    "差异化依据：",
    brief.scoreBasis.map((item) => `- ${item}`).join("\n") || "- 暂无 Hermes 差异化依据，请在原型中标记待验证。",
    "",
    "需要避免：",
    research?.differentiation.should_not_build_features.map((item) => `- ${item}`).join("\n") || "- 不要加入与核心场景无关的通用功能。"
  ].join("\n");
  await prisma.generatedArtifact.create({ data: { projectId, artifactType: "prototype_design_prompt", content: prompt } });
  return prompt;
}

export async function generateProjectReportDeckPackage(projectId: string): Promise<ReportDeckPackage> {
  const project = await loadProjectFlowData(projectId);
  const research = getLatestResearch(project);
  const { evaluation, prd } = evaluateProjectFlow(project);
  const deckTitle = `${project.name} 汇报材料`;
  const outline = generatePitchDeckOutline(toPackProject(project), research, evaluation);
  const prototype = generatePrototypeSpec(toPackProject(project), research);
  const fallback: ReportDeckPackage = {
    deckTitle,
    prompt: [
      `请基于以下材料制作 ${deckTitle}。`,
      "输出 6-8 页 PPT，包含问题、用户、竞品、差异化、PRD 范围、技术栈、风险和下一步。",
      "",
      "PRD:",
      prd,
      "",
      "路演大纲:",
      outline,
      "",
      "原型说明:",
      prototype
    ].join("\n"),
    slides: [
      { title: "执行摘要", bullets: [project.idea, `目标用户：${project.targetUser}`, `PDRS：${Math.round(evaluation.pdrs)}`], speakerNotes: "说明项目目标、判断结论和当前状态。" },
      { title: "问题与用户", bullets: [project.targetUser, parseReportAssistantContext(project).problemAndUsers || project.idea], speakerNotes: "聚焦真实用户问题，避免泛化描述。" },
      { title: "竞品与差异化", bullets: buildDifferentiationBrief(research).scoreBasis.slice(0, 5), speakerNotes: "用 Hermes 研究结果支撑差异化判断。" },
      { title: "PRD 范围", bullets: parseReportAssistantContext(project).coreFeatures, speakerNotes: "说明 3-5 个核心功能和非目标。" },
      { title: "技术与交付", bullets: [project.preferredTechStack || "技术栈待选择", "生成 Codex Pack 后进入实现"], speakerNotes: "说明工程可执行性和交付路径。" }
    ],
    manuscript: [outline, "\n\n## PRD\n", prd].join("")
  };
  const generated = await generateJsonWithModel({
    config: modelConfigFromProject(project),
    system: "你是专业路演材料顾问。只输出 JSON。",
    user: `把以下材料整理为 PPT 包，字段包含 deckTitle,prompt,slides,manuscript。\n${fallback.prompt}`,
    fallback
  });
  const reportPackage = normalizeReportDeckPackage(generated, fallback);
  await prisma.generatedArtifact.create({ data: { projectId, artifactType: "hermes_ppt_task", content: JSON.stringify(reportPackage) } });
  return reportPackage;
}

function scheduleFromOptions(project: { needContinuousCompetitorMonitoring: boolean }, options?: MonitorJobOptions) {
  if (options?.cadence === "daily") return "0 9 * * *";
  if (options?.cadence === "weekly") return "0 9 * * 1";
  if (options?.cadence === "monthly") return "0 9 1 * *";
  return project.needContinuousCompetitorMonitoring ? "0 9 * * 1" : "0 9 1 * *";
}

export async function createProjectMonitorJob(projectId: string, options?: MonitorJobOptions) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const schedule = scheduleFromOptions(project, options);
  const result = await hermesClient.createMonitorJob(projectId, schedule);
  const job = await prisma.monitorJob.create({ data: { projectId, hermesCronJobId: result.hermesCronJobId, schedule, status: result.status ?? "active" } });
  if (options?.tasks?.length || options?.taskConfigs?.length) {
    await prisma.generatedArtifact.create({
      data: {
        projectId,
        artifactType: "monitor_preferences",
        content: JSON.stringify({ tasks: options.tasks ?? [], taskConfigs: options.taskConfigs ?? [] })
      }
    });
  }
  return job;
}
