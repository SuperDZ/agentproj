import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { generateTechStackRecommendations, loadProjectFlowData, parseTechStackRecommendations, selectProjectTechStack } from "@/lib/services/project-flow";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await loadProjectFlowData(id);
    return NextResponse.json({
      recommendations: parseTechStackRecommendations(project),
      preferredTechStack: project.preferredTechStack
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body.action === "select") {
      const selected = await selectProjectTechStack(id, String(body.stackId || ""));
      return NextResponse.json({ selected });
    }
    const recommendations = await generateTechStackRecommendations(id);
    return NextResponse.json({ recommendations });
  } catch (error) {
    return handleApiError(error);
  }
}
