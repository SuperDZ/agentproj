import { NextResponse } from "next/server";
import { getHermesStatus, restartHermesDashboard, saveModelConfig, startHermesDashboard, stopHermesDashboard } from "@/lib/hermes/control";

export async function GET() {
  return NextResponse.json(await getHermesStatus());
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown Hermes control error.");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { action } = body;

  try {
    if (action === "start") return NextResponse.json(await startHermesDashboard());
    if (action === "stop") return NextResponse.json(await stopHermesDashboard());
    if (action === "restart") return NextResponse.json(await restartHermesDashboard());
    if (action === "configure-model") {
      return NextResponse.json(await saveModelConfig({
        provider: String(body.provider || "deepseek"),
        model: String(body.model || "deepseek-chat"),
        usageMode: String(body.usageMode || "api"),
        codexCliCommand: String(body.codexCliCommand || "codex")
      }));
    }
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }

  return NextResponse.json({ error: "Unsupported Hermes action." }, { status: 400 });
}
