import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { exportProjectCodexPack } from "@/lib/services/project-flow";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const files = await exportProjectCodexPack(id);
    return NextResponse.json({ files });
  } catch (error) {
    return handleApiError(error);
  }
}
