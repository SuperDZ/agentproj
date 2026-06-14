import { NextResponse } from "next/server";
import { searchGithubSkills } from "@/lib/hermes/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json({ items: await searchGithubSkills(searchParams.get("q") || "agent skills") });
}
