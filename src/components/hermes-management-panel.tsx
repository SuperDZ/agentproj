"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Filter,
  ListChecks,
  Move,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  ThumbsUp,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TriangleAlert,
  Wrench,
  X
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SkillInventoryItem, SkillInventoryResponse, SkillKind, SkillSearchResult, SkillSafetyStatus } from "@/lib/skills/skill-types";
import { parseHermesResourceConfig, serializeResourceItem, type HermesResourceConfigItem, type HermesResourceMode } from "@/lib/skills/resource-config";
import { Badge, buttonStyles, fieldStyles } from "@/components/ui";
import { cn } from "@/lib/utils";

const emptyInventory: SkillInventoryResponse = {
  recommendedSkills: [],
  recommendedTools: [],
  installedSkills: [],
  installedTools: []
};

const skillTemplate = `---
name: skill-name
description: 用一句话说明这个 Skill 何时应该被调用。
---

# Skill Name

## Purpose
说明这个 Skill 解决的问题、适用任务和不适用任务。

## When To Use
- 用户请求涉及某个明确领域。
- 需要读取、生成或审查该领域的专门材料。
- 需要遵守固定流程、约束或输出格式。

## Workflow
1. 确认输入、目标和边界。
2. 读取必要文件、上下文或配置。
3. 执行核心分析、生成或修改。
4. 输出可验证的结果、风险和后续动作。

## Constraints
- 不编造外部事实。
- 高风险信息必须说明不确定性。
- 修改文件前先判断影响范围。

## Output Format
使用清晰小标题、短段落和可执行结论。`;

const localEnabledKey = "specflow:hermes:enabled-items";
const pageSize = 24;

type RecommendedIndex = Map<string, SkillInventoryItem>;
type ResourceFilter = "all" | "skills" | "tools" | "recommended" | "unreviewed" | "enabled";

type ResourceItem = SkillInventoryItem & {
  recommended?: SkillInventoryItem;
  recommendationScore: number;
  isEnabled: boolean;
};

type HeaderActionProps = {
  onSync?: () => void;
  onBatchReview?: () => void;
  onCreateSkill?: () => void;
  loading?: boolean;
};

