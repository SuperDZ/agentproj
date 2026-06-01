import ReactMarkdown from "react-markdown";
import { createMonitorJob, evaluateCurrentProject, exportCodexPack, generatePrd, runResearch, savePrd } from "@/app/actions";
import { CodexPackActions } from "@/components/codex-pack-actions";
import { Badge, Card, Progress } from "@/components/ui";
import { generateMonitorPlan } from "@/lib/export/codex-pack";
import { recommendedSkillSources } from "@/lib/skills/recommended-skills";
import { skillSafetyPolicy } from "@/lib/skills/skill-policy";
import { evaluateProjectFlow, getLatestCodexPackArtifacts, getLatestPrd, loadProjectFlowData } from "@/lib/services/project-flow";
import { parseJsonArray } from "@/lib/utils";

const steps = ["Idea", "Hermes Research", "Competitor Matrix", "Differentiation", "PRD", "PDRS", "Codex Pack", "Monitor Plan"];

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const project = await loadProjectFlowData(params.id);
  const latestRun = project.researchRuns[0];
  const { evaluation: liveEvaluation, research } = evaluateProjectFlow(project);
  const persistedEvaluation = project.evaluations[0];
  const hasSavedEvaluation = Boolean(persistedEvaluation);
  const latestPrd = getLatestPrd(project);
  const packFiles = getLatestCodexPackArtifacts(project).map((artifact) => ({ filename: artifact.artifactType, content: artifact.content }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-blue-300">SpecFlow Project</p>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="mt-2 max-w-3xl text-slate-400">{project.idea}</p>
        </div>
        <Badge tone={latestRun?.mode === "real" ? "green" : "yellow"}>Hermes mode: {latestRun?.mode ?? process.env.HERMES_MODE ?? "mock"}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
          {steps.map((step, index) => (
            <a key={step} href={`#${step.replace(/\s+/g, "-")}`} className="block rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
              <span className="mr-2 text-slate-500">{index + 1}.</span>{step}
            </a>
          ))}
        </aside>

        <div className="grid gap-6">
          <Card id="Idea">
            <h2 className="text-xl font-semibold">1. Idea</h2>
            <dl className="mt-4 grid gap-3 md:grid-cols-3">
              <Info label="Industry" value={project.industry} />
              <Info label="Target user" value={project.targetUser} />
              <Info label="Status" value={project.status} />
              <Info label="Financial suitability" value={project.needFinancialSuitabilityCheck ? "required" : "not requested"} />
              <Info label="Continuous monitoring" value={project.needContinuousCompetitorMonitoring ? "weekly" : "manual/monthly"} />
              <Info label="Preferred stack" value={project.preferredTechStack || "default SpecFlow stack"} />
            </dl>
          </Card>

          <Card id="Hermes-Research">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">2. Hermes Research</h2>
              <form action={runResearch.bind(null, project.id)}><button className="rounded-xl bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400">Run Hermes Research</button></form>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Badge>Mode: {latestRun?.mode ?? "mock"}</Badge>
              <Badge tone={latestRun?.status === "failed" ? "red" : latestRun?.status === "completed" ? "green" : "yellow"}>Run status: {latestRun?.status ?? "not started"}</Badge>
              <Badge>Found competitors: {project.competitors.length}</Badge>
            </div>
            {latestRun?.status && latestRun.status !== "completed" && <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">Real Hermes runs may stay queued/running until a follow-up status poll returns output. Raw run data is still saved for audit.</p>}
            {research && <p className="mt-4 text-slate-300">{research.summary}</p>}
            <h3 className="mt-5 font-semibold">Skill sources used</h3>
            <SkillSources />
          </Card>

          <Card id="Competitor-Matrix" className="overflow-x-auto">
            <h2 className="text-xl font-semibold">3. Competitor Matrix</h2>
            <table className="mt-4 min-w-full text-sm">
              <thead className="text-left text-slate-400"><tr>{["Competitor", "Type", "Core Features", "Strengths", "Weaknesses", "Reuse Strategy", "Threat"].map((heading) => <th key={heading} className="border-b border-slate-800 p-2">{heading}</th>)}</tr></thead>
              <tbody>{project.competitors.map((competitor) => <tr key={competitor.id} className="align-top"><td className="p-2 font-medium">{competitor.name}</td><td className="p-2">{competitor.type}</td><td className="p-2">{parseJsonArray(competitor.coreFeaturesJson).join(", ")}</td><td className="p-2">{parseJsonArray(competitor.strengthsJson).join(", ")}</td><td className="p-2">{parseJsonArray(competitor.weaknessesJson).join(", ")}</td><td className="p-2">{competitor.reuseStrategy}</td><td className="p-2"><Progress value={competitor.threatLevel} /><span className="text-xs">{competitor.threatLevel}</span></td></tr>)}</tbody>
            </table>
          </Card>

          <Card id="Differentiation">
            <h2 className="text-xl font-semibold">4. Differentiation</h2>
            {research ? <div className="mt-4 grid gap-4 md:grid-cols-2"><Metric title="Redundancy Risk" value={research.differentiation.redundancy_risk} /><Metric title="Differentiation Score" value={research.differentiation.differentiation_score} /><div className="md:col-span-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4"><strong>Should Build?</strong><p>{research.differentiation.should_build}</p></div><div><h3 className="font-semibold">MVP Reframe</h3><p className="text-slate-300">{research.differentiation.mvp_reframe}</p></div><List title="Must-have Features" items={research.differentiation.must_have_features} /><List title="Should-not-build Features" items={research.differentiation.should_not_build_features} /><List title="Reuse Strategy" items={research.differentiation.reuse_strategy} /></div> : <p className="mt-3 text-slate-400">Run Hermes Research first.</p>}
          </Card>

          <Card id="PRD">
            <div className="flex justify-between gap-3"><h2 className="text-xl font-semibold">5. PRD</h2><form action={generatePrd.bind(null, project.id)}><button className="rounded-xl border border-slate-700 px-4 py-2">Generate PRD</button></form></div>
            {latestPrd ? <form action={savePrd.bind(null, project.id)} className="mt-4 grid gap-3"><textarea name="content" rows={18} className="rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-sm" defaultValue={latestPrd} /><button className="rounded-xl bg-slate-100 px-4 py-2 font-semibold text-slate-950">Save PRD</button></form> : <p className="mt-3 text-slate-400">Generate an editable PRD Markdown after research.</p>}
          </Card>

          <Card id="PDRS">
            <div className="flex justify-between gap-3"><h2 className="text-xl font-semibold">6. PDRS Evaluation Gate</h2><form action={evaluateCurrentProject.bind(null, project.id)}><button className="rounded-xl bg-blue-500 px-4 py-2 font-semibold">Evaluate</button></form></div>
            <p className="mt-3 text-sm text-slate-400">PDRS = 25% Opportunity + 25% Competitive + 25% Specification + 15% Prototype + 10% Prompt Readiness. Prompt readiness uses the actual exported Codex Pack when available; otherwise it falls back to the current PRD.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3"><Metric title="PDRS" value={liveEvaluation.pdrs} /><Metric title="Opportunity" value={liveEvaluation.opportunityScore.score} /><Metric title="Competitive" value={liveEvaluation.competitiveScore.score} /><Metric title="Specification" value={liveEvaluation.specificationScore.score} /><Metric title="Prototype" value={liveEvaluation.prototypeScore.score} /><Metric title="Prompt Readiness" value={liveEvaluation.promptReadinessScore.score} /></div>
            <div className="mt-4 flex flex-wrap gap-2"><Badge tone={liveEvaluation.pdrs >= 70 ? "green" : "red"}>Live decision: {liveEvaluation.decision}</Badge>{hasSavedEvaluation && <Badge tone="slate">Saved snapshot: {persistedEvaluation?.decision} / {persistedEvaluation?.pdrs}</Badge>}</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2"><List title="Opportunity Reasons" items={liveEvaluation.opportunityScore.reasons} /><List title="Competitive Reasons" items={liveEvaluation.competitiveScore.reasons} /><List title="Specification Reasons" items={liveEvaluation.specificationScore.reasons} /><List title="Prompt Readiness Reasons" items={liveEvaluation.promptReadinessScore.reasons} /><List title="Risks" items={liveEvaluation.risks} /><List title="Next Actions" items={liveEvaluation.nextActions} /></div>
          </Card>

          <Card id="Codex-Pack">
            <div className="flex justify-between gap-3"><h2 className="text-xl font-semibold">7. Codex Pack</h2><form action={exportCodexPack.bind(null, project.id)}><button className="rounded-xl bg-blue-500 px-4 py-2 font-semibold">Generate Export Pack</button></form></div>
            {liveEvaluation.pdrs < 70 && <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-amber-100">PDRS is below 70. Export is allowed for review, but risk must be visible.</p>}
            {packFiles.length > 0 && <div className="mt-4 grid gap-3"><CodexPackActions files={packFiles} />{packFiles.map((file) => <details key={file.filename} className="rounded-xl border border-slate-800 p-3"><summary className="cursor-pointer font-medium">{file.filename}</summary><div className="prose prose-invert mt-3 max-w-none"><ReactMarkdown>{file.content}</ReactMarkdown></div></details>)}</div>}
          </Card>

          <Card id="Monitor-Plan">
            <div className="flex justify-between gap-3"><h2 className="text-xl font-semibold">8. Monitor Plan</h2><form action={createMonitorJob.bind(null, project.id)}><button className="rounded-xl border border-slate-700 px-4 py-2">Create Hermes Monitor Job</button></form></div>
            <div className="prose prose-invert mt-4 max-w-none"><ReactMarkdown>{generateMonitorPlan(project, research)}</ReactMarkdown></div>
            <p className="text-sm text-slate-400">Jobs created: {project.monitorJobs.length}. Mock mode simulates successful creation. Suggested cadence follows the monitoring option captured during intake.</p>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-slate-500">{label}</dt><dd>{value}</dd></div>; }
function Metric({ title, value }: { title: string; value: number }) { return <div className="rounded-xl border border-slate-800 p-4"><div className="flex justify-between"><span>{title}</span><strong>{value}</strong></div><Progress value={value} /></div>; }
function List({ title, items }: { title: string; items: string[] }) { return <div className="mt-3"><h3 className="font-semibold">{title}</h3><ul className="mt-2 list-disc pl-5 text-slate-300">{items.map((item) => <li key={item}>{item}</li>)}</ul></div>; }
function SkillSources() { return <div className="mt-3 grid gap-3 md:grid-cols-2">{recommendedSkillSources.map((source) => <div key={source.name} className="rounded-xl border border-slate-800 p-3"><div className="flex justify-between gap-2"><strong>{source.name}</strong><Badge tone={source.enabled ? "green" : "slate"}>{source.enabled ? "enabled" : "reference"}</Badge></div><p className="mt-2 text-sm text-slate-400">{source.usage}</p></div>)}<div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 md:col-span-2"><strong>Skill Safety Policy</strong><ul className="mt-2 list-disc pl-5 text-sm text-amber-100">{skillSafetyPolicy.map((policy) => <li key={policy}>{policy}</li>)}</ul></div></div>; }
