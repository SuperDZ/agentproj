"use client";

import { useActionState } from "react";

type SaveActionState = {
  message: string;
  ok: boolean;
};

type SaveReportAction = (state: SaveActionState, formData: FormData) => Promise<SaveActionState>;

const initialState: SaveActionState = { message: "", ok: false };
const primaryButtonClass = "rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400";
const textareaClass = "rounded-lg border border-zinc-300 bg-white p-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function SaveMessage({ state }: { state: SaveActionState }) {
  if (!state.message) return null;
  return (
    <span className={state.ok ? "rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700" : "rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700"}>
      {state.message}
    </span>
  );
}

export function ProjectPlanningSaveForm({
  action,
  pmAdvice,
  problemAndUsers,
  coreFeatures,
  statusBadge
}: {
  action: SaveReportAction;
  pmAdvice: string;
  problemAndUsers: string;
  coreFeatures: string[];
  statusBadge?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-4 grid gap-4 lg:grid-cols-2">
      <label className="grid gap-2 lg:col-span-2">
        <span className="text-sm font-semibold text-zinc-950">项目规划建议</span>
        <textarea name="pmPlanningAdvice" rows={7} defaultValue={pmAdvice} className={textareaClass} />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-zinc-950">确认问题与用户</span>
        <textarea name="problemAndUsers" rows={8} defaultValue={problemAndUsers} className={textareaClass} />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-zinc-950">建议的 3-5 个核心功能</span>
        <textarea name="coreFeatures" rows={8} defaultValue={coreFeatures.join("\n")} className={textareaClass} />
      </label>
      <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "保存中..." : "保存项目规划建议"}
        </button>
        {statusBadge}
        <SaveMessage state={state} />
      </div>
    </form>
  );
}

export function ReportAssistantSaveForm({
  action,
  pmAdvice,
  problemAndUsers,
  coreFeatures,
  statusBadge
}: {
  action: SaveReportAction;
  pmAdvice: string;
  problemAndUsers: string;
  coreFeatures: string[];
  statusBadge: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-4 grid gap-4 lg:grid-cols-2">
      <input type="hidden" name="pmPlanningAdvice" value={pmAdvice} />
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-zinc-950">确认问题与用户</span>
        <textarea name="problemAndUsers" rows={9} defaultValue={problemAndUsers} className={textareaClass} />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-zinc-950">建议的 3-5 个核心功能</span>
        <textarea name="coreFeatures" rows={9} defaultValue={coreFeatures.join("\n")} className={textareaClass} />
      </label>
      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "保存中..." : "保存汇报展示助手"}
        </button>
        {statusBadge}
        <SaveMessage state={state} />
      </div>
    </form>
  );
}
