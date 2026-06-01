"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { demoIdea } from "@/lib/mock/demo";
import { createProjectSchema, projectNameFromIdea } from "@/lib/project-schema";
import {
  createProjectMonitorJob,
  evaluateProjectById,
  exportProjectCodexPack,
  generateProjectPrd,
  runProjectResearch,
  saveProjectPrd
} from "@/lib/services/project-flow";

export async function createProject(formData: FormData) {
  const input = createProjectSchema.parse({
    idea: formData.get("idea") || undefined,
    industry: formData.get("industry") || undefined,
    targetUser: formData.get("targetUser") || undefined,
    needFinancialSuitabilityCheck: formData.get("financial") === "on",
    needContinuousCompetitorMonitoring: formData.get("monitoring") === "on",
    preferredTechStack: formData.get("stack") || undefined
  });
  const project = await prisma.project.create({
    data: {
      name: projectNameFromIdea(input.idea),
      idea: input.idea,
      industry: input.industry,
      targetUser: input.targetUser,
      needFinancialSuitabilityCheck: input.needFinancialSuitabilityCheck,
      needContinuousCompetitorMonitoring: input.needContinuousCompetitorMonitoring,
      preferredTechStack: input.preferredTechStack || null,
      status: "intake"
    }
  });
  redirect(`/projects/${project.id}`);
}

export async function createDemoProject() {
  const project = await prisma.project.create({ data: { ...demoIdea, status: "demo" } });
  redirect(`/projects/${project.id}`);
}

export async function runResearch(projectId: string) {
  try {
    await runProjectResearch(projectId);
  } catch {
    // The service persists failed ResearchRun state; keep the workspace available for retry.
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

export async function evaluateCurrentProject(projectId: string) {
  await evaluateProjectById(projectId);
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
