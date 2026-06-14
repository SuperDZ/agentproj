import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  RecommendedSkillSource,
  SkillInventoryItem,
  SkillInventoryResponse,
  SkillKind,
  SkillSearchResult,
  SkillSearchSafety,
  SkillWhitelistEntry
} from "@/lib/skills/skill-types";

const stateDir = path.join(process.cwd(), ".next", "hermes");
const pidFile = path.join(stateDir, "dashboard.pid");
const modelConfigFile = path.join(stateDir, "model-config.json");

const officialReviewedSkillRepos = new Set(["NousResearch/hermes-agent", "Hermes bundled skills"]);
const recommendedToolNames = new Set(["excalidraw/excalidraw", "tldraw/tldraw", "gitbrent/PptxGenJS", "recharts/recharts"]);

export function hermesRoot() {
  return process.env.HERMES_LOCAL_ROOT || "hermes-agent";
}

export function hermesPython() {
  return process.env.HERMES_LOCAL_PYTHON || path.join(hermesRoot(), ".venv", "Scripts", "python.exe");
}

function whitelistFile() {
  return path.join(hermesRoot(), "skills", "safety-whitelist.json");
}

function descriptionCacheFile() {
  return path.join(hermesRoot(), "skills", "zh-descriptions.json");
}

function exec(command: string, args: string[], cwd = process.cwd(), timeout = 120_000) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(command, args, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || stdout || error.message)));
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

export async function getHermesStatus() {
  let dashboardPid: number | undefined;
  try {
    const parsed = Number(await fs.readFile(pidFile, "utf8"));
    dashboardPid = Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    dashboardPid = undefined;
  }

  const savedModelConfig = await readJsonFile<Record<string, unknown>>(modelConfigFile, {});
  return {
    mode: process.env.HERMES_MODE || "mock",
    localRoot: hermesRoot(),
    localPython: hermesPython(),
    provider: String(savedModelConfig.provider || process.env.HERMES_INFERENCE_PROVIDER || ""),
    model: String(savedModelConfig.model || process.env.HERMES_INFERENCE_MODEL || ""),
    usageMode: String(savedModelConfig.usageMode || "api"),
    codexCliCommand: String(savedModelConfig.codexCliCommand || "codex"),
    dashboardPid
  };
}

export async function saveModelConfig(config: { provider: string; model: string; usageMode: string; codexCliCommand?: string }) {
  await writeJsonFile(modelConfigFile, config);
  return getHermesStatus();
}

