import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { generateProjectPrototypePrompt, getArtifactContent, loadProjectFlowData } from "@/lib/services/project-flow";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await loadProjectFlowData(id);
    return NextResponse.json({ prompt: getArtifactContent(project, "prototype_design_prompt") || "" });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const prompt = await generateProjectPrototypePrompt(id);
    return NextResponse.json({ prompt });
  } catch (error) {
    return handleApiError(error);
  }
}
