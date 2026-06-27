import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { createAgentReview, listAgentReviews, processInitialAgentReviewDispatch } from "@/lib/agents/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const reviews = await listAgentReviews(id);
    return NextResponse.json({ reviews });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const review = await createAgentReview(id, body);
    const dispatch = await processInitialAgentReviewDispatch(review.id);
    return NextResponse.json({ ok: true, review, dispatch });
  } catch (error) {
    return handleApiError(error);
  }
}
