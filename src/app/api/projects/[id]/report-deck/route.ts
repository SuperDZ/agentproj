import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { generateProjectReportDeckPackage, getArtifactContent, loadProjectFlowData } from "@/lib/services/project-flow";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await loadProjectFlowData(id);
    const content = getArtifactContent(project, "hermes_ppt_task");
    return NextResponse.json({ package: content ? JSON.parse(content) : null });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const reportPackage = await generateProjectReportDeckPackage(id);
    return NextResponse.json({ package: reportPackage });
  } catch (error) {
    return handleApiError(error);
  }
}
