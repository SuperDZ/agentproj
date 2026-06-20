"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

const defaultTasks = [
  { id: "competitor-launch", label: "竞品新功能发布", recommended: true },
  { id: "pricing-change", label: "价格和套餐变化", recommended: true },
  { id: "positioning-drift", label: "定位和卖点变化", recommended: true },
  { id: "regulatory-risk", label: "监管与合规信号", recommended: true },
  { id: "open-source-risk", label: "开源活跃度变化", recommended: false },
  { id: "user-feedback", label: "公开用户反馈趋势", recommended: false }
];

const cadenceOptions = [
  { value: "daily", label: "每日" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" }
];

type TaskConfig = { task: string; startAt: string; cadence: string };

type MonitorJobConfiguratorProps = {
  endpoint: string;
  initialTasks: string[];
  initialCadence: string;
  initialTaskConfigs?: TaskConfig[];
};

export function MonitorJobConfigurator({ endpoint, initialTasks, initialCadence, initialTaskConfigs = [] }: MonitorJobConfiguratorProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const [selected, setSelected] = useState<string[]>(() => {
    const matchedIds = defaultTasks.filter((task) => initialTasks.includes(task.label)).map((task) => task.id);
    return matchedIds.length > 0 ? matchedIds : defaultTasks.filter((task) => task.recommended).map((task) => task.id);
  });
  const [customTasks, setCustomTasks] = useState(() => initialTasks.filter((task) => !defaultTasks.some((item) => item.label === task)));
  const [customInput, setCustomInput] = useState("");
  const [taskConfigs, setTaskConfigs] = useState<Record<string, { startAt: string; cadence: string }>>(() => {
    const configs: Record<string, { startAt: string; cadence: string }> = {};
    for (const config of initialTaskConfigs) configs[config.task] = { startAt: config.startAt || today, cadence: config.cadence || initialCadence || "weekly" };
    return configs;
  });
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const selectedTaskLabels = useMemo(
    () => [...defaultTasks.filter((task) => selected.includes(task.id)).map((task) => task.label), ...customTasks],
    [customTasks, selected]
  );

  const selectedTaskConfigs = useMemo(
    () => selectedTaskLabels.map((task) => ({ task, startAt: taskConfigs[task]?.startAt || today, cadence: taskConfigs[task]?.cadence || initialCadence || "weekly" })),
    [initialCadence, selectedTaskLabels, taskConfigs, today]
  );

  function toggleTask(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function addCustomTask() {
    const value = customInput.trim();
    if (!value || customTasks.includes(value)) return;
    setCustomTasks((current) => [...current, value]);
    setCustomInput("");
  }

  function updateConfig(task: string, patch: Partial<{ startAt: string; cadence: string }>) {
    setTaskConfigs((current) => ({
      ...current,
      [task]: { startAt: current[task]?.startAt || today, cadence: current[task]?.cadence || initialCadence || "weekly", ...patch }
    }));
  }

  async function createJob() {
    setStatus("running");
    setMessage("正在创建监控任务...");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskConfigs: selectedTaskConfigs })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || "创建失败");
      setStatus("success");
      setMessage("监控任务已创建。");
      startTransition(() => router.refresh());
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "创建失败");
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="grid gap-4 rounded-md border border-zinc-200 bg-white p-4">
      <div className="grid gap-2">
        {defaultTasks.map((task) => (
          <TaskRow
            key={task.id}
            label={task.label}
            recommended={task.recommended}
            selected={selected.includes(task.id)}
            startAt={taskConfigs[task.label]?.startAt || today}
            cadence={taskConfigs[task.label]?.cadence || initialCadence || "weekly"}
            onToggle={() => toggleTask(task.id)}
            onConfigChange={(patch) => updateConfig(task.label, patch)}
          />
        ))}
        {customTasks.map((task) => (
          <TaskRow
            key={task}
            label={task}
            selected
            startAt={taskConfigs[task]?.startAt || today}
            cadence={taskConfigs[task]?.cadence || initialCadence || "weekly"}
            onToggle={() => setCustomTasks((current) => current.filter((item) => item !== task))}
            onConfigChange={(patch) => updateConfig(task, patch)}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <input value={customInput} onChange={(event) => setCustomInput(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="添加自定义监控任务" />
        <button type="button" onClick={addCustomTask} className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"><Plus className="h-4 w-4" />添加</button>
      </div>
      <button type="button" onClick={createJob} disabled={status === "running" || selectedTaskConfigs.length === 0} className="justify-self-start rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100">
        {status === "running" ? "创建中..." : "创建监控任务"}
      </button>
      {status !== "idle" && <p className={status === "error" ? "text-sm text-rose-700" : "text-sm text-blue-700"}>{message}</p>}
    </div>
  );
}

function TaskRow({ label, recommended, selected, startAt, cadence, onToggle, onConfigChange }: {
  label: string;
  recommended?: boolean;
  selected: boolean;
  startAt: string;
  cadence: string;
  onToggle: () => void;
  onConfigChange: (patch: Partial<{ startAt: string; cadence: string }>) => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-[1fr_180px_160px]">
      <label className="flex items-center gap-3 text-sm text-zinc-800">
        <input type="checkbox" checked={selected} onChange={onToggle} />
        <span>{label}</span>
        {recommended && <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">推荐</span>}
      </label>
      <input type="date" value={startAt} disabled={!selected} onChange={(event) => onConfigChange({ startAt: event.target.value })} className="rounded-lg border border-zinc-300 bg-white p-2 text-sm outline-none focus:border-blue-500 disabled:bg-zinc-100" aria-label={`${label} 起始时间`} />
      <select value={cadence} disabled={!selected} onChange={(event) => onConfigChange({ cadence: event.target.value })} className="rounded-lg border border-zinc-300 bg-white p-2 text-sm outline-none focus:border-blue-500 disabled:bg-zinc-100" aria-label={`${label} 频率`}>
        {cadenceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}
