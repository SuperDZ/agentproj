"use client";

import Link from "next/link";
import { ExternalLink, Play, RefreshCw, Save, Square, Wrench } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import type { RecommendedSkillSource, SkillInventoryResponse } from "@/lib/skills/skill-types";
import { parseHermesResourceConfig } from "@/lib/skills/resource-config";
import { Badge, buttonStyles, fieldStyles } from "@/components/ui";
import { cn } from "@/lib/utils";
import { defaultModelForProvider, isModelProvider, modelProviderOptions } from "@/lib/model/providers";

type HermesControlPanelProps = {
  projectId?: string;
  recommended: RecommendedSkillSource[];
  policies: string[];
};

type StatusPayload = {
  mode?: string;
  localRoot?: string;
  localPython?: string;
  pythonExists?: boolean;
  pythonDiagnostics?: string;
  provider?: string;
  model?: string;
  dashboardPid?: number;
  dashboardPids?: number[];
  dashboardPidSource?: "pid-file" | "process-scan" | "none";
};

export function HermesControlPanel({ projectId, policies }: HermesControlPanelProps) {
  const [status, setStatus] = useState<StatusPayload>({});
  const [enabledResourceCount, setEnabledResourceCount] = useState({ skills: 0, tools: 0 });
  const [resourceMode, setResourceMode] = useState<"manual" | "auto">("manual");
  const [message, setMessage] = useState("");
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [actionPending, setActionPending] = useState<"start" | "restart" | "stop" | null>(null);
  const [modelForm, setModelForm] = useState({
    provider: "deepseek",
    model: "deepseek-chat"
  });

  const isRunning = Boolean(status.dashboardPid);
  const dashboardPids = status.dashboardPids?.length ? status.dashboardPids : status.dashboardPid ? [status.dashboardPid] : [];
  const pidSourceLabel = status.dashboardPidSource === "pid-file" ? "应用启动" : status.dashboardPidSource === "process-scan" ? "系统进程" : "未检测到";
  const detailHref = projectId ? `/hermes?projectId=${encodeURIComponent(projectId)}` : "/hermes";

  function applyStatus(nextStatus: StatusPayload) {
    const provider = isModelProvider(nextStatus.provider) ? nextStatus.provider : "deepseek";
    setStatus(nextStatus);
    setModelForm({
      provider,
      model: nextStatus.model || defaultModelForProvider(provider)
    });
    setStatusLoaded(true);
  }

  useEffect(() => {
    let active = true;

    void fetch("/api/hermes/control", { cache: "no-store" })
      .then((response) => response.json())
      .then((nextStatus) => {
        if (!active) return;
        applyStatus(nextStatus);
      })
      .catch(() => {
        if (active) setMessage("Hermes 状态加载失败，模型配置暂不可保存。");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    const endpoint = `/api/hermes/skills/inventory${params.size ? `?${params.toString()}` : ""}`;

    async function loadEnabledCounts() {
      const [inventoryResponse, configResponse] = await Promise.all([
        fetch(endpoint, { cache: "no-store" }),
        projectId ? fetch(`/api/projects/${encodeURIComponent(projectId)}/hermes-resources`, { cache: "no-store" }) : Promise.resolve(null)
      ]);
      const inventory = await inventoryResponse.json() as SkillInventoryResponse;
      const config = configResponse ? parseHermesResourceConfig(JSON.stringify(await configResponse.json())) : parseHermesResourceConfig();
      setResourceMode(config.mode);
      return {
        skills: config.mode === "manual" ? (inventory.installedSkills ?? []).filter((item) => config.enabled.some((enabled) => itemKey(enabled) === itemKey(item))).length : 0,
        tools: config.mode === "manual" ? (inventory.installedTools ?? []).filter((item) => config.enabled.some((enabled) => itemKey(enabled) === itemKey(item))).length : 0
      };
    }

    void loadEnabledCounts()
      .then((counts) => {
        if (!active) return;
        setEnabledResourceCount(counts);
      })
      .catch(() => {
        if (active) setEnabledResourceCount({ skills: 0, tools: 0 });
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  async function runControl(action: "start" | "restart" | "stop") {
    if ((action === "start" && isRunning) || ((action === "restart" || action === "stop") && !isRunning)) return;

    setActionPending(action);
    setMessage("正在更新 Hermes 状态...");
    try {
      const response = await fetch("/api/hermes/control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload.error ? `Hermes 状态更新失败：${payload.error}` : "Hermes 状态更新失败。");
        return;
      }
      applyStatus(payload);
      setMessage("Hermes 状态已更新。");
    } finally {
      setActionPending(null);
    }
  }

  async function saveModelConfig(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("正在保存模型配置...");
    const response = await fetch("/api/hermes/control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "configure-model", ...modelForm })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "模型配置保存失败。");
      return;
    }
    setStatus((current) => ({ ...current, ...payload }));
    const provider = isModelProvider(payload.provider) ? payload.provider : modelForm.provider;
    setModelForm({
      provider,
      model: payload.model || modelForm.model
    });
    setMessage("模型配置已保存并生效。");
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white/85 p-5 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-teal-700" />
            <h3 className="text-base font-bold text-stone-950">Hermes 快速配置</h3>
            <Badge tone={isRunning ? "green" : "slate"}>{isRunning ? "已启动" : "未启动"}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            这里只保留项目内常用配置。Skill、Tool、白名单、导入和自定义能力请进入详细配置。
          </p>
        </div>
        <Link href={detailHref} className={buttonStyles.secondary}>
          <ExternalLink className="h-4 w-4" />
          详细配置
        </Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="运行状态" value={isRunning ? `运行中 PID ${status.dashboardPid}` : "未运行"} />
        <Metric label="模式" value={status.mode || "未配置"} />
        <Metric label="模型" value={status.model || modelForm.model} />
        <Metric label="已启用 Skills" value={resourceMode === "auto" ? "由 Hermes 自主决定" : String(enabledResourceCount.skills)} />
        <Metric label="已启用 Tools" value={resourceMode === "auto" ? "由 Hermes 自主决定" : String(enabledResourceCount.tools)} />
      </div>

      <p className="mt-3 text-xs leading-5 text-stone-500">
        运行检测：{pidSourceLabel}{dashboardPids.length ? `，PID ${dashboardPids.join(", ")}` : ""}
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
        <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-4">
          <p className="text-sm font-bold text-stone-950">基础运行控制</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              icon={<Play className="h-4 w-4" />}
              label={actionPending === "start" ? "启动中..." : "启动"}
              disabled={!statusLoaded || isRunning || actionPending !== null}
              onClick={() => runControl("start")}
            />
            <ActionButton
              icon={<RefreshCw className="h-4 w-4" />}
              label={actionPending === "restart" ? "重启中..." : "重启"}
              disabled={!statusLoaded || !isRunning || actionPending !== null}
              onClick={() => runControl("restart")}
            />
            <ActionButton
              icon={<Square className="h-4 w-4" />}
              label={actionPending === "stop" ? "停止中..." : "停止"}
              disabled={!statusLoaded || !isRunning || actionPending !== null}
              onClick={() => runControl("stop")}
            />
          </div>
          <dl className="mt-4 grid gap-2 text-xs text-stone-600">
            <Info label="根目录" value={status.localRoot || "未配置"} />
            <Info label="Python" value={status.localPython || "未配置"} />
            <Info label="Python 状态" value={status.pythonExists === undefined ? "未知" : status.pythonExists ? "可用" : "未找到"} />
          </dl>
        </div>

        <form onSubmit={saveModelConfig} className="rounded-lg border border-stone-200 bg-stone-50/80 p-4">
          <p className="text-sm font-bold text-stone-950">模型与调用配置</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ProviderSelect
              value={modelForm.provider}
              disabled={!statusLoaded}
              onChange={(provider) => setModelForm((current) => ({
                provider,
                model: current.model === defaultModelForProvider(current.provider) ? defaultModelForProvider(provider) : current.model
              }))}
            />
            <TextInput label="Model" value={modelForm.model} disabled={!statusLoaded} onChange={(value) => setModelForm((current) => ({ ...current, model: value }))} />
          </div>
          <button disabled={!statusLoaded} className={`${buttonStyles.primary} mt-4`}>
            <Save className="h-4 w-4" />
            保存配置
          </button>
        </form>
      </div>

      {status.pythonExists === false && status.pythonDiagnostics ? <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">{status.pythonDiagnostics}</p> : null}
      {policies.length > 0 ? <p className="mt-4 text-xs leading-5 text-stone-500">安全策略：{policies.join("；")}</p> : null}
      {message ? <p className="mt-4 rounded-md border border-teal-100 bg-teal-50 p-3 text-xs text-teal-800">{message}</p> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white/80 px-4 py-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-stone-950" title={value}>{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-white/80 p-3">
      <dt className="font-semibold text-stone-500">{label}</dt>
      <dd className="mt-1 truncate text-stone-900" title={value}>{value}</dd>
    </div>
  );
}

function TextInput({ label, value, disabled, onChange }: { label: string; value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-stone-500">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className={`${fieldStyles} h-10`} disabled={disabled} />
    </label>
  );
}

function ProviderSelect({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-stone-500">
      Provider
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`${fieldStyles} h-10`} disabled={disabled}>
        {modelProviderOptions.map((provider) => (
          <option key={provider.value} value={provider.value}>{provider.label}</option>
        ))}
      </select>
    </label>
  );
}

function ActionButton({ icon, label, disabled, onClick }: { icon: React.ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(buttonStyles.secondary, "disabled:cursor-not-allowed disabled:opacity-45")}>
      {icon}
      {label}
    </button>
  );
}

function itemKey(item: { kind: string; name: string; path: string }) {
  return `${item.kind}:${item.name}:${item.path}`;
}