export function HermesHeaderActions({ onSync, onBatchReview, onCreateSkill, loading }: HeaderActionProps) {
  function runAction(action: "sync" | "review" | "create", handler?: () => void) {
    if (handler) {
      handler();
      return;
    }
    window.dispatchEvent(new CustomEvent(`hermes:${action}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
      <button type="button" onClick={() => runAction("sync", onSync)} className={buttonStyles.secondary} disabled={loading}>
        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        同步本地资源
      </button>
      <button type="button" onClick={() => runAction("review", onBatchReview)} className={buttonStyles.secondary}>
        <ListChecks className="h-4 w-4" />
        批量审核
      </button>
      <button type="button" onClick={() => runAction("create", onCreateSkill)} className={buttonStyles.primary}>
        <Plus className="h-4 w-4" />
        创建 Skill
      </button>
    </div>
  );
}

export function HermesManagementPanel({ projectId }: { projectId?: string }) {
  const [inventory, setInventory] = useState<SkillInventoryResponse>(emptyInventory);
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("agent skills");
  const [searchResults, setSearchResults] = useState<SkillSearchResult[]>([]);
  const [customName, setCustomName] = useState("");
  const [customBody, setCustomBody] = useState(skillTemplate);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resourceMode, setResourceMode] = useState<HermesResourceMode>("manual");
  const [activeFilter, setActiveFilter] = useState<ResourceFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [auditStatus, setAuditStatus] = useState<SkillSafetyStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detailPosition, setDetailPosition] = useState({ x: 24, y: 132 });
  const customSkillRef = useRef<HTMLInputElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const detailDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  const localItems = useMemo(() => [...inventory.installedSkills, ...inventory.installedTools], [inventory]);
  const recommendedItems = useMemo(() => [...inventory.recommendedSkills, ...inventory.recommendedTools], [inventory]);
  const recommendedIndex = useMemo(() => buildRecommendedIndex(recommendedItems), [recommendedItems]);
  const passedCount = localItems.filter((item) => item.safety.status === "passed").length;
  const recommendedLocalCount = localItems.filter((item) => recommendedIndex.has(normalizeName(item.name))).length;
  const unreviewedCount = localItems.filter((item) => item.safety.status === "unreviewed").length;
  const failedCount = localItems.filter((item) => item.safety.status === "failed").length;

  const resources = useMemo<ResourceItem[]>(() => {
    return localItems.map((item) => {
      const recommended = recommendedIndex.get(normalizeName(item.name));
      return {
        ...item,
        recommended,
        recommendationScore: recommendationCount(recommended),
        isEnabled: enabled.has(itemKey(item))
      };
    });
  }, [enabled, localItems, recommendedIndex]);

  const selectedResource = useMemo(() => {
    if (!selectedKey) return undefined;
    return resources.find((item) => itemKey(item) === selectedKey);
  }, [resources, selectedKey]);

  const filteredResources = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return resources
      .filter((item) => {
        const text = `${item.name} ${item.descriptionZh} ${item.path} ${item.category || ""} ${item.source} ${item.recommended?.purpose?.join(" ") || ""}`.toLowerCase();
        const matchesKeyword = !normalized || text.includes(normalized);
        const matchesAudit = auditStatus === "all" || item.safety.status === auditStatus;
        const matchesFilter =
          activeFilter === "all" ||
          (activeFilter === "skills" && item.kind === "skill") ||
          (activeFilter === "tools" && item.kind === "tool") ||
          (activeFilter === "recommended" && Boolean(item.recommended)) ||
          (activeFilter === "unreviewed" && item.safety.status === "unreviewed") ||
          (activeFilter === "enabled" && item.isEnabled);
        return matchesKeyword && matchesAudit && matchesFilter;
      })
      .sort((left, right) => {
        if (left.recommendationScore !== right.recommendationScore) return right.recommendationScore - left.recommendationScore;
        if (left.safety.status !== right.safety.status) return safetyRank(left.safety.status) - safetyRank(right.safety.status);
        return left.name.localeCompare(right.name);
      });
  }, [activeFilter, auditStatus, keyword, resources]);

  const totalPages = Math.max(1, Math.ceil(filteredResources.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedResources = filteredResources.slice((safePage - 1) * pageSize, safePage * pageSize);

  const enabledConfigItems = useMemo(() => {
    const index = new Map(resources.map((item) => [itemKey(item), item]));
    return [...enabled].map((key) => index.get(key)).filter((item): item is ResourceItem => Boolean(item)).map(serializeResourceItem);
  }, [enabled, resources]);

  const loadInventory = useCallback(async (sync = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (sync) params.set("sync", "1");
      const endpoint = `/api/hermes/skills/inventory${params.size ? `?${params.toString()}` : ""}`;
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as SkillInventoryResponse;
      setInventory(payload);
      const total = payload.installedSkills.length + payload.installedTools.length;
      if (total === 0 && !sync) {
        setMessage("未发现本地资源缓存。请点击“同步本地资源”扫描并写入缓存。");
      } else {
        setMessage(sync ? "本地资源已同步到缓存。" : "");
      }
    } catch (error) {
      setMessage(`${sync ? "同步" : "读取缓存"}失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const storageTimer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(localEnabledKey);
      if (!saved) return;
      try {
        setEnabled(new Set(JSON.parse(saved) as string[]));
      } catch {
        setEnabled(new Set());
      }
    }, 0);
    const inventoryTimer = window.setTimeout(() => {
      void loadInventory();
    }, 0);
    return () => {
      window.clearTimeout(storageTimer);
      window.clearTimeout(inventoryTimer);
    };
  }, [loadInventory]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/hermes-resources`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        const config = parseHermesResourceConfig(JSON.stringify(payload));
        setResourceMode(config.mode);
        setEnabled(new Set(config.enabled.map(itemKey)));
      })
      .catch(() => {
        if (active) setMessage("项目 Hermes 资源配置加载失败。");
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  function resetPage(next: () => void) {
    next();
    setPage(1);
  }

  async function saveProjectResourceConfig(mode: HermesResourceMode, items: HermesResourceConfigItem[]) {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/hermes-resources`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, enabled: items })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || payload.message || "保存 Hermes 资源配置失败。");
    }
  }

  function persistEnabled(next: Set<string>) {
    setEnabled(next);
    window.localStorage.setItem(localEnabledKey, JSON.stringify([...next]));
    if (projectId) {
      const index = new Map(resources.map((item) => [itemKey(item), item]));
      const items = [...next].map((key) => index.get(key)).filter((item): item is ResourceItem => Boolean(item)).map(serializeResourceItem);
      void saveProjectResourceConfig(resourceMode, items).catch((error) => setMessage(error instanceof Error ? error.message : "保存 Hermes 资源配置失败。"));
    }
  }

  function toggleEnabled(item: Pick<SkillInventoryItem, "kind" | "name" | "path">) {
    const key = itemKey(item);
    const next = new Set(enabled);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persistEnabled(next);
  }

  function switchResourceMode(mode: HermesResourceMode) {
    setResourceMode(mode);
    if (projectId) {
      void saveProjectResourceConfig(mode, enabledConfigItems).then(() => {
        setMessage(mode === "auto" ? "已切换为让 Hermes 自主决定 Skill / Tool。" : "已切换为使用详细配置。");
      }).catch((error) => setMessage(error instanceof Error ? error.message : "保存 Hermes 资源配置失败。"));
    } else {
      setMessage(mode === "auto" ? "当前无项目上下文，仅在本页标记为 Hermes 自主决定。" : "当前无项目上下文，仅在本页标记为使用详细配置。");
    }
  }

  const focusCreateSkill = useCallback(() => {
    customSkillRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => customSkillRef.current?.focus(), 250);
  }, []);

  const focusBatchReview = useCallback(() => {
    setActiveFilter("unreviewed");
    setAuditStatus("unreviewed");
    setPage(1);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const beginDetailDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    detailDragRef.current = {
      offsetX: event.clientX - detailPosition.x,
      offsetY: event.clientY - detailPosition.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [detailPosition]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const drag = detailDragRef.current;
      if (!drag) return;
      const width = Math.min(380, Math.max(320, window.innerWidth - 32));
      const height = 560;
      const maxX = Math.max(12, window.innerWidth - width - 12);
      const maxY = Math.max(12, window.innerHeight - 96);
      setDetailPosition({
        x: Math.min(Math.max(12, event.clientX - drag.offsetX), maxX),
        y: Math.min(Math.max(72, event.clientY - drag.offsetY), Math.max(72, maxY - Math.min(height, window.innerHeight - 96)))
      });
    }

    function onPointerUp() {
      detailDragRef.current = null;
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  useEffect(() => {
    const sync = () => void loadInventory(true);
    const review = () => focusBatchReview();
    const create = () => focusCreateSkill();
    window.addEventListener("hermes:sync", sync);
    window.addEventListener("hermes:review", review);
    window.addEventListener("hermes:create", create);
    return () => {
      window.removeEventListener("hermes:sync", sync);
      window.removeEventListener("hermes:review", review);
      window.removeEventListener("hermes:create", create);
    };
  }, [focusBatchReview, focusCreateSkill, loadInventory]);

  async function addWhitelist(item: Pick<SkillInventoryItem | SkillSearchResult, "name" | "url" | "cloneUrl" | "kind">) {
    setMessage("正在加入白名单...");
    const response = await fetch("/api/hermes/skills/whitelist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: item.name, url: item.url, cloneUrl: item.cloneUrl, kind: item.kind })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(payload.error || "加入白名单失败。");
      return;
    }
    await loadInventory(true);
    setMessage("已加入白名单。");
  }

  async function removeWhitelist(name: string) {
    setMessage("正在移出白名单...");
    const response = await fetch(`/api/hermes/skills/whitelist?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setMessage(payload.error || "移出白名单失败。");
      return;
    }
    await loadInventory(true);
    setMessage("已移出白名单。");
  }

  async function searchSkills() {
    setMessage("正在搜索 GitHub Skill...");
    const response = await fetch(`/api/hermes/skills/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    setSearchResults(payload.items || []);
    setMessage(response.ok ? `找到 ${(payload.items || []).length} 个结果。` : payload.error || "搜索失败。");
  }

  async function importSkill(item: SkillSearchResult) {
    setMessage("正在导入 Skill...");
    const response = await fetch("/api/hermes/skills/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: item.name, url: item.url, cloneUrl: item.cloneUrl, safetyStatus: item.safety.status })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "导入失败。");
      return;
    }
    await loadInventory(true);
    setMessage(`导入完成：${payload.identifier || payload.path || item.name}`);
  }

  async function createCustomSkill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("正在创建自定义 Skill...");
    const response = await fetch("/api/hermes/skills/custom", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: customName, body: customBody })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "创建失败。");
      return;
    }
    setCustomName("");
    setCustomBody(skillTemplate);
    await loadInventory(true);
    setMessage(`自定义 Skill 已创建：${payload.path}`);
  }

  const tabs = [
    { id: "all", label: "全部", value: resources.length },
    { id: "skills", label: "Skills", value: resources.filter((item) => item.kind === "skill").length },
    { id: "tools", label: "Tools", value: resources.filter((item) => item.kind === "tool").length },
    { id: "recommended", label: "推荐", value: recommendedLocalCount },
    { id: "unreviewed", label: "待审核", value: unreviewedCount },
    { id: "enabled", label: "已启用", value: enabled.size }
  ] satisfies Array<{ id: ResourceFilter; label: string; value: number }>;

  return (
    <section className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="全部资源" value={resources.length} helper={`${inventory.installedSkills.length} Skills / ${inventory.installedTools.length} Tools`} />
        <Metric label="待审核" value={unreviewedCount} helper="需要先复核来源和脚本" tone={unreviewedCount > 0 ? "warning" : "neutral"} />
        <Metric label="推荐命中" value={recommendedLocalCount} helper={`${recommendedItems.length} 条推荐源`} />
        <Metric label="已启用" value={enabled.size} helper={enabled.size === 0 ? "当前没有可执行资源标记" : "仅保存为本地启用标记"} tone={enabled.size === 0 ? "risk" : "neutral"} />
      </div>

      {message ? <p className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm text-teal-800">{message}</p> : null}

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px] 2xl:items-start">
        <div ref={tableRef} className="min-w-0 rounded-lg border border-stone-200 bg-white/90 shadow-sm">
          <div className="border-b border-stone-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-stone-950">统一资源管理表</h2>
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  共 {resources.length} 项，匹配 {filteredResources.length} 项，当前显示 {pagedResources.length} 项。{loading ? "正在同步本地资源..." : ""}
                </p>
              </div>
              <AuditLegend passed={passedCount} unreviewed={unreviewedCount} failed={failedCount} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2">
              <button
                type="button"
                onClick={() => switchResourceMode("manual")}
                className={cn(
                  "inline-flex h-9 items-center rounded-md px-3 text-xs font-semibold transition",
                  resourceMode === "manual" ? "bg-stone-950 text-white" : "bg-white text-stone-700 hover:bg-teal-50"
                )}
              >
                使用详细配置
              </button>
              <button
                type="button"
                onClick={() => switchResourceMode("auto")}
                className={cn(
                  "inline-flex h-9 items-center rounded-md px-3 text-xs font-semibold transition",
                  resourceMode === "auto" ? "bg-teal-800 text-white" : "bg-white text-stone-700 hover:bg-teal-50"
                )}
              >
                让 Hermes 自己决定
              </button>
              <span className="text-xs leading-5 text-stone-500">
                {resourceMode === "auto" ? "调研时忽略本页启用项，由 Hermes 自主选择 Skills / Tools。" : "调研时按本页已启用 Skills / Tools 传给 Hermes。"}
              </span>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => resetPage(() => setActiveFilter(tab.id))}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition",
                    activeFilter === tab.id
                      ? "border-teal-700 bg-teal-50 text-teal-900"
                      : "border-stone-200 bg-white text-stone-600 hover:border-teal-200 hover:bg-stone-50"
                  )}
                >
                  {tab.label}
                  <span className="font-mono text-[11px] text-stone-500">{tab.value}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_170px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  value={keyword}
                  onChange={(event) => resetPage(() => setKeyword(event.target.value))}
                  className={cn(fieldStyles, "h-10 pl-9 text-xs")}
                  placeholder="搜索名称、模块、路径或说明"
                />
              </label>
              <label className="relative block">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <select
                  value={auditStatus}
                  onChange={(event) => resetPage(() => setAuditStatus(event.target.value as SkillSafetyStatus | "all"))}
                  className={cn(fieldStyles, "h-10 appearance-none pl-9 text-xs")}
                >
                  <option value="all">全部审核状态</option>
                  <option value="passed">安全通过</option>
                  <option value="unreviewed">待审核</option>
                  <option value="failed">未通过</option>
                </select>
              </label>
            </div>
          </div>

          <ResourceTable
            items={pagedResources}
            selectedKey={selectedResource ? itemKey(selectedResource) : null}
            onSelect={(item) => setSelectedKey(itemKey(item))}
            onToggle={toggleEnabled}
            onAddWhitelist={addWhitelist}
            onRemoveWhitelist={removeWhitelist}
          />

          {filteredResources.length > pageSize ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 p-4 text-xs text-stone-600">
              <span>第 {safePage} / {totalPages} 页</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1} className="inline-flex h-8 items-center gap-1 rounded-md border border-stone-300 px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                  <ChevronLeft className="h-3.5 w-3.5" />
                  上一页
                </button>
                <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage >= totalPages} className="inline-flex h-8 items-center gap-1 rounded-md border border-stone-300 px-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                  下一页
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="grid h-fit min-w-0 gap-4">
          <div className="rounded-lg border border-stone-200 bg-white/90 p-4 shadow-sm">
            <h2 className="text-sm font-bold text-stone-950">GitHub Skill 搜索</h2>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_44px] gap-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} className={cn(fieldStyles, "h-10 text-xs")} placeholder="agent skills" />
              <button type="button" onClick={searchSkills} className={cn(buttonStyles.primary, "h-10 px-0")} aria-label="搜索 GitHub Skill">
                <Search className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid max-h-[360px] gap-3 overflow-auto pr-1">
              {searchResults.map((item) => (
                <SearchResult key={item.name} item={item} onAddWhitelist={addWhitelist} onRemoveWhitelist={removeWhitelist} onImport={importSkill} />
              ))}
              {searchResults.length === 0 ? <p className="rounded-md bg-stone-100 p-3 text-xs leading-5 text-stone-500">尚未搜索。导入前必须先加入白名单并通过安全状态校验。</p> : null}
            </div>
          </div>

          <form id="custom-skill" onSubmit={createCustomSkill} className="rounded-lg border border-stone-200 bg-white/90 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-stone-950">自定义 Skill</h2>
                <p className="mt-1 text-xs leading-5 text-stone-500">创建后写入本地 Hermes `skills/custom`。</p>
              </div>
              <button type="button" onClick={() => setCustomBody(skillTemplate)} className="shrink-0 rounded-md border border-stone-300 px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50">
                重置
              </button>
            </div>
            <label className="mt-3 grid gap-1 text-xs font-semibold text-stone-500">
              名称
              <input ref={customSkillRef} required value={customName} onChange={(event) => setCustomName(event.target.value)} className={cn(fieldStyles, "h-10 text-xs")} placeholder="market-research-review" />
            </label>
            <label className="mt-3 grid gap-1 text-xs font-semibold text-stone-500">
              SKILL.md 内容
              <textarea value={customBody} onChange={(event) => setCustomBody(event.target.value)} className={cn(fieldStyles, "max-h-[44vh] min-h-52 resize-y p-3 font-mono text-xs leading-5")} />
            </label>
            <button className={cn(buttonStyles.primary, "mt-3 w-full")}>
              <Plus className="h-4 w-4" />
              创建 Skill
            </button>
          </form>

          <ReviewRules />
        </aside>
      </div>

      {selectedResource ? (
        <ResourceDetail
          item={selectedResource}
          floating
          position={detailPosition}
          onDragStart={beginDetailDrag}
          onClose={() => setSelectedKey(null)}
          onToggle={() => toggleEnabled(selectedResource)}
          onAddWhitelist={() => addWhitelist(selectedResource)}
          onRemoveWhitelist={() => removeWhitelist(selectedResource.name)}
        />
      ) : null}
    </section>
  );
}

