import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { createProjectMonitorJob } from "@/lib/services/project-flow";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const job = await createProjectMonitorJob(params.id);
    return NextResponse.json(job);
  } catch (error) {
    return handleApiError(error);
  }
}
