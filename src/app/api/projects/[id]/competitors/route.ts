import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    return NextResponse.json(await prisma.competitor.findMany({ where: { projectId: params.id }, orderBy: { threatLevel: "desc" } }));
  } catch (error) {
    return handleApiError(error);
  }
}
