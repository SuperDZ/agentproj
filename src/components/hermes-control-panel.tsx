"use client";

import { Boxes, CircleHelp, ExternalLink, Plus, ShieldCheck, Star, Trash2, TriangleAlert, Wrench } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type { RecommendedSkillSource, SkillInventoryItem, SkillInventoryResponse, SkillSearchResult, SkillSafetyStatus } from "@/lib/skills/skill-types";

type HermesControlPanelProps = {
  locale?: string;
  recommended: RecommendedSkillSource[];
  policies: string[];
};

const emptyInventory: SkillInventoryResponse = {
  recommendedSkills: [],
  recommendedTools: [],
  installedSkills: [],
  installedTools: []
};

const inventoryPageSizes = [6, 12, 24] as const;

const safetyLabels: Record<SkillSafetyStatus | "all", string> = {
  all: "全部状态",
  passed: "已通过",
  unreviewed: "未复核",
  failed: "未通过"
};

type StatusPayload = {
  mode?: string;
  localRoot?: string;
  localPython?: string;
  provider?: string;
  model?: string;
  usageMode?: string;
  codexCliCommand?: string;
  dashboardPid?: number;
};

export function HermesControlPanel({ recommended, policies }: HermesControlPanelProps) {
  const [status, setStatus] = useState<StatusPayload>({});
  const [inventory, setInventory] = useState<SkillInventoryResponse>(emptyInventory);
  const [query, setQuery] = useState("agent skills");
  const [results, setResults] = useState<SkillSearchResult[]>([]);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(() => new Set(recommended.filter((item) => item.enabled).map((item) => item.name)));

  const selectedCount = selected.size;
  const recommendedSkills = inventory.recommendedSkills.length ? inventory.recommendedSkills : [];
  const recommendedTools = inventory.recommendedTools.length ? inventory.recommendedTools : [];

  async function loadInventory() {
    const response = await fetch("/api/hermes/skills/inventory", { cache: "no-store" });
    setInventory(await response.json());
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/hermes/control", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/hermes/skills/inventory", { cache: "no-store" }).then((response) => response.json())
    ]).then(([nextStatus, nextInventory]) => {
      if (!active) return;
      setStatus(nextStatus);
      setInventory(nextInventory);
    });
    return () => {
      active = false;
    };
  }, []);

  async function runControl(action: string) {
    setMessage("正在更新 Hermes 状态...");
    const response = await fetch("/api/hermes/control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action })
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "Hermes 状态更新失败。");
      return;
    }
    setStatus(payload);
    setMessage("Hermes 状态已更新。");
  }

  async function saveModelConfig(formData: FormData) {
    setMessage("正在保存模型配置...");
    const response = await fetch("/api/hermes/control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "configure-model",
        provider: formData.get("provider"),
        model: formData.get("model"),
        usageMode: formData.get("usageMode"),
        codexCliCommand: formData.get("codexCliCommand")
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "模型配置保存失败。");
      return;
    }
    setStatus(payload);
    if (payload.usageMode === "codex-cli") {
      setMessage("模型配置已保存，但 Codex CLI 模式暂未接入本地 Hermes 运行时；切换为 API 后才会影响后续运行。");
    } else {
      setMessage("模型配置已保存并生效，将用于后续本地 Hermes 运行。");
    }
  }

  async function search() {
    setMessage("正在搜索 GitHub Skills（技能）...");
    const response = await fetch(`/api/hermes/skills/search?q=${encodeURIComponent(query)}`);
    const payload = await response.json();
    setResults(payload.items || []);
    setMessage(response.ok ? `找到 ${(payload.items || []).length} 个结果。` : payload.error || "搜索失败。");
  }

  async function addWhitelist(item: Pick<SkillSearchResult, "name" | "url" | "cloneUrl" | "kind">) {
    setMessage("正在加入本地白名单...");
    const response = await fetch("/api/hermes/skills/whitelist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: item.name, url: item.url, cloneUrl: item.cloneUrl, kind: item.kind })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "加入白名单失败。");
      return;
    }
    await loadInventory();
    setMessage("已加入本地白名单。");
  }

  async function removeWhitelist(name: string) {
    setMessage("正在移出本地白名单...");
    const response = await fetch(`/api/hermes/skills/whitelist?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "移出白名单失败。");
      return;
    }
    await loadInventory();
    setMessage("已从本地白名单移除。");
  }

  async function importSkill(item: SkillSearchResult) {
    if (!item.cloneUrl) return;
    if (!item.whitelisted || item.safety.status !== "passed") {
      setMessage("请先人工复核并加入白名单。");
      return;
    }
    setMessage("正在导入到本地 Hermes Skills（技能）库...");
    const response = await fetch("/api/hermes/skills/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cloneUrl: item.cloneUrl, url: item.url, name: item.name, safetyStatus: item.safety.status })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "导入失败。");
      return;
    }
    await loadInventory();
    setMessage(`导入完成：${payload.path}`);
  }

  function toggle(name: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const policyText = useMemo(() => {
    return [
      "红色三角感叹号表示该 Skill（技能）或 Tool（工具）未进入本地白名单，或未通过安全检查。",
      "本地白名单只代表本机用户信任或官方内置检查通过，不代表全网安全认证。",
      "导入前必须检查真实来源、许可证、脚本内容、依赖和 Prompt Injection（提示注入）风险。",
      ...policies
    ].join("\n");
  }, [policies]);

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-950">Hermes、模型与 Skills/Tools 管理</h3>
            <p className="mt-1 text-xs text-zinc-500">当前选择 {selectedCount} 个推荐项。第三方来源导入前必须经过人工复核。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => runControl("start")} className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50">启动</button>
            <button type="button" onClick={() => runControl("restart")} className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50">重启</button>
            <button type="button" onClick={() => runControl("stop")} className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50">停止</button>
          </div>
        </div>

        <dl className="grid gap-3 text-xs text-zinc-600 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="模式" value={status.mode || "未配置"} />
          <Info label="根目录" value={status.localRoot || "未配置"} />
          <Info label="Python" value={status.localPython || "未配置"} />
          <Info label="Dashboard PID" value={status.dashboardPid ? String(status.dashboardPid) : "未运行"} />
        </dl>

        <form action={saveModelConfig} className="grid gap-3 rounded-lg bg-zinc-50 p-3 md:grid-cols-4">
          <input name="provider" defaultValue={status.provider || "deepseek"} className="rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="provider" />
          <input name="model" defaultValue={status.model || "deepseek-chat"} className="rounded-md border border-zinc-300 px-3 py-2 text-sm" placeholder="model" />
          <select name="usageMode" defaultValue={status.usageMode || "api"} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="api">API</option>
            <option value="codex-cli">Codex CLI</option>
          </select>
          <div className="flex gap-2">
            <input name="codexCliCommand" defaultValue={status.codexCliCommand || "codex"} className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            <button className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-semibold text-white">保存</button>
          </div>
        </form>
        {message && <p className="rounded-md border border-blue-100 bg-blue-50 p-2 text-xs text-blue-700">{message}</p>}
      </div>

      <InventorySection title="推荐 Skills（技能）" icon={<Boxes className="h-4 w-4" />} items={recommendedSkills} selected={selected} onToggle={toggle} onAddWhitelist={addWhitelist} onRemoveWhitelist={removeWhitelist} square />
      <InventorySection title="推荐 Tools（工具）" icon={<Wrench className="h-4 w-4" />} items={recommendedTools} selected={selected} onToggle={toggle} onAddWhitelist={addWhitelist} onRemoveWhitelist={removeWhitelist} />
      <InventorySection title="本地已有 Skills（技能）" icon={<Boxes className="h-4 w-4" />} items={inventory.installedSkills} selected={selected} onToggle={toggle} onAddWhitelist={addWhitelist} onRemoveWhitelist={removeWhitelist} />
      <InventorySection title="本地已有 Tools（工具）" icon={<Wrench className="h-4 w-4" />} items={inventory.installedTools} selected={selected} onToggle={toggle} onAddWhitelist={addWhitelist} onRemoveWhitelist={removeWhitelist} />

      <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-zinc-950">搜索开源 Skills（技能）</h3>
            <div className="group relative">
              <CircleHelp className="h-4 w-4 text-zinc-500" />
              <div className="pointer-events-none absolute left-0 top-6 z-20 hidden w-80 whitespace-pre-line rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-5 text-zinc-700 shadow-lg group-hover:block">
                {policyText}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 justify-end gap-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 max-w-md flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            <button type="button" onClick={search} className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white">搜索</button>
          </div>
        </div>

        <div className="grid gap-3">
          {results.map((item) => (
            <div key={item.name} className="grid gap-3 rounded-lg border border-zinc-200 p-3 md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {item.safety.status === "passed" ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <TriangleAlert className="h-4 w-4 text-red-600" />}
                  <h4 className="font-semibold text-zinc-950">{item.name}</h4>
                  <span className={item.safety.status === "passed" ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700" : item.safety.status === "failed" ? "rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700" : "rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700"}>
                    {item.safety.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><Star className="h-3.5 w-3.5" />{item.stars ?? 0}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{item.description || "该仓库未提供简介，导入前需要人工复核 README、许可证和脚本内容。"}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                  {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900">真实来源 <ExternalLink className="h-3 w-3" /></a>}
                  {item.updatedAt && <span>更新：{new Date(item.updatedAt).toLocaleDateString("zh-CN")}</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {item.whitelisted ? (
                  <button type="button" onClick={() => removeWhitelist(item.name)} className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"><Trash2 className="h-3.5 w-3.5" />移出白名单</button>
                ) : (
                  <button type="button" onClick={() => addWhitelist(item)} className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"><Plus className="h-3.5 w-3.5" />加入白名单</button>
                )}
                <button
                  type="button"
                  onClick={() => importSkill(item)}
                  disabled={!item.whitelisted || item.safety.status !== "passed"}
                  className="rounded-md bg-zinc-950 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {item.whitelisted && item.safety.status === "passed" ? "导入" : "先加入白名单"}
                </button>
              </div>
            </div>
          ))}
          {results.length === 0 && <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500">尚未搜索。请输入关键词后搜索开源 Skills（技能）。</p>}
        </div>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-zinc-50 p-3">
      <dt className="font-medium text-zinc-500">{label}</dt>
      <dd className="mt-1 truncate text-zinc-900" title={value}>{value}</dd>
    </div>
  );
}

function InventorySection({
  title,
  icon,
  items,
  selected,
  onToggle,
  onAddWhitelist,
  onRemoveWhitelist,
  square
}: {
  title: string;
  icon: React.ReactNode;
  items: SkillInventoryItem[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  onAddWhitelist: (item: Pick<SkillInventoryItem, "name" | "url" | "cloneUrl" | "kind">) => Promise<void>;
  onRemoveWhitelist: (name: string) => Promise<void>;
  square?: boolean;
}) {
  const [category, setCategory] = useState("all");
  const [safetyStatus, setSafetyStatus] = useState<SkillSafetyStatus | "all">("all");
  const [keyword, setKeyword] = useState("");
  const [pageSize, setPageSize] = useState<(typeof inventoryPageSizes)[number]>(6);
  const [page, setPage] = useState(1);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = item.category || item.source || "uncategorized";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return items.filter((item) => {
      const itemCategory = item.category || item.source || "uncategorized";
      const matchesCategory = category === "all" || itemCategory === category;
      const matchesSafety = safetyStatus === "all" || item.safety.status === safetyStatus;
      const searchableText = `${item.name} ${item.descriptionZh} ${item.path} ${itemCategory} ${item.source}`.toLowerCase();
      const matchesKeyword = !normalizedKeyword || searchableText.includes(normalizedKeyword);
      return matchesCategory && matchesSafety && matchesKeyword;
    });
  }, [category, items, keyword, safetyStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <details className="rounded-lg border border-zinc-200 bg-white p-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
            <p className="mt-1 text-xs text-zinc-500">共 {items.length} 项，当前显示 {filteredItems.length} 项</p>
          </div>
        </div>
        <span className="rounded-md border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-800">展开/收起</span>
      </summary>
      <div className="mt-3 grid gap-3">
        <div className="flex flex-wrap gap-2">
          <input
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
            className="w-48 rounded-md border border-zinc-300 px-3 py-2 text-xs"
            placeholder="按名称、路径或说明搜索"
          />
          <select
            value={safetyStatus}
            onChange={(event) => {
              setSafetyStatus(event.target.value as SkillSafetyStatus | "all");
              setPage(1);
            }}
            className="rounded-md border border-zinc-300 px-3 py-2 text-xs"
            aria-label={`${title} 安全状态`}
          >
            {Object.entries(safetyLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as (typeof inventoryPageSizes)[number]);
              setPage(1);
            }}
            className="rounded-md border border-zinc-300 px-3 py-2 text-xs"
            aria-label={`${title} 每页数量`}
          >
            {inventoryPageSizes.map((size) => (
              <option key={size} value={size}>每页 {size}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setCategory("all");
            setPage(1);
          }}
          className={category === "all" ? "rounded-full bg-zinc-950 px-3 py-1 text-xs font-semibold text-white" : "rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"}
        >
          全部 {items.length}
        </button>
        {categories.map(([name, count]) => (
          <button
            type="button"
            key={name}
            onClick={() => {
              setCategory(name);
              setPage(1);
            }}
            className={category === name ? "rounded-full bg-blue-700 px-3 py-1 text-xs font-semibold text-white" : "rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"}
          >
            {name} {count}
          </button>
        ))}
      </div>
      <div className={square ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4" : "grid gap-3 lg:grid-cols-2"}>
        {visibleItems.map((item) => (
          <div
            key={`${item.kind}:${item.name}:${item.path}`}
            className={square ? "grid aspect-square content-between rounded-lg border border-zinc-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50/40" : "grid gap-2 rounded-lg border border-zinc-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50/40"}
          >
            <div className="grid gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-zinc-950">{item.name}</span>
                {item.safety.status === "passed" ? <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" /> : <TriangleAlert className="h-4 w-4 shrink-0 text-red-600" />}
              </div>
              <p className="line-clamp-3 text-xs leading-5 text-zinc-600">{item.descriptionZh}</p>
            </div>
            <div className="grid gap-2 text-xs text-zinc-500">
              <div className="flex items-center justify-between gap-2">
                <span>{item.category || item.source}</span>
                <span className={selected.has(item.name) ? "rounded-full bg-blue-100 px-2 py-0.5 text-blue-700" : "rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600"}>
                  {selected.has(item.name) ? "已启用" : "未启用"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onToggle(item.name)}
                  className="inline-flex w-fit items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  {selected.has(item.name) ? "停用" : "启用"}
                </button>
                {item.whitelisted ? (
                  <button
                    type="button"
                    onClick={() => void onRemoveWhitelist(item.name)}
                    className="inline-flex w-fit items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    移出白名单
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void onAddWhitelist({ name: item.name, url: item.url || item.path, cloneUrl: item.cloneUrl, kind: item.kind })}
                    className="inline-flex w-fit items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    加入白名单
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500">暂无可展示条目。</p>}
        {items.length > 0 && visibleItems.length === 0 && <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500">暂无匹配条目。</p>}
      </div>
      {filteredItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
          <span>
            第 {safePage} / {totalPages} 页，显示第 {(safePage - 1) * pageSize + 1} - {Math.min(safePage * pageSize, filteredItems.length)} 项
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage <= 1}
              className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              上一页
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage >= totalPages}
              className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