function ResourceTable({
  items,
  selectedKey,
  onSelect,
  onToggle,
  onAddWhitelist,
  onRemoveWhitelist
}: {
  items: ResourceItem[];
  selectedKey: string | null;
  onSelect: (item: ResourceItem) => void;
  onToggle: (item: Pick<SkillInventoryItem, "kind" | "name" | "path">) => void;
  onAddWhitelist: (item: Pick<SkillInventoryItem, "name" | "url" | "cloneUrl" | "kind">) => Promise<void>;
  onRemoveWhitelist: (name: string) => Promise<void>;
}) {
  return (
    <div className="overflow-hidden">
      <div className="hidden grid-cols-[minmax(150px,1.45fr)_68px_minmax(80px,0.75fr)_54px_44px_66px_76px] items-center gap-2 border-b border-stone-200 bg-stone-100/80 px-4 py-2 text-xs font-bold text-stone-500 xl:grid 2xl:grid-cols-[minmax(190px,1.5fr)_76px_minmax(110px,0.8fr)_64px_52px_76px_84px]">
        <span>名称</span>
        <span>类型</span>
        <span>模块</span>
        <span className="text-center">匹配</span>
        <span className="text-center">审核</span>
        <span>启用状态</span>
        <span className="text-right">操作</span>
      </div>
      <div className="min-w-0 divide-y divide-stone-200">
        {items.map((item) => {
          const key = itemKey(item);
          return (
            <ResourceRow
              key={key}
              item={item}
              selected={selectedKey === key}
              onSelect={() => onSelect(item)}
              onToggle={() => onToggle(item)}
              onAddWhitelist={() => onAddWhitelist(item)}
              onRemoveWhitelist={() => onRemoveWhitelist(item.name)}
            />
          );
        })}
        {items.length === 0 ? <p className="p-4 text-sm text-stone-500">暂无匹配资源。</p> : null}
      </div>
    </div>
  );
}

