import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { hermesResourceConfigArtifact, parseHermesResourceConfig, type HermesResourceConfig } from "@/lib/skills/resource-config";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const artifact = await prisma.generatedArtifact.findFirst({
      where: { projectId: id, artifactType: hermesResourceConfigArtifact },
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json(parseHermesResourceConfig(artifact?.content));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json().catch(() => ({})) as Partial<HermesResourceConfig>;
    const config: HermesResourceConfig = {
      mode: payload.mode === "auto" ? "auto" : "manual",
      enabled: Array.isArray(payload.enabled)
        ? payload.enabled
          .filter((item) => item?.kind && item?.name && item?.path)
          .map((item) => ({
            kind: item.kind === "tool" ? "tool" : "skill",
            name: String(item.name),
            path: String(item.path),
            descriptionZh: item.descriptionZh ? String(item.descriptionZh) : undefined,
            category: item.category ? String(item.category) : undefined,
            source: item.source,
            purpose: Array.isArray(item.purpose) ? item.purpose.map(String) : undefined,
            recommendationScore: Number.isFinite(Number(item.recommendationScore)) ? Number(item.recommendationScore) : undefined
          }))
        : [],
      updatedAt: new Date().toISOString()
    };

    await prisma.generatedArtifact.create({
      data: {
        projectId: id,
        artifactType: hermesResourceConfigArtifact,
        content: JSON.stringify(config)
      }
    });

    return NextResponse.json(config);
  } catch (error) {
    return handleApiError(error);
  }
}
