import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { hermesClient } from "@/lib/hermes/client";
import type { HermesEvent } from "@/lib/hermes/types";
import { loadProjectFlowData, refreshLatestResearchRun, runProjectResearch } from "@/lib/services/project-flow";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    let refreshError: string | undefined;
    try {
      await refreshLatestResearchRun(params.id);
    } catch (error) {
      refreshError = error instanceof Error ? error.message : "Unable to refresh Hermes run.";
    }

    const project = await loadProjectFlowData(params.id);
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
      refreshError,
      eventsError,
      events
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const result = await runProjectResearch(params.id);
    return NextResponse.json({ ok: true, status: result.status, hermesRunId: result.hermesRunId, hasParsedOutput: Boolean(result.parsedOutput) });
  } catch (error) {
    return handleApiError(error);
  }
}
