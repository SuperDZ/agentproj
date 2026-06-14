import { NextResponse } from "next/server";
import { SkillImportForbiddenError, importGithubSkill } from "@/lib/hermes/control";

export async function POST(request: Request) {
  try {
    const { cloneUrl, name, safety, safetyStatus, url, identifier } = await request.json();
    if (!name || (!cloneUrl && !url && !identifier)) {
      return NextResponse.json({ error: "name and one of identifier, url, or cloneUrl are required." }, { status: 400 });
    }
    return NextResponse.json(await importGithubSkill({ cloneUrl, name, safetyStatus: safetyStatus || safety?.status, url, identifier }));
  } catch (error) {
    const status = error instanceof SkillImportForbiddenError || (error instanceof Error && "status" in error && error.status === 403) ? 403 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Skill import failed." }, { status });
  }
}