function ResourceRow({
  item,
  selected,
  onSelect,
  onToggle,
  onAddWhitelist,
  onRemoveWhitelist
}: {
  item: ResourceItem;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onAddWhitelist: () => void;
  onRemoveWhitelist: () => void;
}) {
  const safetyTitle = `${item.safety.label}${item.safety.reasons.length ? `：${item.safety.reasons.join("；")}` : ""}`;

  return (
    <article className={cn("bg-white px-4 py-3 text-sm transition hover:bg-teal-50/50", selected && "bg-teal-50/70")}>
      <div className="grid gap-3 xl:grid-cols-[minmax(150px,1.45fr)_68px_minmax(80px,0.75fr)_54px_44px_66px_76px] xl:items-center xl:gap-2 2xl:grid-cols-[minmax(190px,1.5fr)_76px_minmax(110px,0.8fr)_64px_52px_76px_84px]">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="max-w-full truncate font-semibold text-stone-950">{item.name}</span>
            {item.recommended ? (
              <span title="推荐命中" aria-label="推荐命中" className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700">
                <ThumbsUp className="h-3.5 w-3.5" />
              </span>
            ) : null}
            {item.source === "custom" ? <Badge tone="green">custom</Badge> : null}
            {item.source === "imported" ? <Badge tone="slate">imported</Badge> : null}
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-stone-500">{item.descriptionZh || "暂无说明。"}</p>
        </div>

        <LabeledCell label="类型">
          <TypePill kind={item.kind} />
        </LabeledCell>
        <LabeledCell label="模块">
          <span className="truncate text-xs text-stone-600">{moduleLabel(item)}</span>
        </LabeledCell>
        <LabeledCell label="匹配分">
          <span className="flex justify-end xl:justify-center">
            {item.recommended ? <span className="font-mono text-sm font-semibold text-teal-800">{item.recommendationScore}</span> : <span className="text-xs text-stone-400">-</span>}
          </span>
        </LabeledCell>
        <LabeledCell label="审核状态">
          <span className="flex justify-end xl:justify-center">
            <SafetyIcon status={item.safety.status} title={safetyTitle} />
          </span>
        </LabeledCell>
        <LabeledCell label="启用状态">
          <span className={cn("inline-flex rounded-md border px-2 py-1 text-xs font-semibold", item.isEnabled ? "border-teal-200 bg-teal-50 text-teal-800" : "border-stone-200 bg-stone-50 text-stone-500")}>
            {item.isEnabled ? "已启用" : "未启用"}
          </span>
        </LabeledCell>

        <div className="flex flex-wrap gap-2 xl:flex-nowrap xl:justify-end">
          <button type="button" onClick={onSelect} title="查看详情" aria-label={`查看 ${item.name} 详情`} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-white">
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onToggle} title={item.isEnabled ? "关闭资源" : "启用资源"} aria-label={`${item.isEnabled ? "关闭" : "启用"} ${item.name}`} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-stone-300 text-stone-700 hover:bg-white">
            {item.isEnabled ? <ToggleRight className="h-4 w-4 text-teal-700" /> : <ToggleLeft className="h-4 w-4 text-stone-500" />}
          </button>
        </div>
      </div>

      {selected ? (
        <div className="mt-3 rounded-md border border-stone-200 bg-white p-3 xl:hidden">
          <ResourceDetailContent item={item} />
          <ResourceActions item={item} onToggle={onToggle} onAddWhitelist={onAddWhitelist} onRemoveWhitelist={onRemoveWhitelist} />
        </div>
      ) : null}
    </article>
  );
}

