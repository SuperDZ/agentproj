import { notFound } from "next/navigation";
import { CodexPackActions } from "@/components/codex-pack-actions";
import { HermesControlPanel } from "@/components/hermes-control-panel";
import { ResearchRunStatus } from "@/components/research-run-status";
import { ProjectPlanningSaveForm } from "@/components/save-report-forms";
import { Badge, Card, Progress } from "@/components/ui";
import { WorkflowActionButton } from "@/components/workflow-action-button";
import { evaluateCurrentProject, exportCodexPack, savePrd, saveReportAssistantWithStatus, selectTechStack } from "@/app/actions";
import { prisma } from "@/lib/db/prisma";
import {
  evaluateProjectFlow,
  getLatestCodexPackArtifacts,
  getLatestPrd,
  getLatestResearch,
  isReportAssistantReady,
  parseReportAssistantContext,
  parseTechStackRecommendations
} from "@/lib/services/project-flow";
import { recommendedSkillSources } from "@/lib/skills/recommended-skills";
import { skillSafetyPolicy } from "@/lib/skills/skill-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const workflowSteps = ["Planning", "Hermes Research", "Competitor Matrix", "Differentiation", "PRD", "Tech Stack", "PDRS", "Codex Pack", "Prototype"];

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

  const research = getLatestResearch(project);
  const latestRun = project.researchRuns[0];
  const reportContext = parseReportAssistantContext(project);
  const reportReady = isReportAssistantReady(reportContext);
  const pmAdvice = artifact(project, "pm_planning_advice") || "暂无项目规划建议。";
  const prd = getLatestPrd(project);
  const { evaluation } = evaluateProjectFlow(project);
  const latestEvaluation = project.evaluations[0];
  const codexArtifacts = getLatestCodexPackArtifacts(project);
  const techStacks = parseTechStackRecommendations(project);
  const selectedStack = artifact(project, "selected_tech_stack");
  const prototypePrompt = artifact(project, "prototype_design_prompt");
  const saveReportAction = saveReportAssistantWithStatus.bind(null, project.id);
  const savePrdAction = savePrd.bind(null, project.id);
  const evaluateAction = evaluateCurrentProject.bind(null, project.id);
  const exportAction = exportCodexPack.bind(null, project.id);
  const selectStackAction = selectTechStack.bind(null, project.id);

  return (
    <main className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">SpecFlow Agent</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{project.name}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{project.idea}</p>
            </div>
            <div className="grid gap-2 text-right">
              <Badge tone={research ? "green" : "yellow"}>{research ? "研究已完成" : "等待研究"}</Badge>
              <span className="text-xs text-zinc-500">状态：{project.status}</span>
            </div>
          </div>
          <nav className="flex flex-wrap gap-2">
            {workflowSteps.map((step) => (
              <a key={step} href={`#${slug(step)}`} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-blue-300 hover:text-blue-700">
                {step}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8">
        <Card id={slug("Planning")}>
          <SectionTitle title="项目规划建议" subtitle="创建项目时调用 Hermes 生成规划建议，并把确认问题与用户、建议的 3-5 个核心功能合并在这里维护。" />
          <ProjectPlanningSaveForm
            action={saveReportAction}
            pmAdvice={pmAdvice}
            problemAndUsers={reportContext.problemAndUsers}
            coreFeatures={reportContext.coreFeatures}
            statusBadge={<Badge tone={reportReady ? "green" : "yellow"}>{reportReady ? "可运行 Hermes 研究" : "缺少前置内容"}</Badge>}
          />
        </Card>

        <Card id={slug("Hermes Research")} className="p-0">
          <div className="grid gap-6 p-5">
            <SectionTitle title="Hermes 研究" subtitle="读取项目规划、问题与用户、核心功能，再生成竞品矩阵和差异化判断。" />
            <WorkflowActionButton
              label="运行 Hermes 研究"
              endpoint={`/api/projects/${project.id}/research`}
              pollEndpoint={`/api/projects/${project.id}/research`}
              stages={["创建研究任务", "调用 Hermes", "解析竞品矩阵", "写入差异化判断"]}
              disabled={!reportReady}
              disabledReason="请先保存确认问题与用户，以及 3-5 个核心功能。"
              background
              className="justify-self-start rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            />
            <ResearchRunStatus
              endpoint={`/api/projects/${project.id}/research`}
              initialStatus={latestRun ? {
                id: latestRun.id,
                hermesRunId: latestRun.hermesRunId,
                mode: latestRun.mode,
                status: latestRun.status as "queued" | "running" | "completed" | "failed" | "completed_without_output",
                hasParsedOutput: Boolean(latestRun.parsedOutputJson),
                createdAt: latestRun.createdAt.toISOString(),
                completedAt: latestRun.completedAt?.toISOString() ?? null,
                events: []
              } : { status: "not_started", events: [] }}
            />
          </div>
          <div className="border-t border-zinc-200 p-5">
            <HermesControlPanel recommended={recommendedSkillSources} policies={skillSafetyPolicy} />
          </div>
        </Card>

        <Card id={slug("Competitor Matrix")}>
          <SectionTitle title="竞品矩阵" subtitle="Hermes 研究完成后从结构化输出中提取。" />
          <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr><th className="p-3">名称</th><th className="p-3">类型</th><th className="p-3">威胁</th><th className="p-3">复用策略</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {project.competitors.map((item) => (
                  <tr key={item.id}>
                    <td className="p-3 font-medium text-zinc-950"><a href={item.url} className="text-blue-700 hover:text-blue-900">{item.name}</a><p className="mt-1 text-xs font-normal text-zinc-500">{item.description}</p></td>
                    <td className="p-3 text-zinc-600">{item.type}</td>
                    <td className="p-3 text-zinc-600">{item.threatLevel}</td>
                    <td className="p-3 text-zinc-600">{item.reuseStrategy}</td>
                  </tr>
                ))}
                {project.competitors.length === 0 && <tr><td colSpan={4} className="p-4 text-sm text-zinc-500">尚未运行 Hermes 研究。</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card id={slug("Differentiation")}>
          <SectionTitle title="差异化判断" subtitle="展示差异化分数、同质化风险和 MVP 修改建议。" />
          {research ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <Metric label="差异化分数" value={research.differentiation.differentiation_score} />
              <Metric label="同质化风险" value={research.differentiation.redundancy_risk} />
              <div className="rounded-lg border border-zinc-200 p-4 lg:col-span-3">
                <p className="text-sm font-semibold text-zinc-950">MVP 修改建议</p>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{research.differentiation.mvp_reframe}</p>
              </div>
            </div>
          ) : <p className="mt-4 text-sm text-zinc-500">请先运行 Hermes 研究。</p>}
        </Card>

        <Card id={slug("PRD")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle title="PRD（产品需求文档）" subtitle="研究后生成，也可以手动编辑保存。" />
            <WorkflowActionButton label="生成 PRD" endpoint={`/api/projects/${project.id}/generate-prd`} stages={["读取研究结果", "吸收差异化输入", "生成 PRD", "写入 artifact"]} className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800" />
          </div>
          <form action={savePrdAction} className="mt-4 grid gap-3">
            <textarea name="content" rows={18} defaultValue={prd || "请先生成 PRD。"} className="rounded-lg border border-zinc-300 bg-white p-3 font-mono text-xs leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <button className="justify-self-start rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">保存 PRD</button>
          </form>
        </Card>

        <Card id={slug("Tech Stack")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle title="技术栈建议" subtitle="只在 PRD 生成后使用，用于后续 Codex Pack。" />
            <WorkflowActionButton label="生成技术栈建议" endpoint={`/api/projects/${project.id}/tech-stack`} stages={["读取 PRD", "分析约束", "生成方案", "写入 artifact"]} disabled={!prd} disabledReason="请先生成 PRD。" className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300" />
          </div>
          <form action={selectStackAction} className="mt-4 grid gap-3 lg:grid-cols-3">
            {techStacks.map((stack) => (
              <label key={stack.id} className="grid gap-3 rounded-lg border border-zinc-200 p-4">
                <input type="radio" name="stackId" value={stack.id} defaultChecked={selectedStack.includes(stack.id) || Boolean(project.preferredTechStack?.startsWith(stack.name))} />
                <p className="font-semibold text-zinc-950">{stack.name}</p>
                <p className="text-sm leading-6 text-zinc-600">{stack.reason}</p>
                <p className="text-xs leading-5 text-zinc-600">{stack.components.join("、")}</p>
                <Badge tone={stack.recommendation === "high" ? "green" : stack.recommendation === "medium" ? "yellow" : "slate"}>{stack.recommendation}</Badge>
              </label>
            ))}
            {techStacks.length === 0 && <p className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-500 lg:col-span-3">PRD 生成后可生成技术栈建议。</p>}
            {techStacks.length > 0 && <button className="justify-self-start rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 lg:col-span-3">保存选择</button>}
          </form>
          {project.preferredTechStack && <p className="mt-3 text-sm text-zinc-600">当前选择：{project.preferredTechStack}</p>}
        </Card>

        <Card id={slug("PDRS")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle title="PDRS（产品决策就绪分）" subtitle="运行评估会把 PRD、差异化判断、竞品矩阵和前一次 Hermes 调研结果提交给 Hermes 做真实评估。" />
            <form action={evaluateAction}><button className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">运行评估</button></form>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Metric label="当前估算" value={evaluation.pdrs} />
            <Metric label="最近保存分数" value={latestEvaluation?.pdrs ?? evaluation.pdrs} />
            <div className="lg:col-span-2"><Progress value={latestEvaluation?.pdrs ?? evaluation.pdrs} /></div>
          </div>
        </Card>

        <Card id={slug("Codex Pack")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle title="Codex Pack（编码任务包）" subtitle="使用已选技术栈生成实现任务、提示词和验收标准。" />
            <form action={exportAction}><button className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">导出 Codex Pack</button></form>
          </div>
          <div className="mt-4 grid gap-3">
            {codexArtifacts.length > 0 ? (
              <>
                <CodexPackActions files={codexArtifacts.map((item) => ({ filename: item.artifactType, content: item.content }))} locale="zh" />
                {codexArtifacts.map((item) => (
                  <details key={item.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                    <summary className="cursor-pointer font-medium text-zinc-900">{item.artifactType}</summary>
                    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-xs leading-6 text-zinc-700">{item.content}</pre>
                  </details>
                ))}
              </>
            ) : <p className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-500">尚未导出 Codex Pack。</p>}
          </div>
        </Card>

        <Card id={slug("Prototype")}>
          <SectionTitle title="原型设计" subtitle="基于 PRD、Hermes 调研和差异化建议生成原型设计 prompt。" />
          <WorkflowActionButton label="生成原型设计 prompt" endpoint={`/api/projects/${project.id}/prototype-prompt`} stages={["读取 PRD", "汇总 Hermes 调研", "吸收差异化建议", "写入 prompt artifact"]} disabled={!prd} disabledReason="请先生成或保存 PRD。" className="mt-4 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300" />
          {prototypePrompt ? <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs leading-6 text-zinc-700">{prototypePrompt}</pre> : <p className="mt-4 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-500">尚未生成原型设计 prompt。</p>}
        </Card>
      </div>
    </main>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-zinc-950">{Math.round(value)}</p>
      <Progress value={value} />
    </div>
  );
}

function artifact(project: { artifacts: Array<{ artifactType: string; content: string }> }, type: string) {
  return project.artifacts.find((item) => item.artifactType === type)?.content || "";
}

function slug(value: string) {
  return value.replace(/\s+/g, "-");
}
