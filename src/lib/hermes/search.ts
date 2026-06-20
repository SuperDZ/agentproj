import type { SkillKind, SkillSearchResult, SkillSearchSafety, SkillWhitelistEntry } from "@/lib/skills/skill-types";
import { readSkillWhitelist } from "@/lib/hermes/whitelist";

const officialReviewedSkillRepos = new Set(["NousResearch/hermes-agent", "Hermes bundled skills"]);

function sameWhitelistEntry(left: SkillWhitelistEntry, right: Pick<SkillWhitelistEntry, "name" | "url" | "cloneUrl">) {
  return left.name === right.name || (!!left.url && left.url === right.url) || (!!left.cloneUrl && left.cloneUrl === right.cloneUrl);
}

function isWhitelisted(item: Pick<SkillWhitelistEntry, "name" | "url" | "cloneUrl">, whitelist: SkillWhitelistEntry[]) {
  return whitelist.some((entry) => sameWhitelistEntry(entry, item));
}

function safety(status: SkillSearchSafety["status"], label: string, reasons: string[]): SkillSearchSafety {
  return { status, label, reasons };
}

function evaluateSkillSafety(item: {
  name: string;
  url?: string;
  cloneUrl?: string;
  archived?: boolean;
  disabled?: boolean;
  kind?: SkillKind;
  whitelisted?: boolean;
}): SkillSearchSafety {
  if (item.whitelisted || officialReviewedSkillRepos.has(item.name)) {
    return safety("passed", "已通过本地或官方安全检查", ["该来源在本地白名单或官方内置白名单中。"]);
  }

  if (item.archived || item.disabled || !item.url || (!item.cloneUrl && item.kind !== "tool")) {
    return safety("failed", "未通过安全检查", [
      item.archived ? "仓库已归档。" : "",
      item.disabled ? "仓库已禁用。" : "",
      !item.url ? "缺少可验证来源链接。" : "",
      !item.cloneUrl && item.kind !== "tool" ? "缺少 clone 地址。" : ""
    ].filter(Boolean));
  }

  return safety("unreviewed", "未经本地白名单审查", ["来源可验证，但尚未加入本地白名单。导入前需要人工检查许可证、脚本和 Prompt Injection 风险。"]);
}

type GithubRepo = {
  full_name?: string;
  description?: string | null;
  stargazers_count?: number;
  html_url?: string;
  clone_url?: string;
  updated_at?: string;
  pushed_at?: string;
  archived?: boolean;
  disabled?: boolean;
};

export async function searchGithubSkills(query: string): Promise<SkillSearchResult[]> {
  const search = encodeURIComponent(`${query || "agent skills"} skill OR skills`);
  const response = await fetch(`https://api.github.com/search/repositories?q=${search}&sort=stars&order=desc&per_page=10`, {
    headers: { accept: "application/vnd.github+json" }
  });
  if (!response.ok) throw new Error(`GitHub search failed: ${response.status}`);

  const whitelist = await readSkillWhitelist();
  const data = (await response.json()) as { items?: GithubRepo[] };
  return (data.items ?? []).map((item) => {
    const name = item.full_name || "unknown/repository";
    const whitelisted = isWhitelisted({ name, url: item.html_url, cloneUrl: item.clone_url }, whitelist);
    return {
      kind: "skill",
      name,
      description: item.description || undefined,
      stars: item.stargazers_count ?? 0,
      url: item.html_url,
      cloneUrl: item.clone_url,
      updatedAt: item.updated_at || item.pushed_at,
      whitelisted,
      safety: evaluateSkillSafety({
        name,
        url: item.html_url,
        cloneUrl: item.clone_url,
        archived: item.archived,
        disabled: item.disabled,
        kind: "skill",
        whitelisted
      })
    };
  });
}

