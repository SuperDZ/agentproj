import type { SkillInventoryItem } from "@/lib/skills/skill-types";

export const hermesResourceConfigArtifact = "project_hermes_resource_config";
export const hermesResearchResourceLogArtifact = "hermes_research_resource_log";

export type HermesResourceMode = "manual" | "auto";

export type HermesResourceConfigItem = {
  kind: "skill" | "tool";
  name: string;
  path: string;
  descriptionZh?: string;
  category?: string;
  source?: SkillInventoryItem["source"];
  purpose?: string[];
  recommendationScore?: number;
};

export type HermesResourceConfig = {
  mode: HermesResourceMode;
  enabled: HermesResourceConfigItem[];
  updatedAt: string;
};

export type HermesResourceUsageItem = {
  kind: "skill" | "tool";
  name: string;
  path?: string;
  purpose?: string[];
  callCount: number;
  status: "used" | "planned" | "not_reported";
  reason?: string;
};

export type HermesResearchResourceLog = {
  projectId: string;
  researchRunId: string;
  hermesRunId?: string | null;
  mode: HermesResourceMode;
  generatedAt: string;
  skills: HermesResourceUsageItem[];
  tools: HermesResourceUsageItem[];
  raw?: unknown;
};

export function parseHermesResourceConfig(content?: string | null): HermesResourceConfig {
  if (!content) return { mode: "manual", enabled: [], updatedAt: "" };
  try {
    const parsed = JSON.parse(content) as Partial<HermesResourceConfig>;
    const enabled = Array.isArray(parsed.enabled) ? parsed.enabled : [];
    return {
      mode: parsed.mode === "auto" ? "auto" : "manual",
      enabled: enabled
        .filter((item): item is HermesResourceConfigItem => Boolean(item?.kind && item?.name && item?.path))
        .map((item) => ({
          kind: item.kind === "tool" ? "tool" : "skill",
          name: String(item.name),
          path: String(item.path),
          descriptionZh: item.descriptionZh ? String(item.descriptionZh) : undefined,
          category: item.category ? String(item.category) : undefined,
          source: item.source,
          purpose: Array.isArray(item.purpose) ? item.purpose.map(String) : undefined,
          recommendationScore: Number.isFinite(Number(item.recommendationScore)) ? Number(item.recommendationScore) : undefined
        })),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : ""
    };
  } catch {
    return { mode: "manual", enabled: [], updatedAt: "" };
  }
}

export function serializeResourceItem(item: SkillInventoryItem & { recommendationScore?: number; recommended?: SkillInventoryItem }): HermesResourceConfigItem {
  return {
    kind: item.kind,
    name: item.name,
    path: item.path,
    descriptionZh: item.descriptionZh,
    category: item.category,
    source: item.source,
    purpose: item.recommended?.purpose ?? item.purpose,
    recommendationScore: item.recommendationScore
  };
}

export function resourceItemKey(item: Pick<HermesResourceConfigItem, "kind" | "name" | "path">) {
  return `${item.kind}:${item.name}:${item.path}`;
}

export function parseHermesResearchResourceLog(content?: string | null): HermesResearchResourceLog | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as HermesResearchResourceLog;
    return {
      projectId: String(parsed.projectId || ""),
      researchRunId: String(parsed.researchRunId || ""),
      hermesRunId: parsed.hermesRunId ?? null,
      mode: parsed.mode === "auto" ? "auto" : "manual",
      generatedAt: String(parsed.generatedAt || ""),
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      tools: Array.isArray(parsed.tools) ? parsed.tools : [],
      raw: parsed.raw
    };
  } catch {
    return null;
  }
}
