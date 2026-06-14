import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { createProjectSchema, projectNameFromIdea } from "@/lib/project-schema";
import { generateInitialProjectPlanningWithHermes } from "@/lib/services/project-flow";

export async function POST(request: Request) {
  try {
    const input = createProjectSchema.parse(await request.json());
    const project = await prisma.project.create({
      data: {
        name: input.name || projectNameFromIdea(input.idea),
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
    await prisma.generatedArtifact.create({ data: { projectId: project.id, artifactType: "model_config", content: JSON.stringify(input.modelConfig) } });
    await generateInitialProjectPlanningWithHermes(project.id);
    return NextResponse.json(project);
  } catch (error) {
    return handleApiError(error);
  }
}
