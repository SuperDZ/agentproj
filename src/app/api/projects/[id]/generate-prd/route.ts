import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { generateProjectPrd } from "@/lib/services/project-flow";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const artifact = await generateProjectPrd(params.id);
    return NextResponse.json(artifact);
  } catch (error) {
    return handleApiError(error);
  }
}
