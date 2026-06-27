import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { regeneratePrdReviewGateReviewer } from "@/lib/services/project-flow";

export async function POST(_: Request, { params }: { params: Promise<{ id: string; role: string }> }) {
  try {
    const { id, role } = await params;
    return NextResponse.json(await regeneratePrdReviewGateReviewer(id, decodeURIComponent(role)));
  } catch (error) {
    return handleApiError(error);
  }
}
