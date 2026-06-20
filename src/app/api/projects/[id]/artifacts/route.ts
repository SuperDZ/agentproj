import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { listProjectArtifacts } from "@/lib/artifacts/store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const artifacts = await listProjectArtifacts(id);
    return NextResponse.json({ artifacts });
  } catch (error) {
    return handleApiError(error);
  }
}
