import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api/errors";
import { createProjectMonitorJob } from "@/lib/services/project-flow";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const taskConfigs = Array.isArray(body.taskConfigs)
      ? body.taskConfigs.map((item: Record<string, unknown>) => ({
        task: String(item.task || ""),
        startAt: String(item.startAt || ""),
        cadence: String(item.cadence || "")
      })).filter((item: { task: string; startAt: string; cadence: string }) => item.task && item.startAt && ["daily", "weekly", "monthly"].includes(item.cadence))
      : undefined;
    const job = await createProjectMonitorJob(id, {
      cadence: taskConfigs?.[0]?.cadence as "daily" | "weekly" | "monthly" | undefined,
      tasks: taskConfigs?.map((item: { task: string }) => item.task) ?? (Array.isArray(body.tasks) ? body.tasks.map(String).filter(Boolean) : undefined),
      taskConfigs
    });
    return NextResponse.json(job);
  } catch (error) {
    return handleApiError(error);
  }
}
