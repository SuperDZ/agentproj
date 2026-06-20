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
  status: "not_started" | "queued" | "running" | "completed" | "failed" | "completed_without_output" | "completed_with_fallback";
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

const activeStatuses = new Set<ResearchStatus["status"]>(["queued", "running"]);

function formatElapsed(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatTime(value?: string | null) {
  if (!value) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function statusText(status: ResearchStatus) {
  if (status.status === "not_started") return "未开始";
  if (status.status === "queued") return "排队中";
  if (status.status === "running") return "调用中";
  if (status.status === "completed" && status.hasParsedOutput) return "已完成";
  if (status.status === "completed") return "已完成，待解析";
  if (status.status === "completed_with_fallback") return "已完成，使用兜底结果";
  if (status.status === "completed_without_output") return "无结构化输出";
  return "失败";
}

function currentStage(status: ResearchStatus) {
  if (status.status === "not_started") return "当前项目尚未创建 Hermes 调研任务。";
  if (status.status === "queued") return "当前项目调研任务已进入队列，等待后端推进。";
  if (status.status === "running" && !status.hermesRunId) return "当前项目 ResearchRun 已创建，正在调用本地或远程 Hermes。";
  if (status.status === "running") return "Hermes Run 已创建，正在同步真实运行结果。";
  if (status.status === "completed" && status.hasParsedOutput) return "真实调研结果已解析并写入当前项目。";
  if (status.status === "completed") return "Hermes 已完成，正在等待结构化结果解析。";
  if (status.status === "completed_with_fallback") return "Hermes 返回内容不可完全解析，当前项目已写入本地兜底结果。";
  if (status.status === "completed_without_output") return "Hermes 调用已结束，但没有可写入项目的结构化输出。";
  return "当前项目调研失败，请查看刷新错误或 Hermes 事件后重试。";
}

function toneFor(status: ResearchStatus) {
  if (status.status === "failed" || status.status === "completed_without_output" || status.status === "completed_with_fallback") return "red";
  if (status.status === "completed" && status.hasParsedOutput) return "green";
  if (activeStatuses.has(status.status)) return "yellow";
  return "slate";
}

export function ResearchRunStatus({ endpoint, initialStatus }: Props) {
  const [status, setStatus] = useState<ResearchStatus>(initialStatus);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const isActive = activeStatuses.has(status.status);

  const elapsedSeconds = useMemo(() => {
    if (!status.createdAt) return 0;
    const start = new Date(status.createdAt).getTime();
    const end = status.completedAt ? new Date(status.completedAt).getTime() : now;
    return Math.max(0, Math.floor((end - start) / 1000));
  }, [now, status.completedAt, status.createdAt]);

  const visibleEvents = useMemo(() => (status.events ?? []).slice(-8), [status.events]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));

        if (!active) return;
        if (!response.ok) throw new Error(payload.error || payload.message || "读取 Hermes 调研状态失败。");

        setStatus(payload);
        setRequestError(null);
      } catch (error) {
        if (!active) return;
        setRequestError(error instanceof Error ? error.message : "读取 Hermes 调研状态失败。");
      }
    }

    void loadStatus();
    const timer = window.setInterval(loadStatus, 2500);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [endpoint]);

  const queuedTooLong = status.status === "queued" && elapsedSeconds >= 60;

  return (
    <div className="grid gap-3 rounded-lg border border-stone-200 bg-stone-100/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={toneFor(status)}>{statusText(status)}</Badge>
          {status.mode && <span className="text-xs text-stone-500">模式：{status.mode}</span>}
          {status.id && <span className="text-xs text-stone-500">项目 Run：{status.id}</span>}
          {status.hermesRunId && <span className="text-xs text-stone-500">Hermes Run：{status.hermesRunId}</span>}
        </div>
        {status.createdAt && (
          <div className="rounded-md border border-stone-200 bg-white px-3 py-1.5 font-mono text-sm text-stone-900">
            {formatElapsed(elapsedSeconds)}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 text-sm leading-6 text-stone-700">
        {isActive && <span className="mt-2 h-2 w-2 shrink-0 animate-pulse rounded-full bg-teal-700" />}
        <span>{currentStage(status)}</span>
      </div>

      <div className="grid gap-2 text-xs text-stone-500 sm:grid-cols-2 lg:grid-cols-4">
        <span>创建：{formatTime(status.createdAt)}</span>
        <span>完成：{formatTime(status.completedAt)}</span>
        <span>事件：{status.events?.length ?? 0} 条</span>
        <span>来源：当前项目实际调用记录</span>
      </div>

      {queuedTooLong && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          <p className="font-bold">队列等待时间超过 60 秒。</p>
          <p className="mt-1">这通常表示后端调研任务没有被继续推进，或 Hermes 调用端不可用。当前状态仍以项目 ResearchRun 记录为准。</p>
        </div>
      )}

      {(requestError || status.refreshError || status.eventsError) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-800">
          {requestError && <p>状态接口错误：{requestError}</p>}
          {status.refreshError && <p>状态刷新错误：{status.refreshError}</p>}
          {status.eventsError && <p>Hermes 事件读取错误：{status.eventsError}</p>}
        </div>
      )}

      {visibleEvents.length > 0 && (
        <details className="rounded-md border border-stone-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-semibold text-stone-900">最近 Hermes 事件</summary>
          <ul className="mt-2 grid gap-2 text-xs leading-5 text-stone-600">
            {visibleEvents.map((event) => (
              <li key={event.id} className="grid gap-1 sm:grid-cols-[96px_64px_1fr]">
                <span className="font-mono text-stone-400">{formatTime(event.at)}</span>
                <span className={event.level === "error" ? "font-semibold text-rose-700" : event.level === "warning" ? "font-semibold text-amber-700" : "font-semibold text-stone-500"}>
                  {event.level}
                </span>
                <span>{event.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