function ResourceDetail({
  item,
  floating,
  position,
  onDragStart,
  onClose,
  onToggle,
  onAddWhitelist,
  onRemoveWhitelist
}: {
  item?: ResourceItem;
  floating?: boolean;
  position?: { x: number; y: number };
  onDragStart?: (event: React.PointerEvent<HTMLElement>) => void;
  onClose: () => void;
  onToggle?: () => void;
  onAddWhitelist?: () => void;
  onRemoveWhitelist?: () => void;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-stone-200 bg-white/95 shadow-lg backdrop-blur",
        floating
          ? "fixed z-50 hidden max-h-[calc(100vh-96px)] w-[min(360px,calc(100vw-24px))] overflow-hidden xl:block"
          : "p-4 xl:sticky xl:top-5"
      )}
      style={floating && position ? { left: position.x, top: position.y } : undefined}
    >
      <div
        onPointerDown={floating ? onDragStart : undefined}
        className={cn(
          "flex items-start justify-between gap-3",
          floating && "touch-none cursor-grab border-b border-stone-200 bg-stone-50/80 px-4 py-3 active:cursor-grabbing"
        )}
      >
        <div>
          <h2 className="inline-flex items-center gap-2 text-sm font-bold text-stone-950">
            {floating ? <Move className="h-4 w-4 text-stone-400" /> : null}
            资源详情
          </h2>
          <p className="mt-1 text-xs text-stone-500">{floating ? "拖动标题栏移动浮窗。" : "点击表格“查看详情”后在此复核。"}</p>
        </div>
        {item ? (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className="rounded-md border border-stone-200 p-1.5 text-stone-500 hover:bg-stone-50"
            aria-label="关闭详情"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className={cn(floating && "max-h-[calc(100vh-180px)] overflow-auto p-4", !floating && "contents")}>
        {item ? (
          <>
          <ResourceDetailContent item={item} />
          <ResourceActions item={item} onToggle={onToggle} onAddWhitelist={onAddWhitelist} onRemoveWhitelist={onRemoveWhitelist} />
          </>
        ) : (
          <p className="mt-3 rounded-md bg-stone-100 p-3 text-xs leading-5 text-stone-500">尚未选择资源。</p>
        )}
      </div>
    </section>
  );
}

