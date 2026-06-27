import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { retryAgentRun } from "@/lib/agents/service";

export async function POST(_: Request, { params }: { params: Promise<{ id: string; reviewId: string; runId: string }> }) {
  try {
    const { id, reviewId, runId } = await params;
    const run = await retryAgentRun(id, reviewId, runId);
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return handleApiError(error);
  }
}
