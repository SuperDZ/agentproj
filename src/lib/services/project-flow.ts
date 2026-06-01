import type { Prisma } from "@prisma/client";
import { evaluateProject, type EvaluationResult } from "@/lib/evaluation/engine";
import { generateCodexPack, generatePrdMarkdown, packToClipboardText, type CodexPackFile, type PackProject } from "@/lib/export/codex-pack";
import { hermesClient } from "@/lib/hermes/client";
import { parseHermesResearchOutput } from "@/lib/hermes/parser";
import type { HermesMode, HermesResearchOutput, HermesRunStatus } from "@/lib/hermes/types";
import { prisma } from "@/lib/db/prisma";

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

function toPackProject(project: PackProject): PackProject {
  return {
    name: project.name,
    idea: project.idea,
    industry: project.industry,
    targetUser: project.targetUser,
    preferredTechStack: project.preferredTechStack
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

async function persistResearchResult(projectId: string, runDbId: string, result: { hermesRunId: string; mode: HermesMode; status: HermesRunStatus; rawOutput: string; parsedOutput?: HermesResearchOutput }) {
  const mutations: Prisma.PrismaPromise<unknown>[] = [
    prisma.researchRun.update({
      where: { id: runDbId },
      data: {
        hermesRunId: result.hermesRunId,
        mode: result.mode,
        status: result.status,
        rawOutput: result.rawOutput,
        parsedOutputJson: result.parsedOutput ? JSON.stringify(result.parsedOutput) : undefined,
        completedAt: ["completed", "failed", "completed_without_output"].includes(result.status) ? new Date() : undefined
      }
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

export async function refreshLatestResearchRun(projectId: string) {
  const project = await loadProjectFlowData(projectId);
  const latestRun = project.researchRuns[0];
  if (!latestRun?.hermesRunId || latestRun.parsedOutputJson || ["failed", "completed_without_output"].includes(latestRun.status)) return latestRun;

  const result = await hermesClient.getRunResult(latestRun.hermesRunId);
  await persistResearchResult(projectId, latestRun.id, result);
  return prisma.researchRun.findUnique({ where: { id: latestRun.id } });
}

export async function runProjectResearch(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const inputPrompt = `Research competitors and product differentiation for: ${project.idea}`;
  const dbRun = await prisma.researchRun.create({ data: { projectId, mode: hermesClient.mode(), status: "running", inputPrompt } });

  try {
    const result = await hermesClient.createResearchRun({
      projectId,
      idea: project.idea,
      industry: project.industry,
      targetUser: project.targetUser,
      financialSuitability: project.needFinancialSuitabilityCheck || /finance|wealth|fintech|财富|金融/.test(project.industry + project.idea),
      preferredTechStack: project.preferredTechStack || undefined
    });

    await persistResearchResult(projectId, dbRun.id, result);
    return result;
  } catch (error) {
    await prisma.researchRun.update({ where: { id: dbRun.id }, data: { status: "failed", rawOutput: String(error), completedAt: new Date() } });
    throw error;
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

export async function evaluateProjectById(projectId: string) {
  const project = await loadProjectFlowData(projectId);
  const { evaluation } = evaluateProjectFlow(project);
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

export async function createProjectMonitorJob(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const schedule = project.needContinuousCompetitorMonitoring ? "0 9 * * 1" : "0 9 1 * *";
  const result = await hermesClient.createMonitorJob(projectId, schedule);
  return prisma.monitorJob.create({ data: { projectId, hermesCronJobId: result.hermesCronJobId, schedule, status: result.status ?? "active" } });
}
