import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { hermesClient } from "@/lib/hermes/client";
import type { HermesEvent } from "@/lib/hermes/types";
import { loadProjectFlowData, runProjectResearch } from "@/lib/services/project-flow";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const project = await loadProjectFlowData(id);
    const latestRun = project.researchRuns[0];
    if (!latestRun) return NextResponse.json({ status: "not_started", events: [] });

    let events: HermesEvent[] = [];
    let eventsError: string | undefined;
    try {
      events = latestRun.hermesRunId ? await hermesClient.getRunEvents(latestRun.hermesRunId) : [];
    } catch (error) {
      eventsError = error instanceof Error ? error.message : "Unable to fetch Hermes run events.";
    }

    return NextResponse.json({
      id: latestRun.id,
      hermesRunId: latestRun.hermesRunId,
      mode: latestRun.mode,
      status: latestRun.status,
      hasParsedOutput: Boolean(latestRun.parsedOutputJson),
      createdAt: latestRun.createdAt,
      completedAt: latestRun.completedAt,
      eventsError,
      events
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const run = await runProjectResearch(id);
    if (!run) throw new Error("Research run was not created or advanced.");
    return NextResponse.json({
      ok: true,
      id: run.id,
      status: run.status,
      mode: run.mode,
      hermesRunId: run.hermesRunId,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      hasParsedOutput: Boolean(run.parsedOutputJson)
    });
  } catch (error) {
    return handleApiError(error);
  }
}
