import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { generateProjectPrd } from "@/lib/services/project-flow";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const artifact = await generateProjectPrd(id);
    return NextResponse.json(artifact);
  } catch (error) {
    return handleApiError(error);
  }
}