function ResourceDetailContent({ item }: { item: ResourceItem }) {
  const phases = recommendationPhases(item);
  const basis = recommendationBasis(item);
  return (
    <div className="mt-4 grid gap-3 text-xs leading-5 text-stone-600">
      <div className="flex flex-wrap items-center gap-2">
        <TypePill kind={item.kind} />
        <SafetyBadge status={item.safety.status} label={item.safety.label} />
        <span className={cn("rounded-md border px-2 py-1 font-semibold", item.isEnabled ? "border-teal-200 bg-teal-50 text-teal-800" : "border-stone-200 bg-stone-50 text-stone-500")}>
          {item.isEnabled ? "已启用" : "未启用"}
        </span>
      </div>
      <div>
        <p className="font-semibold text-stone-950">{item.name}</p>
        <p className="mt-1">{item.descriptionZh || "暂无说明。"}</p>
      </div>
      <DetailLine icon={<FileText className="h-4 w-4" />} label="路径" value={item.path} mono />
      <DetailLine icon={<SlidersHorizontal className="h-4 w-4" />} label="用法 / 作用" value={resourceUsage(item, phases)} />
      <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
        <p className="font-semibold text-stone-900">推荐依据</p>
        <p className="mt-1 text-stone-600">
          {item.recommended ? `可能使用阶段：${phases}。${basis}` : "未命中当前项目评分；可手动启用，但不建议作为默认执行资源。"}
        </p>
      </div>
      <div className={cn("rounded-md border p-3", item.safety.status === "passed" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : item.safety.status === "failed" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
        <p className="font-semibold">风险提示：{item.safety.label}</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          {(item.safety.reasons.length ? item.safety.reasons : ["暂无额外风险原因。"]).map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </div>
    </div>
  );
}

function ResourceActions({
  item,
  onToggle,
  onAddWhitelist,
  onRemoveWhitelist
}: {
  item: ResourceItem;
  onToggle?: () => void;
  onAddWhitelist?: () => void;
  onRemoveWhitelist?: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" onClick={onToggle} className={buttonStyles.secondary}>
        {item.isEnabled ? <ToggleRight className="h-4 w-4 text-teal-700" /> : <ToggleLeft className="h-4 w-4 text-stone-500" />}
        {item.isEnabled ? "关闭资源" : "启用资源"}
      </button>
      {item.whitelisted ? (
        <button type="button" onClick={onRemoveWhitelist} className={buttonStyles.danger}>
          <Trash2 className="h-4 w-4" />
          移出白名单
        </button>
      ) : (
        <button type="button" onClick={onAddWhitelist} className={buttonStyles.secondary}>
          <ShieldCheck className="h-4 w-4" />
          加入白名单
        </button>
      )}
    </div>
  );
}

function ReviewRules() {
  return (
    <section className="rounded-lg border border-stone-200 bg-white/90 p-4 shadow-sm">
      <h2 className="text-sm font-bold text-stone-950">审核规则说明</h2>
      <div className="mt-3 grid gap-2 text-xs leading-5 text-stone-600">
        <p>当前只展示本地 `skills`、`optional-skills` 和 `tools`。命中项目推荐的本地条目会显示匹配分，分数越高排序越靠前。</p>
        <p>第三方 Skill 必须先进入白名单，再通过安全状态校验后才能导入。白名单只代表本机人工复核，不等于全网安全认证。</p>
        <p>“启用/关闭”保存到浏览器本地配置，用于界面选择和管理标记；真正导入和白名单操作仍调用后端 API。</p>
      </div>
    </section>
  );
}

function SearchResult({
  item,
  onAddWhitelist,
  onRemoveWhitelist,
  onImport
}: {
  item: SkillSearchResult;
  onAddWhitelist: (item: SkillSearchResult) => Promise<void>;
  onRemoveWhitelist: (name: string) => Promise<void>;
  onImport: (item: SkillSearchResult) => Promise<void>;
}) {
  return (
    <article className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-stone-950">{item.name}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">{item.description || "该仓库未提供简介，导入前需要人工复核 README、许可证和脚本内容。"}</p>
        </div>
        <SafetyIcon status={item.safety.status} title={item.safety.label} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.whitelisted ? (
          <button type="button" onClick={() => onRemoveWhitelist(item.name)} className={buttonStyles.secondary}>
            <Trash2 className="h-4 w-4" />
            移出白名单
          </button>
        ) : (
          <button type="button" onClick={() => onAddWhitelist(item)} className={buttonStyles.secondary}>
            <ShieldCheck className="h-4 w-4" />
            加入白名单
          </button>
        )}
        <button type="button" onClick={() => onImport(item)} disabled={!item.whitelisted || item.safety.status !== "passed"} className={buttonStyles.primary}>
          <Download className="h-4 w-4" />
          导入
        </button>
      </div>
    </article>
  );
}

function LabeledCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 xl:block">
      <span className="text-xs font-semibold text-stone-400 xl:hidden">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function TypePill({ kind }: { kind: SkillKind }) {
  const isSkill = kind === "skill";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold", isSkill ? "border-cyan-200 bg-cyan-50 text-cyan-800" : "border-stone-200 bg-stone-100 text-stone-700")}>
      {isSkill ? <FileText className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
      {isSkill ? "Skill" : "Tool"}
    </span>
  );
}

function SafetyBadge({ status, label }: { status: SkillSafetyStatus; label: string }) {
  const tones = {
    passed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    unreviewed: "border-amber-200 bg-amber-50 text-amber-800",
    failed: "border-rose-200 bg-rose-50 text-rose-800"
  };
  return <span className={cn("inline-flex rounded-md border px-2 py-1 text-xs font-semibold", tones[status])}>{label}</span>;
}

function SafetyIcon({ status, title }: { status: SkillSafetyStatus; title: string }) {
  const className = "inline-flex h-8 w-8 items-center justify-center rounded-md border";
  if (status === "passed") {
    return <span title={title} aria-label={title} className={cn(className, "border-emerald-200 bg-emerald-50 text-emerald-700")}><CheckCircle2 className="h-4 w-4" /></span>;
  }
  if (status === "failed") {
    return <span title={title} aria-label={title} className={cn(className, "border-rose-200 bg-rose-50 text-rose-700")}><TriangleAlert className="h-4 w-4" /></span>;
  }
  return <span title={title} aria-label={title} className={cn(className, "border-amber-200 bg-amber-50 text-amber-700")}><TriangleAlert className="h-4 w-4" /></span>;
}

function Metric({ label, value, helper, tone = "neutral" }: { label: string; value: number; helper: string; tone?: "neutral" | "warning" | "risk" }) {
  const tones = {
    neutral: "border-stone-200 bg-white text-stone-500",
    warning: "border-amber-200 bg-amber-50/60 text-amber-800",
    risk: "border-teal-200 bg-teal-50/60 text-teal-800"
  };
  return (
    <div className={cn("rounded-lg border px-4 py-3 shadow-sm", tones[tone])}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-stone-500">{label}</p>
        {tone !== "neutral" ? <TriangleAlert className="h-4 w-4 shrink-0" /> : null}
      </div>
      <p className="mt-2 font-mono text-3xl font-semibold leading-none text-stone-950">{value}</p>
      <p className="mt-2 text-xs leading-5">{helper}</p>
    </div>
  );
}

function AuditLegend({ passed, unreviewed, failed }: { passed: number; unreviewed: number; failed: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
      <LegendItem icon={<CheckCircle2 className="h-3.5 w-3.5" />} tone="green" label="通过" value={passed} />
      <LegendItem icon={<TriangleAlert className="h-3.5 w-3.5" />} tone="yellow" label="待审核" value={unreviewed} />
      <LegendItem icon={<TriangleAlert className="h-3.5 w-3.5" />} tone="red" label="未通过" value={failed} />
    </div>
  );
}

function LegendItem({ icon, tone, label, value }: { icon: React.ReactNode; tone: "green" | "yellow" | "red"; label: string; value: number }) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    yellow: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-rose-200 bg-rose-50 text-rose-700"
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-semibold", tones[tone])}>
      {icon}
      {label}
      <span className="font-mono">{value}</span>
    </span>
  );
}