export async function startHermesDashboard() {
  await fs.mkdir(stateDir, { recursive: true });
  const child = spawn(hermesPython(), ["-m", "hermes_cli.main", "dashboard"], {
    cwd: hermesRoot(),
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  await fs.writeFile(pidFile, String(child.pid ?? ""), "utf8");
  return getHermesStatus();
}

export async function stopHermesDashboard() {
  const status = await getHermesStatus();
  if (status.dashboardPid) {
    try {
      process.kill(status.dashboardPid);
    } catch {
      // 进程可能已经退出。
    }
  }
  await fs.rm(pidFile, { force: true });
  return getHermesStatus();
}

export async function restartHermesDashboard() {
  await stopHermesDashboard();
  return startHermesDashboard();
}

export async function readSkillWhitelist(): Promise<SkillWhitelistEntry[]> {
  const entries = await readJsonFile<SkillWhitelistEntry[]>(whitelistFile(), []);
  return entries.filter((entry) => entry?.name).map((entry) => ({ ...entry, kind: entry.kind || "skill" }));
}

export async function addSkillWhitelist(entry: Omit<SkillWhitelistEntry, "addedAt"> & { addedAt?: string }) {
  const entries = await readSkillWhitelist();
  const normalized: SkillWhitelistEntry = {
    name: entry.name,
    url: entry.url || undefined,
    cloneUrl: entry.cloneUrl || undefined,
    kind: entry.kind || "skill",
    addedAt: entry.addedAt || new Date().toISOString()
  };
  const next = entries.filter((item) => !sameWhitelistEntry(item, normalized));
  next.unshift(normalized);
  await writeJsonFile(whitelistFile(), next);
  return normalized;
}

export async function removeSkillWhitelist(name: string) {
  const entries = await readSkillWhitelist();
  const next = entries.filter((entry) => entry.name !== name);
  await writeJsonFile(whitelistFile(), next);
  return { removed: entries.length - next.length };
}

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

  return safety("unreviewed", "未经过本地白名单审查", ["来源可验证，但尚未加入本地白名单。导入前需要人工检查许可证、脚本和 Prompt Injection（提示注入）风险。"]);
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

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "imported-skill";
}

type ImportGithubSkillInput = {
  cloneUrl?: string;
  identifier?: string;
  name: string;
  url?: string;
};

function githubRepoFromUrl(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(/\.git$/i, "");
  const match = normalized.match(/github\.com[:/]+([^/\s]+)\/([^/\s#?]+)/i);
  if (!match) return undefined;
  return `${match[1]}/${match[2]}`;
}

function githubApiHeaders() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  return {
    accept: "application/vnd.github+json",
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
}

async function resolveGithubSkillIdentifier(input: ImportGithubSkillInput) {
  if (input.identifier?.trim()) return input.identifier.trim();
  if (input.url?.match(/^https?:\/\/.+\.md(?:[?#].*)?$/i)) return input.url.trim();

  const repo = githubRepoFromUrl(input.url) || githubRepoFromUrl(input.cloneUrl);
  if (!repo) throw new Error("无法解析 GitHub 仓库地址。");

  const repoResponse = await fetch(`https://api.github.com/repos/${repo}`, { headers: githubApiHeaders() });
  if (!repoResponse.ok) throw new Error(`无法读取 GitHub 仓库信息：${repoResponse.status}`);
  const repoInfo = (await repoResponse.json()) as { default_branch?: string };
  const branch = repoInfo.default_branch || "main";

  const treeResponse = await fetch(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: githubApiHeaders() });
  if (!treeResponse.ok) throw new Error(`无法读取 GitHub 仓库文件树：${treeResponse.status}`);
  const treeInfo = (await treeResponse.json()) as { tree?: Array<{ path?: string; type?: string }> };
  const skillFiles = (treeInfo.tree ?? [])
    .filter((item) => item.type === "blob" && item.path?.split("/").pop() === "SKILL.md")
    .map((item) => item.path as string)
    .sort((left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right));

  if (!skillFiles.length) throw new Error("该 GitHub 仓库中没有找到 SKILL.md，Hermes 无法按 Skill 安装。");
  const skillDir = skillFiles[0].replace(/\/?SKILL\.md$/i, "");
  return skillDir ? `${repo}/${skillDir}` : `https://raw.githubusercontent.com/${repo}/${branch}/SKILL.md`;
}

async function installSkillWithHermes(input: ImportGithubSkillInput) {
  const identifier = await resolveGithubSkillIdentifier(input);
  const args = ["-m", "hermes_cli.main", "skills", "install", identifier, "--category", "imported", "--yes"];
  if (identifier.startsWith("http")) args.push("--name", slug(input.name));
  const result = await exec(hermesPython(), args, hermesRoot(), 300_000);
  return { identifier, mode: "hermes-cli", stdout: result.stdout, stderr: result.stderr };
}

export async function importGithubSkill(input: ImportGithubSkillInput) {
  return installSkillWithHermes(input);
}

async function importGithubSkillLegacyClone(cloneUrl: string, name: string) {
  if (!cloneUrl) throw new Error("缺少 clone 地址，无法导入。");
  const target = path.join(hermesRoot(), "skills", "imported", slug(name));
  await fs.mkdir(path.dirname(target), { recursive: true });

  let exists = false;
  try {
    await fs.access(target);
    exists = true;
  } catch {
    exists = false;
  }

  if (exists) {
    await exec("git", ["-C", target, "pull", "--ff-only"], hermesRoot(), 300_000);
  } else {
    await exec("git", ["clone", "--depth", "1", cloneUrl, target], hermesRoot(), 300_000);
  }
  return { path: target };
}

void importGithubSkillLegacyClone;

export async function createCustomSkill(name: string, body: string) {
  const target = path.join(hermesRoot(), "skills", "custom", slug(name));
  await fs.mkdir(target, { recursive: true });
  await fs.writeFile(path.join(target, "SKILL.md"), body || `# ${name}\n\n## Purpose\n该 Skill（技能）用于补充本地 Hermes 工作流，启用前需要人工复核。\n`, "utf8");
  return { path: target };
}

async function findSkillFiles(root: string, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  let entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "__pycache__" || entry.name === "node_modules") continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === "SKILL.md") {
      found.push(fullPath);
    } else if (entry.isDirectory()) {
      found.push(...(await findSkillFiles(fullPath, depth + 1)));
    }
  }
  return found;
}

function titleFromSkill(content: string, fallback: string) {
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return title || fallback;
}

function frontmatterDescription(content: string) {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/);
  const description = frontmatter?.[1].match(/^description:\s*(?:"([^"]+)"|'([^']+)'|(.+))\s*$/m);
  return description ? (description[1] || description[2] || description[3] || "").trim() : "";
}

function descriptionFromSkill(content: string) {
  const predefined = frontmatterDescription(content);
  if (predefined) return predefined;
  const purpose = content.match(/##\s+Purpose\s*\n([\s\S]*?)(?:\n##\s+|$)/i)?.[1];
  const source = purpose || content.replace(/^#.*$/m, "");
  const line = source
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-*]\s+/, "").trim())
    .find((item) => item && !item.startsWith("#"));
  return line || "";
}

function containsChinese(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

async function descriptionZh(key: string, name: string, sourceText?: string) {
  const cache = await readJsonFile<Record<string, string>>(descriptionCacheFile(), {});
  if (cache[key]) return cache[key];

  const text = sourceText?.trim();
  const value = text && containsChinese(text)
    ? text.slice(0, 180)
    : `该 ${key.startsWith("tool:") ? "Tool（工具）" : "Skill（技能）"} 用于 ${name.replace(/[-_]/g, " ")} 相关工作流，导入或启用前需要人工复核来源、权限和执行风险。`;

  cache[key] = value;
  await writeJsonFile(descriptionCacheFile(), cache);
  return value;
}

void descriptionZh;

function sourceFromPath(filePath: string): SkillInventoryItem["source"] {
  const normalized = filePath.toLowerCase();
  if (normalized.includes(`${path.sep}imported${path.sep}`)) return "imported";
  if (normalized.includes(`${path.sep}custom${path.sep}`)) return "custom";
  return "installed";
}

function normalizeDescriptionText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripMarkdownForDescription(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1");
}

function firstDescriptionSentence(source: string) {
  const lines = stripMarkdownForDescription(source)
    .split(/\r?\n/)
    .map((item) => normalizeDescriptionText(item))
    .filter((item) => item && !item.startsWith("#") && !/^usage:?$/i.test(item) && !/^environment variables:?$/i.test(item));
  const line = lines.find((item) => item.length >= 24) ?? lines[0];
  if (!line) return "";
  return (line.match(/^.{18,220}?[.!?。！？](?:\s|$)/)?.[0] ?? line).trim().slice(0, 220);
}

function humanReadableName(name: string) {
  return name.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function isStaleDescription(value: string) {
  return /导入|启用前|人工复核|执行风险|权限|鐢ㄤ簬|瀵煎叆|鍚敤|椋庨櫓|璇\?Tool|璇\?Skill/i.test(value);
}

function inventoryFallbackDescription(kind: SkillKind, name: string) {
  return kind === "tool"
    ? `${humanReadableName(name)} 是本地 Hermes 工具，当前未在源码头部或 README 中发现可提取的功能说明。`
    : `${humanReadableName(name)} 是本地 Hermes Skill，当前未在 SKILL.md 中发现可提取的功能说明。`;
}

async function inventoryDescription(key: string, kind: SkillKind, name: string, sourceText?: string) {
  const cache = await readJsonFile<Record<string, string>>(descriptionCacheFile(), {});
  if (cache[key] && !isStaleDescription(cache[key])) return cache[key];

  const value = firstDescriptionSentence(sourceText ?? "") || inventoryFallbackDescription(kind, name);
  cache[key] = value;
  await writeJsonFile(descriptionCacheFile(), cache);
  return value;
}

function extractPythonDocstring(content: string) {
  const moduleDoc = content.match(/^\s*(?:#![^\n]*\n)?(?:#.*\n|\s)*("""|''')([\s\S]*?)\1/);
  if (moduleDoc?.[2]) return moduleDoc[2];
  const classOrFunctionDoc = content.match(/(?:class|def)\s+\w+[\s\S]{0,400}?(?:"""|''')([\s\S]*?)(?:"""|''')/);
  return classOrFunctionDoc?.[1] ?? "";
}

async function readFileIfExists(file: string) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

async function descriptionFromToolPath(toolPath: string) {
  let stat: { isDirectory: () => boolean; isFile: () => boolean };
  try {
    stat = await fs.stat(toolPath);
  } catch {
    return "";
  }

  if (stat.isFile() && toolPath.toLowerCase().endsWith(".py")) {
    return extractPythonDocstring(await readFileIfExists(toolPath));
  }
  if (!stat.isDirectory()) return "";

  const candidates = ["README.md", "readme.md", "tool.py", "__init__.py", "main.py", "backend.py"];
  for (const candidate of candidates) {
    const candidatePath = path.join(toolPath, candidate);
    const content = await readFileIfExists(candidatePath);
    if (!content) continue;
    if (candidate.toLowerCase().endsWith(".py")) {
      const docstring = extractPythonDocstring(content);
      if (docstring) return docstring;
    } else {
      const sentence = firstDescriptionSentence(content);
      if (sentence) return sentence;
    }
  }
  return "";
}

export async function getSkillsInventory(recommended: RecommendedSkillSource[] = []): Promise<SkillInventoryResponse> {
  const whitelist = await readSkillWhitelist();

  const recommendedItems = await Promise.all(
    recommended.map(async (item) => {
      const kind: SkillKind = recommendedToolNames.has(item.name) ? "tool" : "skill";
      const url = item.name.includes("/") ? `https://github.com/${item.name}` : undefined;
      const cloneUrl = item.name.includes("/") ? `https://github.com/${item.name}.git` : undefined;
      const whitelisted = item.sourceType === "official" || isWhitelisted({ name: item.name, url, cloneUrl }, whitelist);
      return {
        kind,
        name: item.name,
        path: url || item.name,
        descriptionZh: await inventoryDescription(`recommended:${item.name}`, kind, item.name, `${item.usage} ${item.purpose.join(", ")}`),
        category: item.sourceType,
        source: "recommended" as const,
        safety: evaluateSkillSafety({ name: item.name, url, cloneUrl, kind, whitelisted }),
        whitelisted,
        url,
        cloneUrl,
        enabled: item.enabled,
        purpose: item.purpose
      };
    })
  );

  const skillFiles = await findSkillFiles(path.join(hermesRoot(), "skills"));
  const installedSkills = await Promise.all(
    skillFiles.map(async (file) => {
      const content = await fs.readFile(file, "utf8");
      const folderName = path.basename(path.dirname(file));
      const name = titleFromSkill(content, folderName);
      const whitelisted = isWhitelisted({ name }, whitelist);
      return {
        kind: "skill" as const,
        name,
        path: file,
        descriptionZh: await inventoryDescription(`skill-v2:${file}`, "skill", name, descriptionFromSkill(content)),
        category: path.basename(path.dirname(path.dirname(file))),
        source: sourceFromPath(file),
        safety: evaluateSkillSafety({ name, url: file, cloneUrl: file, kind: "skill", whitelisted }),
        whitelisted
      };
    })
  );

  let toolEntries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }> = [];
  try {
    toolEntries = await fs.readdir(path.join(hermesRoot(), "tools"), { withFileTypes: true });
  } catch {
    toolEntries = [];
  }

  const installedTools = await Promise.all(
    toolEntries
      .filter((entry) => entry.name !== "__pycache__" && ((entry.isFile() && entry.name.endsWith(".py")) || entry.isDirectory()))
      .map(async (entry) => {
        const toolPath = path.join(hermesRoot(), "tools", entry.name);
        const name = entry.name.replace(/\.py$/i, "");
        const whitelisted = isWhitelisted({ name }, whitelist);
        return {
          kind: "tool" as const,
          name,
          path: toolPath,
          descriptionZh: await inventoryDescription(`tool-v2:${toolPath}`, "tool", name, await descriptionFromToolPath(toolPath)),
          category: entry.isDirectory() ? "directory" : "python",
          source: "tool" as const,
          safety: evaluateSkillSafety({ name, url: toolPath, cloneUrl: toolPath, kind: "tool", whitelisted }),
          whitelisted
        };
      })
  );

  return {
    recommendedSkills: recommendedItems.filter((item) => item.kind === "skill"),
    recommendedTools: recommendedItems.filter((item) => item.kind === "tool"),
    installedSkills,
    installedTools
  };
}
