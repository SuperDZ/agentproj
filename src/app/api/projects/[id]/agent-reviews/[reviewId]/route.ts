import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { getAgentReview } from "@/lib/agents/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; reviewId: string }> }) {
  try {
    const { id, reviewId } = await params;
    const review = await getAgentReview(id, reviewId);
    return NextResponse.json({ review });
  } catch (error) {
    return handleApiError(error);
  }
}
