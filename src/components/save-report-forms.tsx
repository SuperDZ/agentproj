"use client";

import { useActionState } from "react";
import { buttonStyles, fieldStyles } from "@/components/ui";

type SaveActionState = {
  message: string;
  ok: boolean;
};

type SaveReportAction = (state: SaveActionState, formData: FormData) => Promise<SaveActionState>;

const initialState: SaveActionState = { message: "", ok: false };

function SaveMessage({ state }: { state: SaveActionState }) {
  if (!state.message) return null;
  return (
    <span className={state.ok ? "rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700" : "rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"}>
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
        <span className="text-sm font-bold text-stone-950">项目规划建议</span>
        <textarea name="pmPlanningAdvice" rows={7} defaultValue={pmAdvice} className={`${fieldStyles} p-3 leading-6`} />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-bold text-stone-950">确认问题与用户</span>
        <textarea name="problemAndUsers" rows={8} defaultValue={problemAndUsers} className={`${fieldStyles} p-3 leading-6`} />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-bold text-stone-950">建议的 3-5 个核心功能</span>
        <textarea name="coreFeatures" rows={8} defaultValue={coreFeatures.join("\n")} className={`${fieldStyles} p-3 leading-6`} />
      </label>
      <div className="flex flex-wrap items-center gap-2 lg:col-span-2">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
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
        <span className="text-sm font-bold text-stone-950">确认问题与用户</span>
        <textarea name="problemAndUsers" rows={9} defaultValue={problemAndUsers} className={`${fieldStyles} p-3 leading-6`} />
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-bold text-stone-950">建议的 3-5 个核心功能</span>
        <textarea name="coreFeatures" rows={9} defaultValue={coreFeatures.join("\n")} className={`${fieldStyles} p-3 leading-6`} />
      </label>
      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {pending ? "保存中..." : "保存汇报展示助手"}
        </button>
        {statusBadge}
        <SaveMessage state={state} />
      </div>
    </form>
  );
}
