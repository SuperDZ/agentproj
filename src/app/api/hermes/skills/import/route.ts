import { NextResponse } from "next/server";
import { importGithubSkill } from "@/lib/hermes/control";

export async function POST(request: Request) {
  try {
    const { cloneUrl, name, url, identifier } = await request.json();
    if (!name || (!cloneUrl && !url && !identifier)) {
      return NextResponse.json({ error: "name and one of identifier, url, or cloneUrl are required." }, { status: 400 });
    }
    return NextResponse.json(await importGithubSkill({ cloneUrl, name, url, identifier }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Skill import failed." }, { status: 500 });
  }
}
