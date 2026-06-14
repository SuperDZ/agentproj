"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui";

type HermesEvent = {
  id: string;
  at: string;
  level: "info" | "warning" | "error";
  message: string;
};

type ResearchStatus = {
  id?: string;
  hermesRunId?: string | null;
  mode?: string;
  status: "not_started" | "queued" | "running" | "completed" | "failed" | "completed_without_output";
  hasParsedOutput?: boolean;
  createdAt?: string;
  completedAt?: string | null;
  refreshError?: string;
  eventsError?: string;
  events?: HermesEvent[];
};

type Props = {
  endpoint: string;
  initialStatus: ResearchStatus;
};

const runningStatuses = new Set(["queued", "running"]);

function formatElapsed(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function statusText(status: ResearchStatus["status"], hasParsedOutput?: boolean) {
  if (status === "not_started") return "尚未开始";
  if (status === "queued") return "排队中";
  if (status === "running") return "研究中";
  if (status === "completed" && hasParsedOutput) return "已完成";
  if (status === "completed") return "已完成，等待结构化结果";
  if (status === "completed_without_output") return "已结束但无结构化输出";
  return "失败";
}

function currentStage(status: ResearchStatus) {
  if (status.status === "not_started") return "等待用户点击运行 Hermes 研究。";
  if (status.status === "queued") return "任务已写入后端，等待 Hermes 接收。";
  if (status.status === "running" && !status.hermesRunId) return "后端已创建 ResearchRun，正在调用 Hermes 模型。";
  if (status.status === "running") return "Hermes 正在执行研究，等待结果同步。";
  if (status.status === "completed" && status.hasParsedOutput) return "研究结果已解析并写入竞品矩阵与差异化判断。";
  if (status.status === "completed") return "Hermes 已结束，正在等待或校验结构化输出。";
  if (status.status === "completed_without_output") return "Hermes 已结束，但未返回可解析输出。";
  return "研究失败，请查看错误信息后重试。";
}

export function ResearchRunStatus({ endpoint, initialStatus }: Props) {
  const [status, setStatus] = useState<ResearchStatus>(initialStatus);
  const [now, setNow] = useState(() => Date.now());

  const isRunning = runningStatuses.has(status.status);
  const elapsedSeconds = useMemo(() => {
    if (!status.createdAt) return 0;
    const start = new Date(status.createdAt).getTime();
    const end = status.completedAt ? new Date(status.completedAt).getTime() : now;
    return Math.max(0, Math.floor((end - start) / 1000));
  }, [now, status.completedAt, status.createdAt]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const payload = await response.json();
        if (active && response.ok) setStatus(payload);
      } catch {
        // Keep the last known server state visible. The next poll may recover.
      }
    }, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [endpoint, isRunning]);

  const tone = status.status === "failed" || status.status === "completed_without_output"
    ? "red"
    : status.status === "completed" && status.hasParsedOutput
      ? "green"
      : isRunning
        ? "yellow"
        : "slate";

  return (
    <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone}>{statusText(status.status, status.hasParsedOutput)}</Badge>
          {status.mode && <span className="text-xs text-zinc-500">模式：{status.mode}</span>}
          {status.id && <span className="text-xs text-zinc-500">Run：{status.id}</span>}
        </div>
        {status.createdAt && (
          <div className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 font-mono text-sm text-zinc-900">
            {formatElapsed(elapsedSeconds)}
          </div>
        )}
      </div>
      <div className="flex items-start gap-2 text-sm leading-6 text-zinc-700">
        {isRunning && <span className="mt-2 h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-600" />}
        <span>{currentStage(status)}</span>
      </div>
      {(status.refreshError || status.eventsError) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-800">
          {status.refreshError && <p>状态刷新错误：{status.refreshError}</p>}
          {status.eventsError && <p>事件读取错误：{status.eventsError}</p>}
        </div>
      )}
      {status.events && status.events.length > 0 && (
        <details className="rounded-md border border-zinc-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium text-zinc-900">Hermes 事件</summary>
          <ul className="mt-2 grid gap-2 text-xs leading-5 text-zinc-600">
            {status.events.slice(-5).map((event) => (
              <li key={event.id}>
                <span className="font-mono text-zinc-400">{new Date(event.at).toLocaleTimeString("zh-CN")}</span>
                <span className="ml-2">{event.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
