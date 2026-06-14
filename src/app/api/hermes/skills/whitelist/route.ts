import { NextResponse } from "next/server";
import { addSkillWhitelist, readSkillWhitelist, removeSkillWhitelist } from "@/lib/hermes/whitelist";

export async function GET() {
  return NextResponse.json({ items: await readSkillWhitelist() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });
  const entry = await addSkillWhitelist({
    name,
    url: body.url ? String(body.url) : undefined,
    cloneUrl: body.cloneUrl ? String(body.cloneUrl) : undefined,
    kind: body.kind === "tool" ? "tool" : "skill"
  });
  return NextResponse.json(entry);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });
  return NextResponse.json(await removeSkillWhitelist(name));
}
