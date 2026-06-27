import type { AsyncTask, Prisma } from "@prisma/client";
import JSZip from "jszip";
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
import type { HermesMode, HermesResearchOutput, HermesRunResult, HermesRunStatus } from "@/lib/hermes/types";
import { prisma } from "@/lib/db/prisma";
import { generateJsonWithModel, type ModelConfig } from "@/lib/model/client";
import { acquireIdempotencyKey, cacheDelete, waitForTaskNotification } from "@/lib/cache/redis";
import {
  asyncWorkerPollIntervalMs,
  asyncTaskLeaseMs,
  activeTaskStatuses,
  claimTask,
  completeTask,
  enqueueTask,
  failTask,
  findActiveTask,
  heartbeat,
  markTaskWaiting,
  parseTaskPayload,
  renewTaskLease,
  researchTaskType
} from "@/lib/async-tasks/store";
import { logEvent, recordMetric, startSpan, finishSpan } from "@/lib/observability";
import { deleteProjectStoredArtifactsByTypes, putArtifact } from "@/lib/artifacts/store";
import { isAgentReviewTask, latestBlockingReview, processAgentReviewTask } from "@/lib/agents/service";
import {
  generateProjectSkillToolRecommendations,
  parseProjectSkillToolRecommendations,
  projectSkillToolRecommendationsArtifact
} from "@/lib/skills/project-recommendations";
import {
  hermesResearchResourceLogArtifact,
  hermesResourceConfigArtifact,
  parseHermesResourceConfig,
  type HermesResearchResourceLog,
  type HermesResourceUsageItem
} from "@/lib/skills/resource-config";

export const codexPackArtifactTypes = [
  "README.md",
  "PRD.md",
  "competitor_report.md",
  "evaluation_report.md",
  "EVIDENCE_PDRS.md",
  "ROADMAP.md",
  "PRD_REVIEW.md",
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
  action: "idle" | "reset_stale" | "claimed" | "refreshed" | "waited" | "succeeded" | "failed" | "dead";
  runId?: string;
  taskId?: string;
  status?: string;
};

type ResearchTaskPayload = {
  researchRunId: string;
};

export const evidencePdrsArtifact = "evidence_pdrs";
export const roadmapArtifact = "roadmap";
export const prdReviewGateArtifact = "prd_review_gate";
export const evidencePdrsMarkdownArtifact = "EVIDENCE_PDRS.md";
export const roadmapMarkdownArtifact = "ROADMAP.md";
export const prdReviewMarkdownArtifact = "PRD_REVIEW.md";

export const evidencePdrsDimensionNames = [
  "problemClarity",
  "userValue",
  "marketGap",
  "differentiation",
  "feasibility",
  "deliveryComplexity",
  "businessImpact",
  "evidenceStrength",
  "complianceRisk",
  "overallScore"
] as const;

export type EvidencePdrsDimensionName = typeof evidencePdrsDimensionNames[number];
export type PdrsRecommendation = "GO" | "HOLD" | "PIVOT" | "KILL";
export type ReviewVerdict = "PASS" | "WARN" | "BLOCK";
export type ReviewerRole = "Product" | "UX" | "Engineering" | "QA" | "Compliance" | "Business";
export type ReviewerStatus = "completed" | "missing" | "invalid" | "failed";
export type RoadmapStage = "NOW" | "NEXT" | "LATER";
export type RoadmapPriority = "P0" | "P1" | "P2" | "P3";
export type RoadmapItemType = "FEATURE" | "INFRA" | "RESEARCH" | "COMPLIANCE" | "UX" | "QA" | "OPS";

export type EvidencePdrsDimension = {
  score: number;
  reason: string;
  evidence: string[];
  confidence: number;
  risks: string[];
  missingEvidence: string[];
};

export type EvidenceBasedPdrsResult = {
  dimensions: Record<EvidencePdrsDimensionName, EvidencePdrsDimension>;
  overallScore: number;
  finalRecommendation: PdrsRecommendation;
  generatedAt: string;
};

export type RoadmapItem = {
  title: string;
  description: string;
  stage: RoadmapStage;
  priority: RoadmapPriority;
  type: RoadmapItemType;
  rationale: string;
  dependencies: string[];
  risks: string[];
  estimatedEffort: string;
  successMetrics: string[];
  acceptanceCriteria: string[];
};

export type RoadmapResult = {
  generatedAt: string;
  items: RoadmapItem[];
};

export type PrdReviewerResult = {
  role: ReviewerRole;
  status: ReviewerStatus;
  verdict?: ReviewVerdict;
  summary: string;
  findings: string[];
  requiredChanges: string[];
  suggestions: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  confidence?: number;
};

export type PrdReviewGateResult = {
  status: "completed" | "incomplete";
  reviewerStatuses: Record<ReviewerRole, ReviewerStatus>;
  reviewers: PrdReviewerResult[];
  missingReviewers: ReviewerRole[];
  failedReviewers: ReviewerRole[];
  gateDecision?: ReviewVerdict;
  generatedAt: string;
};

export const prdReviewerRoles: ReviewerRole[] = ["Product", "UX", "Engineering", "QA", "Compliance", "Business"];
const prdReviewerMaxAttempts = 3;
const prdReviewerRetryDelayMs = [450, 900];
const prdReviewerRoleBriefs: Record<ReviewerRole, string> = {
  Product: "审查用户问题、目标用户、价值主张、范围边界、MVP 优先级和验收标准是否足以驱动开发。",
  UX: "审查用户路径、信息架构、交互负担、状态覆盖、错误反馈和可用性风险。",
  Engineering: "审查技术可实现性、模块边界、数据模型、API 合约、异步任务、集成复杂度和维护风险。",
  QA: "审查验收条件、测试边界、异常路径、回归风险、可测试性和发布前质量门槛。",
  Compliance: "审查隐私、安全、权限、审计、金融适当性、数据处理和监管边界。",
  Business: "审查商业目标、成本收益、上线节奏、市场风险、运营依赖和成功指标。"
};

export function isReviewerRole(value: string): value is ReviewerRole {
  return prdReviewerRoles.includes(value as ReviewerRole);
}

function reviewerRoleFromString(value: string): ReviewerRole {
  if (isReviewerRole(value)) return value;
  throw new Error(`Unsupported PRD reviewer role: ${value}`);
}

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

export function parseLatestEvidencePdrs(project: ProjectArtifacts): EvidenceBasedPdrsResult | undefined {
  const raw = getArtifactContent(project, evidencePdrsArtifact);
  if (!raw) return undefined;
  const parsed = parseJson<unknown>(raw, undefined);
  try {
    return parsed ? normalizeEvidenceBasedPdrs(parsed, parsed as EvidenceBasedPdrsResult) : undefined;
  } catch {
    return undefined;
  }
}

export function parseLatestRoadmap(project: ProjectArtifacts): RoadmapResult | undefined {
  const raw = getArtifactContent(project, roadmapArtifact);
  if (!raw) return undefined;
  const parsed = parseJson<unknown>(raw, undefined);
  try {
    return parsed ? normalizeRoadmap(parsed, parsed as RoadmapResult) : undefined;
  } catch {
    return undefined;
  }
}

