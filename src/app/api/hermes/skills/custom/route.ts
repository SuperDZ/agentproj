import { NextResponse } from "next/server";
import { createCustomSkill } from "@/lib/hermes/control";

export async function POST(request: Request) {
  const { name, body } = await request.json();
  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });
  return NextResponse.json(await createCustomSkill(name, body || ""));
}
