import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { evaluateProjectById, evaluateProjectFlow, loadProjectFlowData } from "@/lib/services/project-flow";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    await evaluateProjectById(params.id);
    const project = await loadProjectFlowData(params.id);
    return NextResponse.json(evaluateProjectFlow(project).evaluation);
  } catch (error) {
    return handleApiError(error);
  }
}
