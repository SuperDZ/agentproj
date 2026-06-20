import { NextResponse } from "next/server";
import { handleApiError, jsonError } from "@/lib/api/errors";
import { cacheDelete, cacheGetJson, cacheSetJson } from "@/lib/cache/redis";
import { prisma } from "@/lib/db/prisma";
import { deleteProjectStoredArtifacts } from "@/lib/artifacts/store";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cacheKey = `projects:detail:${id}`;
    const cached = await cacheGetJson<unknown>(cacheKey);
    if (cached) return NextResponse.json(cached);
    const project = await prisma.project.findUnique({ where: { id }, include: { competitors: true, researchRuns: true, evaluations: true, artifacts: true, monitorJobs: true } });
    if (!project) return jsonError("Resource not found", 404);
    await cacheSetJson(cacheKey, project, 120);
    return NextResponse.json(project);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteProjectStoredArtifacts(id);
    await prisma.project.delete({ where: { id } });
    await Promise.all([cacheDelete("projects:list"), cacheDelete(`projects:detail:${id}`)]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
