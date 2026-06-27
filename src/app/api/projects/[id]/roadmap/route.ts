import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { generateRoadmap } from "@/lib/services/project-flow";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await generateRoadmap(id));
  } catch (error) {
    return handleApiError(error);
  }
}