export function parseLatestPrdReviewGate(project: ProjectArtifacts): PrdReviewGateResult | undefined {
  const raw = getArtifactContent(project, prdReviewGateArtifact);
  if (!raw) return undefined;
  const parsed = parseJson<unknown>(raw, undefined);
  try {
    return parsed ? normalizePrdReviewGate(parsed) : undefined;
  } catch {
    return undefined;
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n|[,，、;]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clampScore(value: unknown, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function clampConfidence(value: unknown, fallback = 0.25) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (number <= 1) return Math.max(0, Math.min(1, Number(number.toFixed(2))));
  return Math.max(0, Math.min(1, Number((number / 100).toFixed(2))));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const normalized = String(value || "").trim().toUpperCase();
  return allowed.find((item) => item === normalized) ?? fallback;
}

function titleValue(value: unknown, fallback: string) {
  const text = String(value || "").trim();
  return text || fallback;
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEvidenceDimension(value: unknown, fallback: EvidencePdrsDimension): EvidencePdrsDimension {
  const record = isRecord(value) ? value : {};
  return {
    score: clampScore(record.score, fallback.score),
    reason: titleValue(record.reason, fallback.reason),
    evidence: asStringArray(record.evidence).length ? asStringArray(record.evidence) : fallback.evidence,
    confidence: clampConfidence(record.confidence, fallback.confidence),
    risks: asStringArray(record.risks).length ? asStringArray(record.risks) : fallback.risks,
    missingEvidence: asStringArray(record.missingEvidence).length ? asStringArray(record.missingEvidence) : fallback.missingEvidence
  };
}

function defaultEvidenceDimension(label: EvidencePdrsDimensionName, score: number, reason: string, evidence: string[], missingEvidence: string[] = []): EvidencePdrsDimension {
  return {
    score: clampScore(score),
    reason,
    evidence,
    confidence: evidence.length > 1 && missingEvidence.length === 0 ? 0.65 : 0.35,
    risks: missingEvidence.length ? ["证据不足时不能直接进入高置信度交付判断。"] : [],
    missingEvidence: missingEvidence.length ? missingEvidence : [`${label} 仍需要更多外部验证。`]
  };
}

export function fallbackEvidencePdrs(project: ProjectWithFlowData, evaluation: EvaluationResult, prd: string, research?: HermesResearchOutput): EvidenceBasedPdrsResult {
  const reportContext = parseReportAssistantContext(project);
  const competitorEvidence = project.competitors.map((item) => `${item.name} 威胁等级 ${item.threatLevel}`);
  const researchEvidence = research ? ["Hermes 已返回竞品和差异化结构化结果。"] : [];
  const prdEvidence = prd ? ["已存在 PRD，可用于规格完整度判断。"] : [];
  const dimensions: Record<EvidencePdrsDimensionName, EvidencePdrsDimension> = {
    problemClarity: defaultEvidenceDimension("problemClarity", evaluation.opportunityScore.score, evaluation.opportunityScore.reasons.join(" "), [project.idea, reportContext.problemAndUsers].filter(Boolean), reportContext.problemAndUsers ? [] : ["缺少已确认的问题与用户描述。"]),
    userValue: defaultEvidenceDimension("userValue", reportContext.coreFeatures.length >= 3 ? 72 : 45, "以已确认核心功能和目标用户估算用户价值。", [project.targetUser, ...reportContext.coreFeatures], reportContext.coreFeatures.length >= 3 ? [] : ["缺少 3-5 个已确认核心功能。"]),
    marketGap: defaultEvidenceDimension("marketGap", evaluation.competitiveScore.score, "根据竞品数量、威胁等级和差异化得分估算市场空隙。", competitorEvidence, competitorEvidence.length ? [] : ["缺少 Hermes 竞品矩阵。"]),
    differentiation: defaultEvidenceDimension("differentiation", evaluation.differentiationScore, "根据 Hermes 差异化分数和 MVP 修改建议估算。", researchEvidence.concat(research?.differentiation.score_basis ?? []), research ? [] : ["缺少 Hermes 差异化证据。"]),
    feasibility: defaultEvidenceDimension("feasibility", evaluation.specificationScore.score, "根据 PRD 中的数据模型、API 合约和验收标准估算。", prdEvidence, prd ? [] : ["缺少 PRD。"]),
    deliveryComplexity: defaultEvidenceDimension("deliveryComplexity", 100 - evaluation.redundancyRisk, "交付复杂度以同质化风险和规格完整度反向估算。", [`同质化风险：${evaluation.redundancyRisk}`], ["缺少工程拆分、依赖图和团队容量信息。"]),
    businessImpact: defaultEvidenceDimension("businessImpact", evaluation.opportunityScore.score, "根据命题、行业语境和目标用户估算业务影响。", [project.industry, project.targetUser, project.idea], ["缺少真实商业指标、定价或转化数据。"]),
    evidenceStrength: defaultEvidenceDimension("evidenceStrength", Math.round((competitorEvidence.length ? 50 : 20) + (prd ? 20 : 0) + (research ? 20 : 0)), "统计 PRD、Hermes 研究和竞品证据覆盖度。", [...competitorEvidence, ...prdEvidence, ...researchEvidence], ["缺少用户访谈、真实使用数据或外部市场数据。"]),
    complianceRisk: defaultEvidenceDimension("complianceRisk", project.needFinancialSuitabilityCheck ? 45 : 70, "根据金融适当性标记和 PRD 风险边界估算。", project.needFinancialSuitabilityCheck ? ["项目要求金融适当性检查。"] : ["未标记强金融适当性约束。"], project.needFinancialSuitabilityCheck ? ["缺少合规审查结论和禁用表述清单。"] : ["仍需人工确认是否涉及监管边界。"]),
    overallScore: defaultEvidenceDimension("overallScore", evaluation.pdrs, "沿用当前 PDRS 作为保守总体分，并标注证据缺口。", [`当前 PDRS：${evaluation.pdrs}`], ["总体分仍需 Evidence PDRS 模型补充逐项证据。"])
  };
  const overallScore = dimensions.overallScore.score;
  return {
    dimensions,
    overallScore,
    finalRecommendation: overallScore >= 85 ? "GO" : overallScore >= 70 ? "HOLD" : overallScore >= 50 ? "PIVOT" : "KILL",
    generatedAt: new Date().toISOString()
  };
}

export function normalizeEvidenceBasedPdrs(value: unknown, fallback: EvidenceBasedPdrsResult): EvidenceBasedPdrsResult {
  const record = isRecord(value) ? value : {};
  const rawDimensions = isRecord(record.dimensions) ? record.dimensions : record;
  const dimensions = evidencePdrsDimensionNames.reduce((acc, name) => {
    acc[name] = normalizeEvidenceDimension(rawDimensions[name], fallback.dimensions[name]);
    return acc;
  }, {} as Record<EvidencePdrsDimensionName, EvidencePdrsDimension>);
  const overallScore = clampScore(record.overallScore ?? dimensions.overallScore.score, fallback.overallScore);
  dimensions.overallScore = { ...dimensions.overallScore, score: overallScore };
  return {
    dimensions,
    overallScore,
    finalRecommendation: enumValue(record.finalRecommendation, ["GO", "HOLD", "PIVOT", "KILL"] as const, fallback.finalRecommendation),
    generatedAt: titleValue(record.generatedAt, fallback.generatedAt)
  };
}

function normalizeRoadmapItem(value: unknown, index: number): RoadmapItem {
  const record = isRecord(value) ? value : {};
  return {
    title: titleValue(record.title, `待验证路线图项 ${index + 1}`),
    description: titleValue(record.description, "该事项需要在后续产品澄清后细化。"),
    stage: enumValue(record.stage, ["NOW", "NEXT", "LATER"] as const, index === 0 ? "NOW" : index === 1 ? "NEXT" : "LATER"),
    priority: enumValue(record.priority, ["P0", "P1", "P2", "P3"] as const, index === 0 ? "P0" : "P2"),
    type: enumValue(record.type, ["FEATURE", "INFRA", "RESEARCH", "COMPLIANCE", "UX", "QA", "OPS"] as const, "RESEARCH"),
    rationale: titleValue(record.rationale, "该事项来自当前 PRD、调研或证据缺口。"),
    dependencies: asStringArray(record.dependencies),
    risks: asStringArray(record.risks),
    estimatedEffort: titleValue(record.estimatedEffort, "待估算"),
    successMetrics: asStringArray(record.successMetrics),
    acceptanceCriteria: asStringArray(record.acceptanceCriteria)
  };
}

export function normalizeRoadmap(value: unknown, fallback: RoadmapResult): RoadmapResult {
  const record = isRecord(value) ? value : {};
  const rawItems = Array.isArray(record.items) ? record.items : Array.isArray(value) ? value : fallback.items;
  const items = rawItems.map((item, index) => normalizeRoadmapItem(item, index)).filter((item) => item.title);
  return {
    generatedAt: titleValue(record.generatedAt, fallback.generatedAt),
    items: items.length ? items : fallback.items
  };
}

function fallbackRoadmap(project: ProjectWithFlowData, prd: string, pdrs?: EvidenceBasedPdrsResult): RoadmapResult {
  const reportContext = parseReportAssistantContext(project);
  const features = reportContext.coreFeatures.length ? reportContext.coreFeatures : ["确认问题与用户", "生成 PRD", "导出 Codex Pack"];
  return {
    generatedAt: new Date().toISOString(),
    items: features.slice(0, 5).map((feature, index) => ({
      title: feature,
      description: `围绕「${feature}」完成最小可验证能力。`,
      stage: index === 0 ? "NOW" : index === 1 ? "NEXT" : "LATER",
      priority: index === 0 ? "P0" : index === 1 ? "P1" : "P2",
      type: index === 0 ? "FEATURE" : "RESEARCH",
      rationale: pdrs ? `Evidence PDRS 当前建议为 ${pdrs.finalRecommendation}，优先补齐高影响事项。` : "基于当前 PRD 与项目上下文生成保守路线图。",
      dependencies: prd ? ["已生成 PRD"] : ["需要先生成 PRD"],
      risks: ["证据不足时优先做验证，不直接扩大范围。"],
      estimatedEffort: "1-2 天",
      successMetrics: ["核心用户路径可演示", "验收标准可执行"],
      acceptanceCriteria: ["页面或服务行为可复现", "失败状态有明确反馈"]
    }))
  };
}

function normalizeReviewer(role: ReviewerRole, value: unknown): PrdReviewerResult {
  if (!isRecord(value)) {
    return { role, status: "missing", summary: "未返回该角色审查结果。", findings: [], requiredChanges: [], suggestions: [], riskLevel: "HIGH" };
  }
  const rawStatus = String(value.status || "").toLowerCase();
  if (rawStatus === "failed") {
    return { role, status: "failed", summary: titleValue(value.summary || value.error, "该角色审查执行失败。"), findings: [], requiredChanges: [], suggestions: [], riskLevel: "HIGH" };
  }
  const rawVerdict = String(value.verdict || "").trim().toUpperCase();
  const verdictAllowed = ["PASS", "WARN", "BLOCK"].includes(rawVerdict);
  const verdict = enumValue(value.verdict, ["PASS", "WARN", "BLOCK"] as const, "WARN");
  const confidenceNumber = Number(value.confidence);
  const findings = asStringArray(value.findings);
  const hasValidConfidence = Number.isFinite(confidenceNumber);
  const valid = verdictAllowed && hasValidConfidence && findings.length > 0;
  return {
    role,
    status: valid ? "completed" : "invalid",
    verdict: valid ? verdict : undefined,
    summary: titleValue(value.summary, valid ? "审查完成。" : "审查结果缺少 verdict、confidence 或 findings。"),
    findings,
    requiredChanges: asStringArray(value.requiredChanges),
    suggestions: asStringArray(value.suggestions),
    riskLevel: enumValue(value.riskLevel, ["LOW", "MEDIUM", "HIGH"] as const, "MEDIUM"),
    confidence: hasValidConfidence ? clampConfidence(value.confidence) : undefined
  };
}

export function mergePrdReviewReviewer(existing: PrdReviewGateResult | undefined, reviewer: PrdReviewerResult, generatedAt = new Date().toISOString()) {
  const reviewers = prdReviewerRoles.map((role) => {
    if (role === reviewer.role) return reviewer;
    return existing?.reviewers.find((item) => item.role === role) ?? normalizeReviewer(role, undefined);
  });
  return aggregatePrdReviewGate(reviewers, generatedAt);
}

export function aggregatePrdReviewGate(reviewers: PrdReviewerResult[], generatedAt = new Date().toISOString()): PrdReviewGateResult {
  const reviewerStatuses = prdReviewerRoles.reduce((acc, role) => {
    acc[role] = reviewers.find((reviewer) => reviewer.role === role)?.status ?? "missing";
    return acc;
  }, {} as Record<ReviewerRole, ReviewerStatus>);
  const missingReviewers = prdReviewerRoles.filter((role) => reviewerStatuses[role] === "missing");
  const failedReviewers = prdReviewerRoles.filter((role) => reviewerStatuses[role] === "failed" || reviewerStatuses[role] === "invalid");
  const complete = prdReviewerRoles.every((role) => reviewerStatuses[role] === "completed");
  const verdicts = reviewers.map((reviewer) => reviewer.verdict).filter(Boolean);
  return {
    status: complete ? "completed" : "incomplete",
    reviewerStatuses,
    reviewers,
    missingReviewers,
    failedReviewers,
    gateDecision: complete
      ? verdicts.includes("BLOCK") ? "BLOCK" : verdicts.includes("WARN") ? "WARN" : "PASS"
      : undefined,
    generatedAt
  };
}

export function normalizePrdReviewGate(value: unknown, fallback?: PrdReviewGateResult): PrdReviewGateResult {
  const record = isRecord(value) ? value : {};
  const rawReviewers = Array.isArray(record.reviewers) ? record.reviewers : [];
  const reviewers = prdReviewerRoles.map((role) => normalizeReviewer(role, rawReviewers.find((item) => isRecord(item) && item.role === role)));
  if (reviewers.every((reviewer) => reviewer.status === "missing") && fallback) return fallback;
  return aggregatePrdReviewGate(reviewers, titleValue(record.generatedAt, fallback?.generatedAt ?? new Date().toISOString()));
}

function mdList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- 暂无";
}

export function renderEvidencePdrsMarkdown(result: EvidenceBasedPdrsResult) {
  const sections = evidencePdrsDimensionNames.map((name) => {
    const dimension = result.dimensions[name];
    return `## ${name}\n- 分数：${dimension.score}\n- 置信度：${Math.round(dimension.confidence * 100)}%\n- 原因：${dimension.reason}\n\n### Evidence\n${mdList(dimension.evidence)}\n\n### Risks\n${mdList(dimension.risks)}\n\n### Missing Evidence\n${mdList(dimension.missingEvidence)}`;
  }).join("\n\n");
  return `# Evidence-based PDRS\n\n- Overall Score：${result.overallScore}\n- Final Recommendation：${result.finalRecommendation}\n- Generated At：${result.generatedAt}\n\n${sections}\n`;
}

export function renderRoadmapMarkdown(result: RoadmapResult) {
  const stages: RoadmapStage[] = ["NOW", "NEXT", "LATER"];
  return `# Roadmap\n\n- Generated At：${result.generatedAt}\n\n${stages.map((stage) => {
    const items = result.items.filter((item) => item.stage === stage);
    return `## ${stage}\n\n${items.length ? items.map((item) => `### ${item.priority} · ${item.title}\n- 类型：${item.type}\n- 说明：${item.description}\n- 理由：${item.rationale}\n- 依赖：${item.dependencies.join("、") || "无"}\n- 风险：${item.risks.join("、") || "无"}\n- 估算：${item.estimatedEffort}\n\n#### Success Metrics\n${mdList(item.successMetrics)}\n\n#### Acceptance Criteria\n${mdList(item.acceptanceCriteria)}`).join("\n\n") : "暂无事项"}`;
  }).join("\n\n")}\n`;
}

export function renderPrdReviewMarkdown(result: PrdReviewGateResult) {
  const warning = result.status === "incomplete" ? "\n> Gate 未完成，不能作为 Codex Pack 交接依据。\n" : "";
  const decision = result.gateDecision ? `- Gate Decision：${result.gateDecision}` : "- Gate Decision：未生成";
  const reviewers = result.reviewers.map((reviewer) => `## ${reviewer.role}\n- 状态：${reviewer.status}\n- Verdict：${reviewer.verdict ?? "未生成"}\n- Risk Level：${reviewer.riskLevel}\n- Confidence：${reviewer.confidence === undefined ? "无效" : `${Math.round(reviewer.confidence * 100)}%`}\n- Summary：${reviewer.summary}\n\n### Findings\n${mdList(reviewer.findings)}\n\n### Required Changes\n${mdList(reviewer.requiredChanges)}\n\n### Suggestions\n${mdList(reviewer.suggestions)}`).join("\n\n");
  return `# PRD Review Gate\n${warning}\n- Status：${result.status}\n${decision}\n- Missing Reviewers：${result.missingReviewers.join("、") || "无"}\n- Failed Reviewers：${result.failedReviewers.join("、") || "无"}\n- Generated At：${result.generatedAt}\n\n${reviewers}\n`;
}