function DetailLine({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 rounded-md border border-stone-200 bg-stone-50 p-3">
      <span className="inline-flex items-center gap-1.5 font-semibold text-stone-900">
        {icon}
        {label}
      </span>
      <span className={cn("break-all text-stone-600", mono && "font-mono text-[11px]")}>{value}</span>
    </div>
  );
}

function buildRecommendedIndex(items: SkillInventoryItem[]) {
  const index: RecommendedIndex = new Map();
  for (const item of items) {
    index.set(normalizeName(item.name), item);
  }
  return index;
}

function recommendationCount(item?: SkillInventoryItem) {
  if (!item) return 0;
  const joined = item.purpose?.join(" ") || "";
  const explicit = joined.match(/(?:推荐计数|匹配分)[:：]\s*(\d+)/);
  if (explicit) return Math.max(1, Number(explicit[1]));
  return Math.max(1, item.purpose?.length || 1);
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").trim();
}

function itemKey(item: Pick<SkillInventoryItem, "kind" | "name" | "path">) {
  return `${item.kind}:${item.name}:${item.path}`;
}

function moduleLabel(item: SkillInventoryItem) {
  return item.category || item.source || (item.kind === "skill" ? "skills" : "tools");
}

function purposeEntry(item: ResourceItem, prefix: string) {
  return item.recommended?.purpose?.find((entry) => entry.startsWith(prefix))?.slice(prefix.length).trim();
}

function recommendationPhases(item: ResourceItem) {
  return purposeEntry(item, "可能使用阶段：") || "项目规划、竞品调研或交付阶段";
}

function recommendationBasis(item: ResourceItem) {
  const explicit = purposeEntry(item, "推荐依据：");
  if (explicit) return `评分原因：${explicit}`;
  if (item.recommendationScore > 0) return `评分原因：匹配分 ${item.recommendationScore}，与当前项目输入存在语义或关键词匹配。`;
  return "评分原因：当前项目未给出明确匹配信号。";
}

function resourceUsage(item: ResourceItem, phases: string) {
  const description = item.descriptionZh || `${item.name} 是本地 Hermes ${item.kind === "tool" ? "Tool" : "Skill"}。`;
  if (item.kind === "tool") {
    return `作用：${description} 建议在 ${phases} 中作为受控工具调用，启用前确认输入、输出、权限和执行边界。`;
  }
  return `用法：${description} 建议在 ${phases} 中作为 Agent 工作流提示、流程约束或专业知识补充，执行前复核触发条件和风险边界。`;
}

function safetyRank(status: SkillSafetyStatus) {
  if (status === "failed") return 0;
  if (status === "unreviewed") return 1;
  return 2;
}
