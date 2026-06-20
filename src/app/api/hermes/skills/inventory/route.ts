import { NextResponse } from "next/server";
import { cacheGetJson, cacheSetJson } from "@/lib/cache/redis";
import { readSkillsInventoryWithRecommendations, refreshGlobalSkillsInventoryCache } from "@/lib/hermes/control";
import { recommendedSkillSources } from "@/lib/skills/recommended-skills";
import { prisma } from "@/lib/db/prisma";
import { parseProjectSkillToolRecommendations, projectSkillToolRecommendationsArtifact } from "@/lib/skills/project-recommendations";
import type { SkillInventoryResponse } from "@/lib/skills/skill-types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const sync = searchParams.get("sync") === "1";
  const baseInventory = sync ? await refreshGlobalSkillsInventoryCache() : null;

  if (projectId) {
    const artifact = await prisma.generatedArtifact.findFirst({
      where: { projectId, artifactType: projectSkillToolRecommendationsArtifact },
      orderBy: { createdAt: "desc" }
    });
    const recommended = parseProjectSkillToolRecommendations(artifact?.content);
    const cacheKey = `skills:inventory:project:${projectId}:${artifact?.id ?? "none"}:${sync ? "sync" : "cached"}`;
    const cached = sync ? null : await cacheGetJson<SkillInventoryResponse>(cacheKey);
    if (cached) return NextResponse.json({ ...cached, cache: "hit" });

    if (sync) {
      const merged = await readSkillsInventoryWithRecommendations(recommended);
      const response = { ...merged, installedSkills: baseInventory?.installedSkills ?? merged.installedSkills, installedTools: baseInventory?.installedTools ?? merged.installedTools };
      await cacheSetJson(cacheKey, response, 300);
      return NextResponse.json({ ...response, cache: "miss" });
    }
    const response = await readSkillsInventoryWithRecommendations(recommended);
    await cacheSetJson(cacheKey, response, 300);
    return NextResponse.json({ ...response, cache: "miss" });
  }

  const cacheKey = `skills:inventory:global:${sync ? "sync" : "cached"}`;
  const cached = sync ? null : await cacheGetJson<SkillInventoryResponse>(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cache: "hit" });

  if (sync) {
    const merged = await readSkillsInventoryWithRecommendations(recommendedSkillSources);
    const response = { ...merged, installedSkills: baseInventory?.installedSkills ?? merged.installedSkills, installedTools: baseInventory?.installedTools ?? merged.installedTools };
    await cacheSetJson(cacheKey, response, 300);
    return NextResponse.json({ ...response, cache: "miss" });
  }
  const response = await readSkillsInventoryWithRecommendations(recommendedSkillSources);
  await cacheSetJson(cacheKey, response, 300);
  return NextResponse.json({ ...response, cache: "miss" });
}
