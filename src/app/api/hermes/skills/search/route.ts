import { NextResponse } from "next/server";
import { cacheGetJson, cacheSetJson, rateLimit } from "@/lib/cache/redis";
import { searchGithubSkills } from "@/lib/hermes/search";
import type { SkillSearchResult } from "@/lib/skills/skill-types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "agent skills";
  const clientId = (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "local")
    .split(",")[0]
    .trim()
    .replace(/[^a-zA-Z0-9:._-]/g, "_");
  const limit = await rateLimit(`github-skill-search:${clientId}`, 30, 60);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "GitHub Skill search rate limit exceeded.", limit: limit.limit, resetSeconds: limit.resetSeconds },
      { status: 429, headers: { "Retry-After": String(limit.resetSeconds) } }
    );
  }

  const cacheKey = `skills:search:${query.trim().toLowerCase()}`;
  const cached = await cacheGetJson<SkillSearchResult[]>(cacheKey);
  if (cached) return NextResponse.json({ items: cached, cache: "hit" });

  const items = await searchGithubSkills(query);
  await cacheSetJson(cacheKey, items, 300);
  return NextResponse.json({ items, cache: "miss" });
}
