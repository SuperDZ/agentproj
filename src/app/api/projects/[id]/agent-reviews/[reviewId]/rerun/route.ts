import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { rerunAgentReview } from "@/lib/agents/service";

export async function POST(_: Request, { params }: { params: Promise<{ id: string; reviewId: string }> }) {
  try {
    const { id, reviewId } = await params;
    const review = await rerunAgentReview(id, reviewId);
    return NextResponse.json({ ok: true, review });
  } catch (error) {
    return handleApiError(error);
  }
}
