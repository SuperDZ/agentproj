"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { deleteProjectStoredArtifacts } from "@/lib/artifacts/store";
import { ensureLocalHermesDashboardRunning } from "@/lib/hermes/control";
import { demoIdea } from "@/lib/mock/demo";
import { createProjectSchema, projectNameFromIdea } from "@/lib/project-schema";
import {
  createProjectMonitorJob,
  createProjectSkillToolRecommendations,
  evaluateProjectById,
  exportProjectCodexPack,
  generateEvidenceBasedPdrs,
  generateInitialProjectPlanningWithHermes,
  generateProjectPrd,
  generateRoadmap,
  generateTechStackRecommendations,
  runPrdReviewGate,
  runProjectResearch,
  saveProjectPrd,
  saveReportAssistantContext,
  selectProjectTechStack
} from "@/lib/services/project-flow";

export async function createProject(formData: FormData) {
  const input = createProjectSchema.parse({
    idea: formData.get("idea") || undefined,
    ideaExplanation: formData.get("ideaExplanation") || undefined,
    industry: formData.get("industry") || undefined,
    targetUser: formData.get("targetUser") || undefined,
    needFinancialSuitabilityCheck: formData.get("financial") === "on",
    needContinuousCompetitorMonitoring: formData.get("monitoring") === "on",
    preferredTechStack: undefined,
    monitorTasks: formData.get("monitorTasks") || undefined,
    monitorTaskConfigs: formData.get("monitorTaskConfigs") || undefined,
    modelProvider: formData.get("modelProvider") || undefined,
    modelName: formData.get("modelName") || undefined
  });

  await ensureLocalHermesDashboardRunning();

  const project = await prisma.project.create({
    data: {
      name: projectNameFromIdea(input.idea),
      idea: input.idea,
      industry: input.industry,
      targetUser: input.targetUser,
      needFinancialSuitabilityCheck: input.needFinancialSuitabilityCheck,
      needContinuousCompetitorMonitoring: input.needContinuousCompetitorMonitoring,
      preferredTechStack: null,
      status: "intake"
    }
  });

  if (input.ideaExplanation) {
    await prisma.generatedArtifact.create({ data: { projectId: project.id, artifactType: "idea_explanation", content: input.ideaExplanation } });
  }
  if (input.needContinuousCompetitorMonitoring) {
    await prisma.generatedArtifact.create({
      data: {
        projectId: project.id,
        artifactType: "monitor_preferences",
        content: JSON.stringify({
          tasks: input.monitorTasks?.split(",").map((item) => item.trim()).filter(Boolean) ?? [],
          taskConfigs: input.monitorTaskConfigs
        })
      }
    });
  }
  await prisma.generatedArtifact.create({ data: { projectId: project.id, artifactType: "model_config", content: JSON.stringify(input.modelConfig) } });
  await createProjectSkillToolRecommendations(project.id);
  await generateInitialProjectPlanningWithHermes(project.id);
  redirect(`/projects/${project.id}`);
}

export async function createDemoProject() {
  await ensureLocalHermesDashboardRunning();
  const project = await prisma.project.create({ data: { ...demoIdea, status: "demo" } });
  await createProjectSkillToolRecommendations(project.id);
  await generateInitialProjectPlanningWithHermes(project.id);
  redirect(`/projects/${project.id}`);
}

export async function deleteProject(projectId: string) {
  await deleteProjectStoredArtifacts(projectId);
  await prisma.project.delete({ where: { id: projectId } });
  revalidatePath("/");
  revalidatePath("/projects");
}

export async function saveReportAssistant(projectId: string, formData: FormData) {
  await saveReportAssistantContext(projectId, {
    pmPlanningAdvice: String(formData.get("pmPlanningAdvice") || ""),
    problemAndUsers: String(formData.get("problemAndUsers") || ""),
    coreFeatures: String(formData.get("coreFeatures") || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5)
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function saveReportAssistantWithStatus(projectId: string, _state: { ok: boolean; message: string }, formData: FormData) {
  await saveReportAssistantContext(projectId, {
    pmPlanningAdvice: String(formData.get("pmPlanningAdvice") || ""),
    problemAndUsers: String(formData.get("problemAndUsers") || ""),
    coreFeatures: String(formData.get("coreFeatures") || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5)
  });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, message: "已保存" };
}

export async function runResearch(projectId: string) {
  try {
    await runProjectResearch(projectId);
  } catch {
    // 服务层会持久化失败状态；页面保留重试能力。
  } finally {
    revalidatePath(`/projects/${projectId}`);
  }
}

export async function generatePrd(projectId: string) {
  await generateProjectPrd(projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function savePrd(projectId: string, formData: FormData) {
  await saveProjectPrd(projectId, String(formData.get("content") || ""));
  revalidatePath(`/projects/${projectId}`);
}

export async function generateTechStack(projectId: string) {
  await generateTechStackRecommendations(projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function selectTechStack(projectId: string, formData: FormData) {
  await selectProjectTechStack(projectId, String(formData.get("stackId") || ""));
  revalidatePath(`/projects/${projectId}`);
}

export async function evaluateCurrentProject(projectId: string) {
  await evaluateProjectById(projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function generateEvidencePdrsAction(projectId: string) {
  await generateEvidenceBasedPdrs(projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function generateRoadmapAction(projectId: string) {
  await generateRoadmap(projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function runPrdReviewGateAction(projectId: string) {
  await runPrdReviewGate(projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function exportCodexPack(projectId: string) {
  await exportProjectCodexPack(projectId);
  revalidatePath(`/projects/${projectId}`);
}

export async function createMonitorJob(projectId: string) {
  await createProjectMonitorJob(projectId);
  revalidatePath(`/projects/${projectId}`);
}
