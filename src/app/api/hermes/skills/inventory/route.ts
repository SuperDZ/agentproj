import { NextResponse } from "next/server";
import { getSkillsInventory } from "@/lib/hermes/control";
import { recommendedSkillSources } from "@/lib/skills/recommended-skills";

export async function GET() {
  return NextResponse.json(await getSkillsInventory(recommendedSkillSources));
}
