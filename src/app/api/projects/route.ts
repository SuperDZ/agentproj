import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { createProjectSchema, projectNameFromIdea } from "@/lib/project-schema";

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
        preferredTechStack: input.preferredTechStack || null,
        status: "intake"
      }
    });
    return NextResponse.json(project);
  } catch (error) {
    return handleApiError(error);
  }
}
