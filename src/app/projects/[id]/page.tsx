import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Boxes, CheckCircle2, ClipboardList, Code2, FileText, FlaskConical, GitBranch, Layers3, ScrollText, ShieldCheck, Sparkles } from "lucide-react";
import { CodexPackActions } from "@/components/codex-pack-actions";
import { HermesControlPanel } from "@/components/hermes-control-panel";
import { ResearchRunStatus } from "@/components/research-run-status";
import { ProjectPlanningSaveForm } from "@/components/save-report-forms";
import { Badge, Card, Progress, buttonStyles, fieldStyles } from "@/components/ui";
import { WorkflowActionButton } from "@/components/workflow-action-button";
import { evaluateCurrentProject, exportCodexPack, savePrd, saveReportAssistantWithStatus, selectTechStack } from "@/app/actions";
import { prisma } from "@/lib/db/prisma";
import { evidencePdrsDimensionNames, evaluateProjectFlow, getLatestCodexPackArtifacts, getLatestPrd, getLatestResearch, isReportAssistantReady, parseLatestEvidencePdrs, parseLatestPrdReviewGate, parseLatestRoadmap, parseReportAssistantContext, parseTechStackRecommendations } from "@/lib/services/project-flow";
import type { EvidencePdrsDimensionName, PdrsRecommendation, PrdReviewGateResult, ReviewVerdict, ReviewerStatus, RoadmapPriority } from "@/lib/services/project-flow";
import { recommendedSkillSources } from "@/lib/skills/recommended-skills";
import { skillSafetyPolicy } from "@/lib/skills/skill-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const workflowSteps = [
  { label: "项目规划", id: "planning", icon: ClipboardList },
  { label: "Hermes 调研", id: "research", icon: FlaskConical },
  { label: "竞品矩阵", id: "competitors", icon: Layers3 },
  { label: "差异化", id: "differentiation", icon: Sparkles },
  { label: "PRD", id: "prd", icon: FileText },
  { label: "技术栈", id: "tech-stack", icon: Boxes },
  { label: "PDRS", id: "pdrs", icon: CheckCircle2 },
  { label: "PRD Gate", id: "prd-review-gate", icon: ShieldCheck },
  { label: "Roadmap", id: "roadmap", icon: GitBranch },
  { label: "Agent Review", id: "agent-review", icon: ShieldCheck },
  { label: "Codex Pack", id: "codex-pack", icon: Code2 },
  { label: "原型", id: "prototype", icon: Sparkles }
];

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      competitors: true,
      researchRuns: { orderBy: { createdAt: "desc" } },
      evaluations: { orderBy: { createdAt: "desc" } },
      artifacts: { orderBy: { createdAt: "desc" } },
      monitorJobs: { orderBy: { createdAt: "desc" } }
    }
  });
  if (!project) notFound();
  const agentReviewState = await loadProjectAgentReviewState(project.id);

  const research = getLatestResearch(project);
  const latestRun = project.researchRuns[0];
  const reportContext = parseReportAssistantContext(project);
  const reportReady = isReportAssistantReady(reportContext);
  const pmAdvice = artifact(project, "pm_planning_advice") || "暂无项目规划建议。";
  const prd = getLatestPrd(project);
  const { evaluation } = evaluateProjectFlow(project);
  const latestEvaluation = project.evaluations[0];
  const evidencePdrs = parseLatestEvidencePdrs(project);
  const roadmap = parseLatestRoadmap(project);
  const prdReviewGate = parseLatestPrdReviewGate(project);
  const codexArtifacts = getLatestCodexPackArtifacts(project);
  const techStacks = parseTechStackRecommendations(project);
  const selectedStack = artifact(project, "selected_tech_stack");
  const prototypePrompt = artifact(project, "prototype_design_prompt");
  const saveReportAction = saveReportAssistantWithStatus.bind(null, project.id);
  const savePrdAction = savePrd.bind(null, project.id);
  const evaluateAction = evaluateCurrentProject.bind(null, project.id);
  const exportAction = exportCodexPack.bind(null, project.id);
  const selectStackAction = selectTechStack.bind(null, project.id);
  const currentScore = latestEvaluation?.pdrs ?? evaluation.pdrs;
  const latestAgentReview = agentReviewState.reviews[0];
  const codexBlocked = agentReviewState.latestCodexReview?.decision === "blocked";
  const codexGateWarning = prdReviewGate && (prdReviewGate.status === "incomplete" || prdReviewGate.gateDecision === "WARN" || prdReviewGate.gateDecision === "BLOCK");

  return (
    <main className="min-h-screen">
      <header className="border-b border-stone-200/80 bg-[#fffdf8]/80 backdrop-blur">
        <div className="mx-auto grid max-w-7xl gap-5 px-6 py-6">
          <Link href="/projects" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-stone-600 transition hover:text-teal-800">
            <ArrowLeft className="h-4 w-4" />
            返回项目管理
          </Link>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <p className="text-xs font-bold uppercase text-teal-800">SpecFlow Project</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-950">{project.name}</h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-stone-600">{project.idea}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="PDRS" value={Math.round(currentScore)} />
              <Metric label="竞品" value={project.competitors.length} />
              <Metric label="调研次数" value={project.researchRuns.length} />
              <Metric label="产物" value={project.artifacts.length} />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-5 lg:h-fit">
          <nav className="rounded-lg border border-stone-200 bg-white/85 p-3 shadow-[var(--shadow)] backdrop-blur">
            <p className="px-2 pb-2 text-xs font-bold uppercase text-stone-500">快速跳转</p>
            <div className="flex gap-2 overflow-x-auto lg:grid lg:overflow-visible">
              {workflowSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <a
                    key={step.id}
                    href={`#${step.id}`}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold text-stone-700 transition hover:bg-teal-50 hover:text-teal-900"
                  >
                    <Icon className="h-4 w-4" />
                    {step.label}
                  </a>
                );
              })}
            </div>
          </nav>
        </aside>

        <div className="grid min-w-0 gap-6">
          <Card id="planning">
            <SectionTitle title="项目规划建议" subtitle="确认问题、用户和 3-5 个核心功能后，才能进入 Hermes 调研。" />
            <ProjectPlanningSaveForm
              action={saveReportAction}
              pmAdvice={pmAdvice}
              problemAndUsers={reportContext.problemAndUsers}
              coreFeatures={reportContext.coreFeatures}
              statusBadge={<Badge tone={reportReady ? "green" : "yellow"}>{reportReady ? "可运行 Hermes 调研" : "缺少前置内容"}</Badge>}
            />
          </Card>

          <Card id="research" className="p-0">
            <div className="grid gap-6 p-5">
              <SectionTitle title="Hermes 调研" subtitle="读取项目规划、问题与用户、核心功能，生成竞品矩阵和差异化判断。" />
              <HermesControlPanel projectId={project.id} recommended={recommendedSkillSources} policies={skillSafetyPolicy} />
              <div className="grid gap-3 border-t border-stone-200 pt-5">
                <div>
                  <p className="text-sm font-semibold text-stone-950">调研执行</p>
                  <p className="mt-1 text-xs leading-5 text-stone-500">先确认 Hermes 快速配置，再启动当前项目的真实调研任务。下方进度直接读取该项目实际调用记录。</p>
                </div>
              <WorkflowActionButton
                label="运行 Hermes 调研"
                endpoint={`/api/projects/${project.id}/research`}
                pollEndpoint={`/api/projects/${project.id}/research`}
                stages={["创建调研任务", "调用 Hermes", "解析竞品矩阵", "写入差异化判断"]}
                background
                disabled={!reportReady}
                disabledReason="请先保存确认问题与用户，以及 3-5 个核心功能。"
                className={buttonStyles.primary}
              />
              <Link href={`/projects/${project.id}/research-log`} className={buttonStyles.secondary}>
                <ScrollText className="h-4 w-4" />
                调研日志
              </Link>
              <ResearchRunStatus
                endpoint={`/api/projects/${project.id}/research`}
                initialStatus={latestRun ? {
                  id: latestRun.id,
                  hermesRunId: latestRun.hermesRunId,
                  mode: latestRun.mode,
                  status: latestRun.status as "queued" | "running" | "completed" | "failed" | "completed_without_output" | "completed_with_fallback",
                  hasParsedOutput: Boolean(latestRun.parsedOutputJson),
                  createdAt: latestRun.createdAt.toISOString(),
                  completedAt: latestRun.completedAt?.toISOString() ?? null,
                  events: []
                } : { status: "not_started", events: [] }}
              />
              </div>
            </div>
          </Card>

          <Card id="competitors">
            <SectionTitle title="竞品矩阵" subtitle="Hermes 调研完成后，从结构化输出中提取。" />
            <div className="mt-4 overflow-hidden rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-100 text-xs uppercase text-stone-500">
                  <tr><th className="p-3">名称</th><th className="p-3">类型</th><th className="p-3">威胁</th><th className="p-3">复用策略</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white/70">
                  {project.competitors.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3 font-semibold text-stone-950"><a href={item.url} className="text-teal-800 hover:text-teal-950">{item.name}</a><p className="mt-1 text-xs font-normal text-stone-500">{item.description}</p></td>
                      <td className="p-3 text-stone-600">{item.type}</td>
                      <td className="p-3 text-stone-600">{item.threatLevel}</td>
                      <td className="p-3 text-stone-600">{item.reuseStrategy}</td>
                    </tr>
                  ))}
                  {project.competitors.length === 0 && <tr><td colSpan={4} className="p-4 text-sm text-stone-500">尚未运行 Hermes 调研。</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card id="differentiation">
            <SectionTitle title="差异化判断" subtitle="展示差异化分数、同质化风险和 MVP 修改建议。" />
            {research ? (
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <Score label="差异化分数" value={research.differentiation.differentiation_score} />
                <Score label="同质化风险" value={research.differentiation.redundancy_risk} />
                <div className="rounded-lg border border-stone-200 bg-white/70 p-4 lg:col-span-3">
                  <p className="text-sm font-bold text-stone-950">MVP 修改建议</p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{research.differentiation.mvp_reframe}</p>
                </div>
              </div>
            ) : <p className="mt-4 text-sm text-stone-500">请先运行 Hermes 调研。</p>}
          </Card>

          <Card id="prd">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle title="PRD" subtitle="调研后生成，也可以手动编辑保存。" />
              <WorkflowActionButton label="生成 PRD" endpoint={`/api/projects/${project.id}/generate-prd`} stages={["读取调研结果", "吸收差异化输入", "生成 PRD", "写入 artifact"]} className={buttonStyles.primary} />
            </div>
            <form action={savePrdAction} className="mt-4 grid gap-3">
              <textarea name="content" rows={18} defaultValue={prd || "请先生成 PRD。"} className={`${fieldStyles} p-3 font-mono text-xs leading-6`} />
              <button className={buttonStyles.secondary}>保存 PRD</button>
            </form>
          </Card>

          <Card id="tech-stack">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle title="技术栈建议" subtitle="在 PRD 生成后使用，用于后续 Codex Pack。" />
              <WorkflowActionButton label="生成技术栈建议" endpoint={`/api/projects/${project.id}/tech-stack`} stages={["读取 PRD", "分析约束", "生成方案", "写入 artifact"]} disabled={!prd} disabledReason="请先生成 PRD。" className={buttonStyles.primary} />
            </div>
            <form action={selectStackAction} className="mt-4 grid gap-3 lg:grid-cols-3">
              {techStacks.map((stack) => (
                <label key={stack.id} className="grid gap-3 rounded-lg border border-stone-200 bg-white/70 p-4">
                  <input type="radio" name="stackId" value={stack.id} defaultChecked={selectedStack.includes(stack.id) || Boolean(project.preferredTechStack?.startsWith(stack.name))} />
                  <p className="font-bold text-stone-950">{stack.name}</p>
                  <p className="text-sm leading-6 text-stone-600">{stack.reason}</p>
                  <p className="text-xs leading-5 text-stone-600">{stack.components.join("、")}</p>
                  <Badge tone={stack.recommendation === "high" ? "green" : stack.recommendation === "medium" ? "yellow" : "slate"}>{stack.recommendation}</Badge>
                </label>
              ))}
              {techStacks.length === 0 && <p className="rounded-lg bg-stone-100 p-4 text-sm text-stone-500 lg:col-span-3">PRD 生成后可生成技术栈建议。</p>}
              {techStacks.length > 0 && <button className={`${buttonStyles.primary} lg:col-span-3`}>保存选择</button>}
            </form>
            {project.preferredTechStack && <p className="mt-3 text-sm text-stone-600">当前选择：{project.preferredTechStack}</p>}
          </Card>

          <Card id="pdrs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle title="Evidence PDRS" subtitle="用分数、证据、置信度、风险和缺失证据解释产品决策。" />
              <div className="flex flex-wrap gap-2">
                <form action={evaluateAction}><button className={buttonStyles.secondary}>运行传统评估</button></form>
                <WorkflowActionButton label="生成 Evidence PDRS" endpoint={`/api/projects/${project.id}/evidence-pdrs`} stages={["读取项目上下文", "校验证据来源", "生成证据化评分", "写入 Markdown artifact"]} className={buttonStyles.primary} />
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Score label="当前估算" value={evaluation.pdrs} />
              <Score label="最近保存分数" value={latestEvaluation?.pdrs ?? evaluation.pdrs} />
              <div className="lg:col-span-2"><Progress value={currentScore} /></div>
            </div>
            {evidencePdrs ? (
              <div className="mt-5 grid gap-4">
                <div className="rounded-lg border border-stone-200 bg-white/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-stone-950">证据化建议</p>
                      <p className="mt-1 text-xs text-stone-500">Overall Score：{evidencePdrs.overallScore}</p>
                    </div>
                    <Badge tone={recommendationTone(evidencePdrs.finalRecommendation)}>{evidencePdrs.finalRecommendation}</Badge>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {evidencePdrsDimensionNames.map((name) => {
                    const dimension = evidencePdrs.dimensions[name];
                    return (
                      <details key={name} className="rounded-lg border border-stone-200 bg-white/75 p-4">
                        <summary className="cursor-pointer text-sm font-bold text-stone-950">
                          {dimensionLabel(name)} · {dimension.score}
                        </summary>
                        <p className="mt-3 text-sm leading-6 text-stone-600">{dimension.reason}</p>
                        <p className="mt-2 text-xs font-semibold text-stone-500">置信度：{Math.round(dimension.confidence * 100)}%</p>
                        <EvidenceList title="Evidence" items={dimension.evidence} />
                        <EvidenceList title="Risks" items={dimension.risks} />
                        <EvidenceList title="Missing Evidence" items={dimension.missingEvidence} />
                      </details>
                    );
                  })}
                </div>
              </div>
            ) : <p className="mt-4 rounded-lg bg-stone-100 p-4 text-sm text-stone-500">尚未生成 Evidence PDRS。</p>}
          </Card>

          <Card id="prd-review-gate">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle title="PRD Review Gate" subtitle="Product、UX、Engineering、QA、Compliance、Business 六角色全部正常完成后才聚合结论。" />
              <WorkflowActionButton label="运行 PRD Review Gate" endpoint={`/api/projects/${project.id}/prd-review`} stages={["生成六角色审查", "校验角色输出", "聚合 gate decision", "写入 PRD_REVIEW.md"]} disabled={!prd} disabledReason="请先生成或保存 PRD。" className={buttonStyles.primary} />
            </div>
            {prdReviewGate ? (
              <div className="mt-4 grid gap-4">
                <div className={prdReviewGate.status === "completed" ? "rounded-lg border border-emerald-200 bg-emerald-50 p-4" : "rounded-lg border border-amber-200 bg-amber-50 p-4"}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-stone-950">Gate 状态：{prdReviewGate.status}</p>
                      <p className="mt-1 text-xs leading-5 text-stone-600">
                        {prdReviewGate.gateDecision ? `聚合结论：${prdReviewGate.gateDecision}` : "审查未完成，未生成最终 gate decision。"}
                      </p>
                    </div>
                    <Badge tone={gateTone(prdReviewGate)}>{prdReviewGate.gateDecision ?? "INCOMPLETE"}</Badge>
                  </div>
                  {prdReviewGate.status === "incomplete" ? (
                    <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      Gate 未完成，不能作为 Codex Pack 交接依据。缺失角色：{prdReviewGate.missingReviewers.join("、") || "无"}；失败/非法角色：{prdReviewGate.failedReviewers.join("、") || "无"}。
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {prdReviewGate.reviewers.map((reviewer) => (
                    <div key={reviewer.role} className="rounded-lg border border-stone-200 bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-bold text-stone-950">{reviewer.role}</p>
                          <WorkflowActionButton
                            label="重新生成"
                            endpoint={`/api/projects/${project.id}/prd-review/reviewers/${encodeURIComponent(reviewer.role)}`}
                            stages={[`重跑 ${reviewer.role}`, "短重试失败输出", "重新聚合 Gate", "写入 PRD_REVIEW.md"]}
                            disabled={!prd}
                            disabledReason="请先生成或保存 PRD。"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 shadow-sm transition hover:border-brand-500/50 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                            iconOnly
                          />
                        </div>
                        <Badge tone={reviewerTone(reviewer.status, reviewer.verdict)}>{reviewer.verdict ?? reviewer.status}</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-stone-600">{reviewer.summary}</p>
                      <EvidenceList title="Findings" items={reviewer.findings} />
                      <EvidenceList title="Required Changes" items={reviewer.requiredChanges} />
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="mt-4 rounded-lg bg-stone-100 p-4 text-sm text-stone-500">尚未运行 PRD Review Gate。</p>}
          </Card>

          <Card id="roadmap">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle title="Roadmap Builder" subtitle="基于项目上下文、PRD、Hermes 调研和 Evidence PDRS 生成 NOW/NEXT/LATER 路线图。" />
              <WorkflowActionButton label="生成 Roadmap" endpoint={`/api/projects/${project.id}/roadmap`} stages={["读取 PRD 与证据", "识别依赖和风险", "分组 NOW/NEXT/LATER", "写入 ROADMAP.md"]} className={buttonStyles.primary} />
            </div>
            {roadmap ? (
              <div className="mt-4 grid gap-4 xl:grid-cols-3">
                {(["NOW", "NEXT", "LATER"] as const).map((stage) => (
                  <div key={stage} className="rounded-lg border border-stone-200 bg-white/75 p-4">
                    <p className="text-xs font-bold uppercase text-stone-500">{stage}</p>
                    <div className="mt-3 grid gap-3">
                      {roadmap.items.filter((item) => item.stage === stage).map((item) => (
                        <div key={`${stage}-${item.title}`} className="rounded-md border border-stone-200 bg-stone-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-stone-950">{item.title}</p>
                            <Badge tone={priorityTone(item.priority)}>{item.priority}</Badge>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-stone-600">{item.description}</p>
                          <p className="mt-2 text-xs text-stone-500">{item.type} · {item.estimatedEffort}</p>
                          <EvidenceList title="验收标准" items={item.acceptanceCriteria} />
                        </div>
                      ))}
                      {roadmap.items.filter((item) => item.stage === stage).length === 0 ? <p className="text-sm text-stone-500">暂无事项。</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="mt-4 rounded-lg bg-stone-100 p-4 text-sm text-stone-500">尚未生成 Roadmap。</p>}
          </Card>

          <Card id="agent-review">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle title="Agent Review" subtitle="并行专家 Agent 审查 PRD、技术栈、测试风险和发布风险，生成可追溯门禁结论。" />
              <WorkflowActionButton
                label="运行 Codex Pack 审查"
                endpoint={`/api/projects/${project.id}/agent-reviews`}
                stages={["创建冻结快照", "分发专家 Agent", "等待并行审查", "生成 consensus"]}
                body={{ targetType: "codex_pack", mode: "default", force: true }}
                background
                disabled={!prd || !agentReviewState.available}
                disabledReason={agentReviewState.available ? "请先生成或保存 PRD。" : "Agent Review 数据表尚未迁移，请先执行 Prisma migration。"}
                className={buttonStyles.primary}
              />
            </div>
            <div className="mt-4 grid gap-3">
              {latestAgentReview ? (
                <div className="rounded-lg border border-stone-200 bg-white/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-stone-950">{latestAgentReview.targetType} / round {latestAgentReview.round}</p>
                      <p className="mt-1 font-mono text-xs text-stone-500">{latestAgentReview.id}</p>
                    </div>
                    <Badge tone={reviewTone(latestAgentReview.status)}>{latestAgentReview.decision || latestAgentReview.status}</Badge>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {latestAgentReview.runs.map((run) => (
                      <div key={run.id} className="rounded-md border border-stone-200 bg-stone-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-bold text-stone-900">{run.agentKey}</p>
                          <Badge tone={reviewTone(run.status)}>{run.status}</Badge>
                        </div>
                        {run.errorMessage ? <p className="mt-2 line-clamp-2 text-xs text-rose-700">{run.errorMessage}</p> : null}
                      </div>
                    ))}
                  </div>
                  {latestAgentReview.consensuses[0] ? <p className="mt-4 rounded-md bg-stone-100 p-3 text-sm leading-6 text-stone-700">{latestAgentReview.consensuses[0].summary}</p> : null}
                </div>
              ) : <p className="rounded-lg bg-stone-100 p-4 text-sm text-stone-500">尚未运行 Agent Review。</p>}
            </div>
          </Card>

          <Card id="codex-pack">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionTitle title="Codex Pack" subtitle="使用已选技术栈生成实现任务、提示词和验收标准。" />
              <form action={exportAction}><button disabled={codexBlocked} className={buttonStyles.primary}>导出 Codex Pack</button></form>
            </div>
            {codexBlocked ? <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Agent Review 当前结论为 blocked，已阻止 Codex Pack 导出。请处理高风险 finding 后重跑审查。</p> : null}
            {codexGateWarning ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                PRD Review Gate 当前为 {prdReviewGate.status === "incomplete" ? "incomplete" : prdReviewGate.gateDecision}。系统不阻断导出，但该 Codex Pack 不应被视为无风险交接包。
              </p>
            ) : null}
            <div className="mt-4 grid gap-3">
              {codexArtifacts.length > 0 ? (
                <>
                  <CodexPackActions files={codexArtifacts.map((item) => ({ filename: item.artifactType, content: item.content }))} locale="zh" />
                  {codexArtifacts.map((item) => (
                    <details key={item.id} className="rounded-lg border border-stone-200 bg-white/80 p-3">
                      <summary className="cursor-pointer font-semibold text-stone-900">{item.artifactType}</summary>
                      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-stone-100 p-3 text-xs leading-6 text-stone-700">{item.content}</pre>
                    </details>
                  ))}
                </>
              ) : <p className="rounded-lg bg-stone-100 p-4 text-sm text-stone-500">尚未导出 Codex Pack。</p>}
            </div>
          </Card>

          <Card id="prototype">
            <SectionTitle title="原型设计" subtitle="基于 PRD、Hermes 调研和差异化建议生成原型设计 prompt。" />
            <WorkflowActionButton label="生成原型设计 prompt" endpoint={`/api/projects/${project.id}/prototype-prompt`} stages={["读取 PRD", "汇总 Hermes 调研", "吸收差异化建议", "写入 prompt artifact"]} disabled={!prd} disabledReason="请先生成或保存 PRD。" className={`${buttonStyles.primary} mt-4`} />
            {prototypePrompt ? <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-100 p-4 text-xs leading-6 text-stone-700">{prototypePrompt}</pre> : <p className="mt-4 rounded-lg bg-stone-100 p-4 text-sm text-stone-500">尚未生成原型设计 prompt。</p>}
          </Card>
        </div>
      </div>
    </main>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-stone-950">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-stone-500">{subtitle}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white/70 p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white/70 p-4">
      <p className="text-xs font-bold uppercase text-stone-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-stone-950">{Math.round(value)}</p>
      <div className="mt-3"><Progress value={value} /></div>
    </div>
  );
}

function EvidenceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-[11px] font-bold uppercase text-stone-500">{title}</p>
      {items.length ? (
        <ul className="mt-1 grid gap-1 text-xs leading-5 text-stone-600">
          {items.slice(0, 4).map((item) => <li key={item}>- {item}</li>)}
        </ul>
      ) : <p className="mt-1 text-xs text-stone-400">暂无</p>}
    </div>
  );
}

function dimensionLabel(name: EvidencePdrsDimensionName) {
  const labels: Record<EvidencePdrsDimensionName, string> = {
    problemClarity: "问题清晰度",
    userValue: "用户价值",
    marketGap: "市场缺口",
    differentiation: "差异化",
    feasibility: "可行性",
    deliveryComplexity: "交付复杂度",
    businessImpact: "业务影响",
    evidenceStrength: "证据强度",
    complianceRisk: "合规风险",
    overallScore: "总体分"
  };
  return labels[name];
}

function recommendationTone(value: PdrsRecommendation): "green" | "yellow" | "red" | "blue" | "slate" {
  if (value === "GO") return "green";
  if (value === "HOLD") return "blue";
  if (value === "PIVOT") return "yellow";
  return "red";
}

function priorityTone(value: RoadmapPriority): "green" | "yellow" | "red" | "blue" | "slate" {
  if (value === "P0") return "red";
  if (value === "P1") return "yellow";
  if (value === "P2") return "blue";
  return "slate";
}

function gateTone(result: PrdReviewGateResult): "green" | "yellow" | "red" | "blue" | "slate" {
  if (result.status === "incomplete") return "yellow";
  if (result.gateDecision === "PASS") return "green";
  if (result.gateDecision === "BLOCK") return "red";
  return "yellow";
}

function reviewerTone(status: ReviewerStatus, verdict?: ReviewVerdict): "green" | "yellow" | "red" | "blue" | "slate" {
  if (status !== "completed") return status === "failed" || status === "invalid" ? "red" : "yellow";
  if (verdict === "PASS") return "green";
  if (verdict === "BLOCK") return "red";
  return "yellow";
}

function artifact(project: { artifacts: Array<{ artifactType: string; content: string }> }, type: string) {
  return project.artifacts.find((item) => item.artifactType === type)?.content || "";
}

async function loadProjectAgentReviewState(projectId: string) {
  try {
    const [reviews, latestCodexReview] = await Promise.all([
      prisma.agentReview.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 3,
        include: {
          runs: { orderBy: { createdAt: "asc" } },
          consensuses: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      }),
      prisma.agentReview.findFirst({
        where: {
          projectId,
          targetType: "codex_pack",
          status: { notIn: ["superseded", "cancelled"] }
        },
        orderBy: [{ round: "desc" }, { createdAt: "desc" }]
      })
    ]);
    return { available: true, reviews, latestCodexReview };
  } catch (error) {
    if (isMissingAgentReviewSchema(error)) {
      return { available: false, reviews: [], latestCodexReview: null };
    }
    throw error;
  }
}

function isMissingAgentReviewSchema(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code === "P2021" || code === "P2022") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /AgentReview|AgentRun|AgentConsensus|does not exist|not exist in the current database/i.test(message);
}

function reviewTone(status: string): "green" | "yellow" | "red" | "blue" | "slate" {
  if (status === "passed" || status === "pass" || status === "succeeded") return "green";
  if (status === "blocked" || status === "failed" || status === "dead") return "red";
  if (status === "running" || status === "synthesizing") return "blue";
  if (status === "queued" || status === "needs_revision") return "yellow";
  return "slate";
}
