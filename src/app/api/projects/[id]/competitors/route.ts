import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await prisma.competitor.findMany({ where: { projectId: id }, orderBy: { threatLevel: "desc" } }));
  } catch (error) {
    return handleApiError(error);
  }
}
