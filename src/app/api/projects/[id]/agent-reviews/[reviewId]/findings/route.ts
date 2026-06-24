import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { listAgentReviewFindings } from "@/lib/agents/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; reviewId: string }> }) {
  try {
    const { id, reviewId } = await params;
    const findings = await listAgentReviewFindings(id, reviewId);
    return NextResponse.json({ findings });
  } catch (error) {
    return handleApiError(error);
  }
}
