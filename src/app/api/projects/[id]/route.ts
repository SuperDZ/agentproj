import { NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({ where: { id }, include: { competitors: true, researchRuns: true, evaluations: true, artifacts: true, monitorJobs: true } });
    return project ? NextResponse.json(project) : jsonError("Resource not found", 404);
  } catch (error) {
    return handleApiError(error);
  }
}
