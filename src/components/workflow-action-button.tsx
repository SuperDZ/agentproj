"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type WorkflowActionButtonProps = {
  label: string;
  endpoint: string;
  stages: string[];
  className: string;
  pollEndpoint?: string;
  disabled?: boolean;
  disabledReason?: string;
  background?: boolean;
  body?: unknown;
  iconOnly?: boolean;
};

type ActionState = {
  phase: "idle" | "running" | "success" | "error";
  stage: string;
  error?: string;
};

const fallbackText = {
  start: "开始执行",
  running: "执行中...",
  failed: "执行失败",
  failedDetail: "操作失败。",
  completed: "已完成",
  submitted: "已提交后台运行"
};

export function WorkflowActionButton({ label, endpoint, stages, className, pollEndpoint, disabled, disabledReason, background, body, iconOnly }: WorkflowActionButtonProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({ phase: "idle", stage: "" });

  async function pollUntilComplete() {
    if (!pollEndpoint) return;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await fetch(pollEndpoint, { cache: "no-store" });
      const payload = await response.json();

      if (payload.status === "failed" || payload.status === "completed_without_output") {
        throw new Error(payload.refreshError || payload.eventsError || "任务执行失败。");
      }

      if ((payload.status === "completed" && payload.hasParsedOutput) || payload.status === "completed_with_fallback") return;

      setState({ phase: "running", stage: `等待结果同步 ${attempt + 1}/12` });
      await new Promise((resolve) => window.setTimeout(resolve, 1800));
    }
  }

  async function run() {
    setState({ phase: "running", stage: stages[0] ?? fallbackText.start });

    let timer: number | undefined;
    try {
      timer = window.setInterval(() => {
        setState((current) => {
          if (current.phase !== "running") return current;
          const index = Math.max(0, stages.indexOf(current.stage));
          return { phase: "running", stage: stages[Math.min(index + 1, stages.length - 1)] ?? current.stage };
        });
      }, 2400);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || fallbackText.failedDetail);

      if (background) {
        setState({ phase: "success", stage: fallbackText.submitted });
        startTransition(() => router.refresh());
        return;
      }

      await pollUntilComplete();
      setState({ phase: "success", stage: fallbackText.completed });
      startTransition(() => router.refresh());
    } catch (error) {
      setState({
        phase: "error",
        stage: fallbackText.failed,
        error: error instanceof Error ? error.message : fallbackText.failedDetail
      });
      startTransition(() => router.refresh());
    } finally {
      if (timer) window.clearInterval(timer);
    }
  }

  if (iconOnly) {
    const isRunning = state.phase === "running";
    return (
      <span className="group relative inline-flex">
        <button
          type="button"
          onClick={run}
          disabled={disabled || isRunning}
          aria-label={label}
          title={label}
          className={className}
        >
          <RotateCcw className={isRunning ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </button>
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-stone-200 bg-stone-950 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
          {label}
        </span>
      </span>
    );
  }

  return (
    <div className="grid gap-2">
      <button type="button" onClick={run} disabled={disabled || state.phase === "running"} className={className}>
        {state.phase === "running" ? fallbackText.running : label}
      </button>
      {disabled && disabledReason && state.phase === "idle" && <p className="text-xs leading-5 text-stone-500">{disabledReason}</p>}
      {state.phase !== "idle" && (
        <div className={state.phase === "error" ? "rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700" : "rounded-md border border-teal-200 bg-teal-50 p-2 text-xs text-teal-800"}>
          <div className="flex items-center gap-2">
            {state.phase === "running" && <span className="h-2 w-2 animate-pulse rounded-full bg-teal-700" />}
            <span>{state.stage}</span>
          </div>
          {state.error && <p className="mt-1 break-words">{state.error}</p>}
        </div>
      )}
    </div>
  );
}