async function persistGeneratedMarkdownPair(projectId: string, jsonType: string, jsonContent: string, markdownType: string, markdownContent: string) {
  const [jsonArtifact, markdownArtifact] = await prisma.$transaction([
    prisma.generatedArtifact.create({ data: { projectId, artifactType: jsonType, content: jsonContent } }),
    prisma.generatedArtifact.create({ data: { projectId, artifactType: markdownType, content: markdownContent } })
  ]);
  await Promise.all([
    putArtifact({ projectId, generatedArtifactId: jsonArtifact.id, artifactType: jsonType, filename: `${jsonType}.json`, content: jsonContent, mimeType: "application/json;charset=utf-8" }),
    putArtifact({ projectId, generatedArtifactId: markdownArtifact.id, artifactType: markdownType, filename: markdownType, content: markdownContent, mimeType: "text/markdown;charset=utf-8" })
  ]);
  return { jsonArtifact, markdownArtifact };
}

async function invalidateProjectCache(projectId: string) {
  await Promise.all([
    cacheDelete("projects:list"),
    cacheDelete(`projects:detail:${projectId}`)
  ]);
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

export function getProjectSkillToolRecommendations(project: ProjectArtifacts) {
  return parseProjectSkillToolRecommendations(getArtifactContent(project, projectSkillToolRecommendationsArtifact));
}

export async function createProjectSkillToolRecommendations(projectId: string) {
  const project = await loadProjectFlowData(projectId);
  const recommendations = await generateProjectSkillToolRecommendations({
    idea: project.idea,
    ideaExplanation: getArtifactContent(project, "idea_explanation"),
    industry: project.industry,
    targetUser: project.targetUser,
    needFinancialSuitabilityCheck: project.needFinancialSuitabilityCheck,
    needContinuousCompetitorMonitoring: project.needContinuousCompetitorMonitoring
  });

  await prisma.generatedArtifact.create({
    data: {
      projectId,
      artifactType: projectSkillToolRecommendationsArtifact,
      content: JSON.stringify(recommendations)
    }
  });
  await invalidateProjectCache(projectId);

  return recommendations;
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
  const resourceConfig = parseHermesResourceConfig(getArtifactContent(project, hermesResourceConfigArtifact));
  const enabledSkills = resourceConfig.mode === "manual"
    ? resourceConfig.enabled
      .filter((item) => item.kind === "skill")
      .map((item) => ({ name: item.name, path: item.path, purpose: item.purpose, description: item.descriptionZh }))
    : undefined;
  const enabledTools = resourceConfig.mode === "manual"
    ? resourceConfig.enabled
      .filter((item) => item.kind === "tool")
      .map((item) => ({ name: item.name, path: item.path, purpose: item.purpose, description: item.descriptionZh }))
    : undefined;
  const resourceBrief = resourceConfig.mode === "auto"
    ? "Hermes 资源模式：让 Hermes 自主决定本次调研使用哪些 Skills 和 Tools；不要接收详细配置页的手动启用项。"
    : [
      "Hermes 资源模式：使用详细配置页已启用的 Skills 和 Tools。",
      enabledSkills?.length ? `启用 Skills：${enabledSkills.map((item) => item.name).join("、")}` : "启用 Skills：无",
      enabledTools?.length ? `启用 Tools：${enabledTools.map((item) => item.name).join("、")}` : "启用 Tools：无"
    ].join("\n");
  return {
    inputPrompt: `Research competitors and product differentiation for: ${project.idea}\nIndustry: ${researchContext.industry}\nTarget user: ${researchContext.targetUser}\nContext:\n${researchContext.explanation}\n\n${resourceBrief}`,
    input: {
      projectId: project.id,
      idea: project.idea,
      explanation: researchContext.explanation,
      industry: researchContext.industry,
      targetUser: researchContext.targetUser,
      financialSuitability: researchContext.financialSuitability,
      preferredTechStack: project.preferredTechStack || undefined,
      resourceMode: resourceConfig.mode,
      enabledSkills,
      enabledTools
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
    usageMode: "api"
  };
}

function supplementalCodexArtifacts(project: ProjectArtifacts): CodexPackFile[] {
  const seen = new Set<string>();
  return project.artifacts
    .filter((artifact) => [evidencePdrsMarkdownArtifact, roadmapMarkdownArtifact, prdReviewMarkdownArtifact].includes(artifact.artifactType))
    .filter((artifact) => {
      if (seen.has(artifact.artifactType)) return false;
      seen.add(artifact.artifactType);
      return true;
    })
    .map((artifact) => ({ filename: artifact.artifactType, content: artifact.content }));
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
    modelConfig: project.artifacts ? packModelConfig({ artifacts: project.artifacts }) : undefined,
    supplementalArtifacts: project.artifacts ? supplementalCodexArtifacts({ artifacts: project.artifacts }) : undefined
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

function usageItems(
  items: Array<{ name: string; path?: string; purpose?: string[]; callCount?: number; status?: "used" | "planned" | "not_reported"; reason?: string }> | undefined,
  kind: "skill" | "tool",
  fallbackReason: string
): HermesResourceUsageItem[] {
  return (items ?? []).map((item) => ({
    kind,
    name: item.name,
    path: item.path,
    purpose: item.purpose,
    callCount: Number.isFinite(Number(item.callCount)) ? Math.max(0, Number(item.callCount)) : undefined,
    status: item.status === "used" || item.status === "planned" || item.status === "not_reported" ? item.status : "not_reported",
    reason: item.reason || fallbackReason
  }));
}

function buildResourceLog(projectId: string, runDbId: string, result: HermesRunResult): HermesResearchResourceLog | undefined {
  if (!result.resourceUsage) return undefined;
  return {
    projectId,
    researchRunId: runDbId,
    hermesRunId: result.hermesRunId,
    mode: result.resourceUsage.mode,
    generatedAt: new Date().toISOString(),
    skills: usageItems(result.resourceUsage.skills, "skill", result.resourceUsage.mode === "auto" ? "Hermes 自主选择或未报告调用次数。" : "来自详细配置页启用项。"),
    tools: usageItems(result.resourceUsage.tools, "tool", result.resourceUsage.mode === "auto" ? "Hermes 自主选择或未报告调用次数。" : "来自详细配置页启用项。"),
    raw: result.resourceUsage.raw
  };
}

export async function persistResearchResult(projectId: string, runDbId: string, result: HermesRunResult) {
  const runData: Prisma.ResearchRunUpdateInput = {
    hermesRunId: result.hermesRunId,
    mode: result.mode,
    status: result.status,
    rawOutput: result.rawOutput
  };
  if (result.parsedOutput) runData.parsedOutputJson = JSON.stringify(result.parsedOutput);
  if (["completed", "failed", "completed_without_output", "completed_with_fallback"].includes(result.status)) runData.completedAt = new Date();

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

  const resourceLog = ["completed", "failed", "completed_without_output", "completed_with_fallback"].includes(result.status)
    ? buildResourceLog(projectId, runDbId, result)
    : undefined;
  if (resourceLog) {
    mutations.push(prisma.generatedArtifact.create({
      data: {
        projectId,
        artifactType: hermesResearchResourceLogArtifact,
        content: JSON.stringify(resourceLog)
      }
    }));
  }

  await prisma.$transaction(mutations);
  await invalidateProjectCache(projectId);
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
  await invalidateProjectCache(projectId);
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
  const recommended = getProjectSkillToolRecommendations(project);
  const recommendedSkills = recommended.filter((item) => item.kind !== "tool").map((item) => ({ name: item.name, purpose: item.purpose }));
  const recommendedTools = recommended.filter((item) => item.kind === "tool").map((item) => ({ name: item.name, purpose: item.purpose }));
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
    targetUser: project.targetUser,
    recommendedSkills,
    recommendedTools
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
  await invalidateProjectCache(projectId);
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
  await invalidateProjectCache(projectId);
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
  await invalidateProjectCache(projectId);
  return selected;
}

export async function refreshLatestResearchRun(projectId: string) {
  const project = await loadProjectFlowData(projectId);
  const latestRun = project.researchRuns[0];
  if (!latestRun) return latestRun;
  if (latestRun.parsedOutputJson || ["failed", "completed", "completed_without_output", "completed_with_fallback"].includes(latestRun.status)) return latestRun;
  if (!latestRun.hermesRunId) return latestRun;

  return refreshResearchRun(latestRun);
}

export async function runProjectResearch(projectId: string) {
  const acquired = await acquireIdempotencyKey(`research:start:${projectId}`, 10);
  if (!acquired) {
    const activeRun = await waitForActiveResearchRun(projectId);
    if (activeRun) return activeRun;
  }

  const run = await startProjectResearch(projectId);
  const existingTask = await findActiveResearchTaskForRun(projectId, run.id);
  const task = existingTask ?? await enqueueTask({
    type: researchTaskType,
    projectId,
    payload: { researchRunId: run.id } satisfies ResearchTaskPayload,
    priority: 10,
    maxAttempts: 3
  });

  if (acquired) await processResearchTaskById(task.id);
  await invalidateProjectCache(projectId);
  return prisma.researchRun.findUnique({ where: { id: run.id } });
}

async function findActiveResearchTaskForRun(projectId: string, researchRunId: string) {
  return prisma.asyncTask.findFirst({
    where: {
      projectId,
      type: researchTaskType,
      status: { in: [...activeTaskStatuses] },
      payloadJson: { contains: `"researchRunId":"${researchRunId}"` }
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
  });
}

async function waitForActiveResearchRun(projectId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const run = await prisma.researchRun.findFirst({
      where: { projectId, status: { in: ["queued", "running"] } },
      orderBy: { createdAt: "desc" }
    });
    if (run) return run;
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  return null;
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

  await invalidateProjectCache(projectId);
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
  return asyncWorkerPollIntervalMs();
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

export async function refreshResearchRun(run: ResearchRunLike) {
  if (!run.hermesRunId || run.parsedOutputJson || ["failed", "completed", "completed_without_output", "completed_with_fallback"].includes(run.status)) {
    return prisma.researchRun.findUnique({ where: { id: run.id } });
  }

  const result = coerceWorkerResult(await hermesClient.getRunResult(run.hermesRunId));
  await persistResearchResult(run.projectId, run.id, result);
  return prisma.researchRun.findUnique({ where: { id: run.id } });
}

async function advanceResearchRun(run: ResearchRunLike) {
  if (run.parsedOutputJson || ["failed", "completed", "completed_without_output", "completed_with_fallback"].includes(run.status)) {
    return prisma.researchRun.findUnique({ where: { id: run.id } });
  }

  const originalStatus = run.status;
  let claimedRun = run;
  if (run.status === "queued") {
    const claimed = await prisma.researchRun.updateMany({
      where: { id: run.id, status: "queued" },
      data: { status: "running" }
    });
    if (claimed.count === 0) return prisma.researchRun.findUnique({ where: { id: run.id } });
    claimedRun = await prisma.researchRun.findUniqueOrThrow({ where: { id: run.id } });
  }

  if (!claimedRun.hermesRunId && claimedRun.status === "running" && originalStatus !== "queued") {
    return prisma.researchRun.findUnique({ where: { id: run.id } });
  }

  await processClaimedResearchRun(claimedRun);
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

async function processResearchTaskById(taskId: string): Promise<ResearchWorkerResult> {
  const task = await claimTask(taskId);
  if (!task) return { processed: false, action: "idle" };
  return processAsyncTask(task);
}

async function processAsyncTask(task: AsyncTask): Promise<ResearchWorkerResult> {
  if (isAgentReviewTask(task.type)) {
    return processAgentReviewTask(task);
  }

  if (task.type !== researchTaskType) {
    await failTask(task, new Error(`Unsupported async task type: ${task.type}`));
    return { processed: true, action: "failed", taskId: task.id, status: "failed" };
  }

  const payload = parseTaskPayload<ResearchTaskPayload>(task, { researchRunId: "" });
  const run = payload.researchRunId
    ? await prisma.researchRun.findUnique({ where: { id: payload.researchRunId } })
    : null;
  if (!run) {
    await failTask(task, new Error("ResearchRun not found for async task."));
    return { processed: true, action: "failed", taskId: task.id, status: "failed" };
  }

  const span = await startSpan({
    name: "research.run",
    projectId: run.projectId,
    taskId: task.id,
    attributes: { researchRunId: run.id, status: run.status, hermesRunId: run.hermesRunId }
  });

  const stopLeaseRenewal = startTaskLeaseRenewal(task);
  try {
    const advanced = await advanceResearchRun(run);
    const status = advanced?.status ?? run.status;
    const terminalSuccess = advanced?.parsedOutputJson || status === "completed_with_fallback";
    const terminalFailure = status === "failed" || status === "completed_without_output";

    if (terminalSuccess) {
      const completed = await completeTask(task, { researchRunId: run.id, status });
      if (completed.status !== "succeeded") {
        await finishSpan(span, { status: "cancelled", attributes: { status, taskStatus: completed.status } });
        return { processed: false, action: "idle", taskId: task.id, runId: run.id, status: completed.status };
      }
      await finishSpan(span, { status: "ok", attributes: { status, taskStatus: completed.status } });
      return { processed: true, action: "succeeded", taskId: task.id, runId: run.id, status };
    }

    if (terminalFailure) {
      const failed = await failTask(task, new Error(advanced?.rawOutput || `Research run ended with ${status}.`));
      if (failed.status !== "waiting" && failed.status !== "dead") {
        await finishSpan(span, { status: "cancelled", attributes: { status, taskStatus: failed.status } });
        return { processed: false, action: "idle", taskId: task.id, runId: run.id, status: failed.status };
      }
      if (failed.status === "waiting") {
        await prisma.researchRun.update({
          where: { id: run.id },
          data: {
            status: "queued",
            hermesRunId: null,
            completedAt: null
          }
        });
      }
      await finishSpan(span, { status: "error", attributes: { status, taskStatus: failed.status } });
      return { processed: true, action: failed.status === "dead" ? "dead" : "failed", taskId: task.id, runId: run.id, status: failed.status };
    }

    const waited = await markTaskWaiting(task, {
      runAfter: new Date(Date.now() + researchWorkerPollIntervalMs()),
      result: { researchRunId: run.id, status },
      message: `Research run ${run.id} is still ${status}.`
    });
    if (waited.status !== "waiting") {
      await finishSpan(span, { status: "cancelled", attributes: { status, taskStatus: waited.status } });
      return { processed: false, action: "idle", taskId: task.id, runId: run.id, status: waited.status };
    }
    await finishSpan(span, { status: "ok", attributes: { status, taskStatus: waited.status } });
    return { processed: true, action: "waited", taskId: task.id, runId: run.id, status };
  } catch (error) {
    const failed = await failTask(task, error);
    await finishSpan(span, { status: "error", attributes: { error: error instanceof Error ? error.message : String(error), taskStatus: failed.status } });
    if (failed.status !== "waiting" && failed.status !== "dead") {
      return { processed: false, action: "idle", taskId: task.id, runId: run.id, status: failed.status };
    }
    if (failed.status === "waiting") {
      await prisma.researchRun.update({
        where: { id: run.id },
        data: {
          status: "queued",
          hermesRunId: null,
          completedAt: null,
          rawOutput: error instanceof Error ? error.message : String(error)
        }
      });
    }
    return { processed: true, action: failed.status === "dead" ? "dead" : "failed", taskId: task.id, runId: run.id, status: failed.status };
  } finally {
    stopLeaseRenewal();
  }
}

function startTaskLeaseRenewal(task: AsyncTask) {
  const intervalMs = Math.max(1000, Math.min(Math.floor(asyncTaskLeaseMs() / 2), 30_000));
  const timer = setInterval(() => {
    void renewTaskLease(task);
  }, intervalMs);
  return () => clearInterval(timer);
}

async function enqueueLegacyResearchTaskIfNeeded() {
  const run = await prisma.researchRun.findFirst({
    where: {
      OR: [
        { status: "queued" },
        { status: "running", hermesRunId: { not: null }, parsedOutputJson: null }
      ]
    },
    orderBy: { createdAt: "asc" }
  });
  if (!run) return null;
  const existing = await findActiveTask(run.projectId, researchTaskType);
  if (existing) return existing;
  return enqueueTask({
    type: researchTaskType,
    projectId: run.projectId,
    payload: { researchRunId: run.id } satisfies ResearchTaskPayload,
    priority: 0,
    maxAttempts: 3
  });
}

export async function processResearchWorkerOnce(): Promise<ResearchWorkerResult> {
  await heartbeat("running", { kind: "research-worker" }).catch(() => undefined);
  const reset = await resetStaleResearchRuns();
  if (reset.count > 0) {
    await logEvent({ source: "research-worker", eventType: "research.reset_stale", message: "Recovered stale research runs.", metadata: { count: reset.count } });
    await recordMetric({ name: "research.reset_stale", value: reset.count, unit: "count" });
    return { processed: true, action: "reset_stale", status: "queued" };
  }

  let task = await claimTask();
  if (!task) {
    const legacyTask = await enqueueLegacyResearchTaskIfNeeded();
    task = legacyTask ? await claimTask(legacyTask.id) : null;
  }
  if (!task) return { processed: false, action: "idle" };
  return processAsyncTask(task);
}

export async function runResearchWorkerLoop() {
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (!stopping) {
    const result = await processResearchWorkerOnce();
    if (!result.processed) {
      await waitForTaskNotification(researchWorkerPollIntervalMs());
    }
  }
  await heartbeat("stopped", { kind: "research-worker" }).catch(() => undefined);
}

export async function generateProjectPrd(projectId: string) {
  const project = await loadProjectFlowData(projectId);
  const content = generatePrdMarkdown(toPackProject(project), getLatestResearch(project));
  const artifact = await prisma.generatedArtifact.create({ data: { projectId, artifactType: "prd", content } });
  await putArtifact({
    projectId,
    generatedArtifactId: artifact.id,
    artifactType: "prd",
    filename: "PRD.md",
    content,
    mimeType: "text/markdown;charset=utf-8"
  });
  await invalidateProjectCache(projectId);
  return artifact;
}

export async function saveProjectPrd(projectId: string, content: string) {
  const artifact = await prisma.generatedArtifact.create({ data: { projectId, artifactType: "prd", content } });
  await putArtifact({
    projectId,
    generatedArtifactId: artifact.id,
    artifactType: "prd",
    filename: "PRD.md",
    content,
    mimeType: "text/markdown;charset=utf-8"
  });
  await invalidateProjectCache(projectId);
  return artifact;
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
  await invalidateProjectCache(projectId);
  return hermesEvaluation;
}

function projectEvidenceBrief(project: ProjectWithFlowData, prd: string, research?: HermesResearchOutput, evaluation?: EvaluationResult) {
  return JSON.stringify({
    project: {
      name: project.name,
      idea: project.idea,
      industry: project.industry,
      targetUser: project.targetUser,
      needFinancialSuitabilityCheck: project.needFinancialSuitabilityCheck,
      preferredTechStack: project.preferredTechStack
    },
    reportAssistant: parseReportAssistantContext(project),
    prd: prd.slice(0, 8000),
    evaluation,
    research: research ? {
      competitors: research.competitors,
      differentiation: research.differentiation,
      monitorPlan: research.monitor_plan
    } : undefined,
    competitors: competitorMatrixForEvaluation(project)
  }, null, 2);
}

export async function generateEvidenceBasedPdrs(projectId: string): Promise<EvidenceBasedPdrsResult> {
  const project = await loadProjectFlowData(projectId);
  const { evaluation, research, prd } = evaluateProjectFlow(project);
  const fallback = fallbackEvidencePdrs(project, evaluation, prd, research);
  const generated = await generateJsonWithModel({
    config: modelConfigFromProject(project),
    projectId,
    system: "你是严谨的产品决策评估专家。只输出 JSON。不得编造证据；没有证据时必须写入 missingEvidence 并降低 confidence。",
    user: `基于以下项目材料生成 Evidence-based PDRS。必须包含 dimensions 对象，维度为 ${evidencePdrsDimensionNames.join(", ")}。每个维度必须包含 score, reason, evidence, confidence, risks, missingEvidence。还必须包含 overallScore 和 finalRecommendation(GO/HOLD/PIVOT/KILL)。\n\n${projectEvidenceBrief(project, prd, research, evaluation)}`,
    fallback
  });
  const result = normalizeEvidenceBasedPdrs(generated, fallback);
  await persistGeneratedMarkdownPair(
    projectId,
    evidencePdrsArtifact,
    JSON.stringify(result, null, 2),
    evidencePdrsMarkdownArtifact,
    renderEvidencePdrsMarkdown(result)
  );
  await invalidateProjectCache(projectId);
  return result;
}

export async function generateRoadmap(projectId: string): Promise<RoadmapResult> {
  const project = await loadProjectFlowData(projectId);
  const { evaluation, research, prd } = evaluateProjectFlow(project);
  const pdrs = parseLatestEvidencePdrs(project) ?? fallbackEvidencePdrs(project, evaluation, prd, research);
  const fallback = fallbackRoadmap(project, prd, pdrs);
  const generated = await generateJsonWithModel({
    config: modelConfigFromProject(project),
    projectId,
    system: "你是资深产品交付负责人。只输出 JSON。不得把未验证内容写成已完成事实；依赖和风险必须显式标注。",
    user: `基于项目上下文、PRD、Hermes 研究和 Evidence PDRS 生成 staged roadmap。输出 JSON 字段：generatedAt, items。每个 item 包含 title, description, stage(NOW/NEXT/LATER), priority(P0/P1/P2/P3), type(FEATURE/INFRA/RESEARCH/COMPLIANCE/UX/QA/OPS), rationale, dependencies, risks, estimatedEffort, successMetrics, acceptanceCriteria。\n\nEvidence PDRS:\n${JSON.stringify(pdrs, null, 2)}\n\nProject Context:\n${projectEvidenceBrief(project, prd, research, evaluation)}`,
    fallback
  });
  const result = normalizeRoadmap(generated, fallback);
  await persistGeneratedMarkdownPair(
    projectId,
    roadmapArtifact,
    JSON.stringify(result, null, 2),
    roadmapMarkdownArtifact,
    renderRoadmapMarkdown(result)
  );
  await invalidateProjectCache(projectId);
  return result;
}

async function runSinglePrdReviewerAttempt(project: ProjectWithFlowData, role: ReviewerRole, prd: string, context: string): Promise<PrdReviewerResult> {
  if (!prd.trim()) {
    return {
      role,
      status: "failed",
      summary: "缺少 PRD，无法执行该角色审查。",
      findings: [],
      requiredChanges: [],
      suggestions: [],
      riskLevel: "HIGH"
    };
  }
  const fallback = {
    role,
    status: "failed",
    summary: "模型调用失败或未配置 API key，该角色审查未正常完成。",
    findings: [],
    requiredChanges: [],
    suggestions: [],
    riskLevel: "HIGH"
  };
  try {
    const generated = await generateJsonWithModel({
      config: modelConfigFromProject(project),
      projectId: project.id,
      system: "你是 PRD 审查专家。只输出 JSON。不得编造事实；证据不足时 verdict 应为 WARN 或 BLOCK，并在 requiredChanges 中写清必须补充项。",
      user: `请以 ${role} 角色审查 PRD。\n角色职责：${prdReviewerRoleBriefs[role]}\n输出字段必须包含 role, verdict(PASS/WARN/BLOCK), summary, findings, requiredChanges, suggestions, riskLevel(LOW/MEDIUM/HIGH), confidence(0-1)。\n\n项目上下文：\n${context}`,
      fallback
    });
    return normalizeReviewer(role, generated);
  } catch (error) {
    return {
      role,
      status: "failed",
      summary: error instanceof Error ? error.message : "该角色审查执行失败。",
      findings: [],
      requiredChanges: [],
      suggestions: [],
      riskLevel: "HIGH"
    };
  }
}

async function runSinglePrdReviewer(project: ProjectWithFlowData, role: ReviewerRole, prd: string, context: string): Promise<PrdReviewerResult> {
  if (!prd.trim()) return runSinglePrdReviewerAttempt(project, role, prd, context);

  let latest: PrdReviewerResult | undefined;
  for (let attempt = 1; attempt <= prdReviewerMaxAttempts; attempt += 1) {
    latest = await runSinglePrdReviewerAttempt(project, role, prd, context);
    if (latest.status === "completed") return latest;
    const retryDelay = prdReviewerRetryDelayMs[attempt - 1];
    if (retryDelay) await delay(retryDelay);
  }

  return latest
    ? { ...latest, summary: `${latest.summary} 已执行 ${prdReviewerMaxAttempts} 次短重试，仍未获得合法审查输出。` }
    : { role, status: "failed", summary: "该角色审查未产生结果。", findings: [], requiredChanges: [], suggestions: [], riskLevel: "HIGH" };
}

export async function runPrdReviewGate(projectId: string): Promise<PrdReviewGateResult> {
  const project = await loadProjectFlowData(projectId);
  const { evaluation, research, prd } = evaluateProjectFlow(project);
  const context = projectEvidenceBrief(project, prd, research, evaluation);
  const reviewers = await Promise.all(prdReviewerRoles.map((role) => runSinglePrdReviewer(project, role, prd, context)));
  const result = aggregatePrdReviewGate(reviewers);
  await persistGeneratedMarkdownPair(
    projectId,
    prdReviewGateArtifact,
    JSON.stringify(result, null, 2),
    prdReviewMarkdownArtifact,
    renderPrdReviewMarkdown(result)
  );
  await invalidateProjectCache(projectId);
  return result;
}

export async function regeneratePrdReviewGateReviewer(projectId: string, rawRole: string): Promise<PrdReviewGateResult> {
  const role = reviewerRoleFromString(rawRole);
  const project = await loadProjectFlowData(projectId);
  const { evaluation, research, prd } = evaluateProjectFlow(project);
  const context = projectEvidenceBrief(project, prd, research, evaluation);
  const existing = parseLatestPrdReviewGate(project);
  const reviewer = await runSinglePrdReviewer(project, role, prd, context);
  const result = mergePrdReviewReviewer(existing, reviewer);
  await persistGeneratedMarkdownPair(
    projectId,
    prdReviewGateArtifact,
    JSON.stringify(result, null, 2),
    prdReviewMarkdownArtifact,
    renderPrdReviewMarkdown(result)
  );
  await invalidateProjectCache(projectId);
  return result;
}

export async function exportProjectCodexPack(projectId: string): Promise<CodexPackFile[]> {
  const blockingReview = await latestBlockingReview(projectId, ["research", "prd", "codex_pack"]);
  if (blockingReview) {
    throw new Error(`Codex Pack export is blocked by agent review ${blockingReview.id}.`);
  }

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
  const artifactTypes = [...new Set([...files.map((file) => file.filename), "codex-pack.zip"])];
  await deleteProjectStoredArtifactsByTypes(projectId, artifactTypes);
  await prisma.generatedArtifact.deleteMany({ where: { projectId, artifactType: { in: artifactTypes } } });
  const artifacts = await prisma.$transaction(
    files.map((file) => prisma.generatedArtifact.create({ data: { projectId, artifactType: file.filename, content: file.content } }))
  );
  await Promise.all(files.map((file, index) => putArtifact({
    projectId,
    generatedArtifactId: artifacts[index]?.id,
    artifactType: file.filename,
    filename: file.filename,
    content: file.content
  })));
  const zip = new JSZip();
  files.forEach((file) => zip.file(file.filename, file.content));
  const zipBuffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
  await putArtifact({
    projectId,
    artifactType: "codex-pack.zip",
    filename: "codex-pack.zip",
    content: zipBuffer,
    mimeType: "application/zip",
    forceFile: true
  });
  await invalidateProjectCache(projectId);
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
  const artifact = await prisma.generatedArtifact.create({ data: { projectId, artifactType: "prototype_design_prompt", content: prompt } });
  await putArtifact({
    projectId,
    generatedArtifactId: artifact.id,
    artifactType: "prototype_design_prompt",
    filename: "prototype-design-prompt.txt",
    content: prompt,
    mimeType: "text/plain;charset=utf-8"
  });
  await invalidateProjectCache(projectId);
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
  const artifact = await prisma.generatedArtifact.create({ data: { projectId, artifactType: "hermes_ppt_task", content: JSON.stringify(reportPackage) } });
  await storeReportDeckArtifacts(projectId, reportPackage, artifact.id);
  await invalidateProjectCache(projectId);
  return reportPackage;
}

async function storeReportDeckArtifacts(projectId: string, reportPackage: ReportDeckPackage, generatedArtifactId: string) {
  const baseName = safeArtifactFilename(reportPackage.deckTitle || "report-deck");
  const packageJson = JSON.stringify(reportPackage, null, 2);
  await putArtifact({
    projectId,
    generatedArtifactId,
    artifactType: "hermes_ppt_task",
    filename: `${baseName}-package.json`,
    content: packageJson,
    mimeType: "application/json;charset=utf-8"
  });
  await putArtifact({
    projectId,
    artifactType: "hermes_ppt_prompt",
    filename: `${baseName}-Hermes-PPT-prompt.txt`,
    content: reportPackage.prompt,
    mimeType: "text/plain;charset=utf-8"
  });
  await putArtifact({
    projectId,
    artifactType: "report_manuscript",
    filename: `${baseName}-manuscript.doc`,
    content: reportDeckWordHtml(reportPackage),
    mimeType: "text/html;charset=utf-8"
  });
  await putArtifact({
    projectId,
    artifactType: "report_deck_pptx",
    filename: `${baseName}.pptx`,
    content: await createReportDeckPptxBuffer(reportPackage),
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    forceFile: true
  });
}

async function createReportDeckPptxBuffer(reportPackage: ReportDeckPackage) {
  const pptxgen = (await import("pptxgenjs")).default;
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "SpecFlow Agent / Hermes";
  pptx.subject = "Hermes presentation task output";
  pptx.title = reportPackage.deckTitle;
  pptx.company = "SpecFlow";

  const cover = pptx.addSlide();
  cover.background = { color: "F8FAFC" };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.0, fill: { color: "111827" }, line: { color: "111827" } });
  cover.addText("Hermes 汇报材料", { x: 0.65, y: 0.3, w: 3.2, h: 0.24, fontSize: 12, bold: true, color: "FBBF24", margin: 0 });
  cover.addText(reportPackage.deckTitle, { x: 0.75, y: 1.8, w: 8.8, h: 0.9, fontSize: 28, bold: true, color: "18181B", fit: "shrink" });
  cover.addText(new Date().toLocaleDateString("zh-CN"), { x: 10.2, y: 6.75, w: 2.2, h: 0.22, fontSize: 9, color: "71717A", align: "right", margin: 0 });

  reportPackage.slides.slice(0, 12).forEach((slideData) => {
    const slide = pptx.addSlide();
    slide.background = { color: "F8FAFC" };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.72, fill: { color: "172554" }, line: { color: "172554" } });
    slide.addText(slideData.title, { x: 0.6, y: 0.23, w: 9.0, h: 0.24, fontSize: 17, bold: true, color: "FFFFFF", margin: 0 });
    slideData.bullets.slice(0, 6).forEach((item, index) => {
      slide.addText(`${index + 1}`, { x: 0.75, y: 1.3 + index * 0.72, w: 0.3, h: 0.24, fontSize: 10, bold: true, color: "B45309", margin: 0 });
      slide.addText(item, { x: 1.18, y: 1.25 + index * 0.72, w: 10.8, h: 0.34, fontSize: 14, color: "18181B", fit: "shrink", margin: 0.02 });
    });
    if (slideData.speakerNotes) slide.addNotes(slideData.speakerNotes);
  });

  const output = await (pptx as unknown as { write: (options: { outputType: "nodebuffer" }) => Promise<Buffer | Uint8Array> }).write({ outputType: "nodebuffer" });
  return Buffer.from(output);
}

function reportDeckWordHtml(reportPackage: ReportDeckPackage) {
  const slides = reportPackage.slides
    .map((slide, index) => `<h2>第 ${index + 1} 页：${escapeHtml(slide.title)}</h2><p>${escapeHtml(slide.speakerNotes)}</p><ul>${slide.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(reportPackage.deckTitle)} 讲稿</title></head><body><h1>${escapeHtml(reportPackage.deckTitle)} 讲稿</h1><pre>${escapeHtml(reportPackage.manuscript)}</pre>${slides}</body></html>`;
}

function safeArtifactFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "artifact";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
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
