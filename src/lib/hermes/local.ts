import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hermesPython, readModelConfig, type HermesModelConfig } from "./control";
import { createMockHermesOutput } from "./mock";
import { parseHermesResearchOutput } from "./parser";
import type { CreatePlanningRunInput, CreateResearchRunInput, HermesPlanningOutput, HermesRunResult } from "./types";

function localHermesRoot() {
  return process.env.HERMES_LOCAL_ROOT || "hermes-agent";
}

function localHermesTimeoutMs() {
  const value = Number(process.env.HERMES_LOCAL_TIMEOUT_MS ?? 180_000);
  return Number.isFinite(value) && value > 0 ? value : 180_000;
}

function localHermesLogDeltaMaxBytes() {
  const value = Number(process.env.HERMES_AGENT_LOG_DELTA_MAX_BYTES ?? 512 * 1024);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 512 * 1024;
}

function localHermesProvider(config: HermesModelConfig) {
  return config.provider || process.env.HERMES_LOCAL_PROVIDER || process.env.HERMES_INFERENCE_PROVIDER;
}

function localHermesModel(config: HermesModelConfig) {
  return config.model || process.env.HERMES_LOCAL_MODEL || process.env.HERMES_INFERENCE_MODEL;
}

function withLocalPythonPath(root: string) {
  const current = process.env.PYTHONPATH;
  const delimiter = process.platform === "win32" ? ";" : ":";
  return current ? `${root}${delimiter}${current}` : root;
}

type SkillUsageSnapshot = Record<string, { use_count?: number; view_count?: number; patch_count?: number }>;

type LocalUsageSnapshot = {
  agentLogPath: string;
  agentLogSize: number;
  skillUsage: SkillUsageSnapshot;
};

function hermesHome() {
  return process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
}

function agentLogPath() {
  return path.join(hermesHome(), "logs", "agent.log");
}

function skillUsagePath() {
  return path.join(hermesHome(), "skills", ".usage.json");
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function captureLocalUsageSnapshot(): Promise<LocalUsageSnapshot> {
  const logPath = agentLogPath();
  let agentLogSize = 0;
  try {
    agentLogSize = (await fs.stat(logPath)).size;
  } catch {
    agentLogSize = 0;
  }
  return {
    agentLogPath: logPath,
    agentLogSize,
    skillUsage: await readJsonFile<SkillUsageSnapshot>(skillUsagePath(), {})
  };
}

async function readAgentLogDelta(snapshot: LocalUsageSnapshot) {
  try {
    const handle = await fs.open(snapshot.agentLogPath, "r");
    try {
      const stat = await handle.stat();
      if (stat.size <= snapshot.agentLogSize) return "";
      const growth = stat.size - snapshot.agentLogSize;
      const length = Math.min(growth, localHermesLogDeltaMaxBytes());
      const position = stat.size - length;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, position);
      return buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}

function increment(map: Map<string, number>, name: string) {
  const normalized = name.trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function parseToolUsageFromText(text: string) {
  const counts = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    const completed = line.match(/\btool\s+([A-Za-z0-9_.:-]+)\s+(?:completed|failed|returned error)\b/i);
    if (completed?.[1]) increment(counts, completed[1]);

    const cliStarted = line.match(/(?:📞\s*)?Tool\s+\d+\s*:\s*([A-Za-z0-9_.:-]+)\s*\(/i);
    if (cliStarted?.[1]) increment(counts, cliStarted[1]);

    const structured = line.match(/"tool(?:Name|_name)"\s*:\s*"([^"]+)"/i);
    if (structured?.[1]) increment(counts, structured[1]);
  }
  return counts;
}

function activityCount(value: { use_count?: number; view_count?: number; patch_count?: number } | undefined) {
  return Number(value?.use_count ?? 0) + Number(value?.view_count ?? 0) + Number(value?.patch_count ?? 0);
}

function diffSkillUsage(before: SkillUsageSnapshot, after: SkillUsageSnapshot) {
  const counts = new Map<string, number>();
  for (const [name, record] of Object.entries(after)) {
    const delta = activityCount(record) - activityCount(before[name]);
    if (delta > 0) counts.set(name, delta);
  }
  return counts;
}

function usageItemsFromCounts(counts: Map<string, number>) {
  return Array.from(counts.entries()).map(([name, callCount]) => ({
    name,
    callCount,
    status: "used" as const,
    reason: "来自本次本地 Hermes 调用日志。"
  }));
}

function notReportedItems(
  inputItems: Array<{ name: string; path?: string; purpose?: string[] }> | undefined,
  observed: Map<string, number>,
  reason: string
) {
  return (inputItems ?? [])
    .filter((item) => !observed.has(item.name))
    .map((item) => ({ ...item, status: "not_reported" as const, reason }));
}

export function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  if (start < 0) throw new Error("Local Hermes did not return a JSON object.");

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }

  throw new Error("Local Hermes returned incomplete JSON.");
}

function buildLocalHermesPrompt(input: CreateResearchRunInput) {
  return [
    "执行精炼的竞品研究和产品差异化分析，只返回合法 JSON（JavaScript Object Notation，结构化数据格式），不要返回 Markdown、解释文字或代码块。",
    "只基于本次输入的项目命题、解释、行业、目标用户和技术栈进行分析。不得引用、延续或复用任何历史项目、历史会话、缓存结果或记忆内容。",
    "除关键专业名词、公司名、产品名、API、URL、模型名、开源项目名外，所有字段内容必须使用中文。关键专业名词第一次出现时写成：英文（中文注释）。例如：PRD（产品需求文档）、PDRS（产品决策评分）、Codex Pack（编码任务包）、MVP（最小可行产品）、API（应用程序接口）。",
    "必需顶层字段：query_keywords, summary, competitors, differentiation, prd, codex_pack_seed, monitor_plan。",
    "competitors 至少 7 项。每项必须包含 name,type,url,description,core_features,strengths,weaknesses,reusable_ideas,threat_level,reuse_strategy。",
    "type 只能是 open_source, commercial, internal_tool, alternative。",
    "reuse_strategy 只能是 reuse, fork, reference_only, avoid, unknown。",
    "differentiation 必须包含 redundancy_risk,differentiation_score,should_build,mvp_reframe,must_have_features,should_not_build_features,reuse_strategy。",
    "monitor_plan 必须包含 what_to_monitor,metrics,competitor_drift_signals,hermes_cron_suggestion,suggested_schedule,next_iteration_actions。",
    "所有 URL 必须是绝对地址。所有分数必须是 0-100 的整数。",
    input.financialSuitability ? "加入金融适当性、风险揭示、可解释性和不得承诺收益的边界。" : "",
    `命题：${input.idea}`,
    input.explanation ? `解释：${input.explanation}` : "",
    `行业：${input.industry}`,
    `目标用户：${input.targetUser}`,
    `技术栈：${input.preferredTechStack || "未指定"}`,
    input.resourceMode === "auto" ? "Hermes 资源模式：自主决定本次调研使用哪些 Skills 和 Tools，不接收详细配置页启用项。" : "",
    input.resourceMode === "manual" && input.enabledSkills?.length ? `详细配置启用 Skills：${input.enabledSkills.map((item) => item.name).join(", ")}` : "",
    input.resourceMode === "manual" && input.enabledTools?.length ? `详细配置启用 Tools：${input.enabledTools.map((item) => item.name).join(", ")}` : ""
  ].filter(Boolean).join("\n");
}

export function localResourceUsageFromLogs(input: CreateResearchRunInput, rawCliOutput: string, agentLogDelta: string, beforeUsage: SkillUsageSnapshot = {}, afterUsage: SkillUsageSnapshot = {}): HermesRunResult["resourceUsage"] {
  const toolCounts = parseToolUsageFromText(`${rawCliOutput}\n${agentLogDelta}`);
  const skillCounts = diffSkillUsage(beforeUsage, afterUsage);
  const manual = input.resourceMode === "manual";
  const missingManualSkillReason = "已传给本地 Hermes CLI，但本次 Hermes 调用日志未出现该 Skill 的真实调用记录。";
  const missingManualToolReason = "已传给本地 Hermes CLI，但本次 Hermes 调用日志未出现该 Tool 的真实调用记录。";
  return {
    mode: input.resourceMode === "auto" ? "auto" : "manual",
    skills: [
      ...usageItemsFromCounts(skillCounts),
      ...(manual ? notReportedItems(input.enabledSkills, skillCounts, missingManualSkillReason) : [])
    ].concat(!manual && skillCounts.size === 0 ? [{ name: "local-hermes-auto-skill-selection", status: "not_reported" as const, reason: "本地 Hermes 自主选择；当前 CLI 未返回具体 Skill 列表和调用次数。" }] : []),
    tools: [
      ...usageItemsFromCounts(toolCounts),
      ...(manual ? notReportedItems(input.enabledTools, toolCounts, missingManualToolReason) : [])
    ].concat(!manual && toolCounts.size === 0 ? [{ name: "local-hermes-auto-tool-selection", status: "not_reported" as const, reason: "本地 Hermes 自主选择；当前 CLI 未返回具体 Tool 列表和调用次数。" }] : []),
    raw: {
      source: "local-hermes-logs",
      agentLogPath: agentLogPath(),
      parsedAgentLogBytes: agentLogDelta.length,
      parsedCliOutputBytes: rawCliOutput.length
    }
  };
}

function buildLocalPlanningPrompt(input: CreatePlanningRunInput) {
  return [
    "你是资深产品经理。只返回合法 JSON 对象，不要返回 Markdown、解释文字或代码块。",
    "任务：根据创建项目时用户输入的两块内容，真实分析并生成项目规划建议、确认问题与用户、建议的 3-5 个核心功能。",
    "两块输入分别是：1. 项目命题 idea；2. 补充解释 explanation。industry 和 targetUser 如果是 auto，只能作为未知信息处理，不能原样写入输出。",
    "必须只基于本次输入分析。不得引用、延续或复用任何历史项目、历史会话、缓存结果或记忆内容。",
    "输出 JSON 字段必须严格为：pmPlanningAdvice, problemAndUsers, coreFeatures。",
    "pmPlanningAdvice 必须是中文字符串，包含：对命题的理解、关键假设、验证优先级、研究注意事项。",
    "problemAndUsers 必须是中文字符串，明确真实问题、目标用户或用户角色；如果用户角色只能推断，必须写明“推断”。",
    "coreFeatures 必须是 3 到 5 个中文字符串组成的数组，必须是该项目自身的产品核心功能，不能写成系统流程、Hermes、PRD、PDRS、竞品矩阵等平台模块名。",
    "禁止输出空泛功能，例如：用户问题确认、竞品对比、风险边界，除非它们就是该项目本身面向终端用户的功能。",
    `项目命题 idea：${input.idea}`,
    input.explanation ? `补充解释 explanation：${input.explanation}` : "补充解释 explanation：未填写",
    `行业 industry：${input.industry || "auto"}`,
    `目标用户 targetUser：${input.targetUser || "auto"}`,
    input.recommendedSkills?.length ? `项目级推荐 Skills：${input.recommendedSkills.map((item) => item.name).join(", ")}` : "",
    input.recommendedTools?.length ? `项目级推荐 Tools：${input.recommendedTools.map((item) => item.name).join(", ")}` : ""
  ].join("\n");
}

async function runLocalHermesCli(prompt: string) {
  const { execFile } = await import("node:child_process");
  const root = localHermesRoot();
  const command = hermesPython();
  const args = ["-m", "hermes_cli.main"];
  const config = await readModelConfig();
  const provider = localHermesProvider(config);
  const model = localHermesModel(config);
  if (provider) args.push("--provider", provider);
  if (model) args.push("-m", model);
  args.push("-z", prompt, "--ignore-user-config", "--ignore-rules");

  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(command, args, {
      cwd: root,
      env: { ...process.env, PYTHONPATH: withLocalPythonPath(root) },
      timeout: localHermesTimeoutMs(),
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr || stdout || error.message;
        reject(new Error(`Local Hermes CLI failed. command=${command} cwd=${root} detail=${detail}`));
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function objectFromText(value: unknown, fallbackKey: string) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return { [fallbackKey]: String(value ?? "") };
}

function numberFromValue(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(100, Math.round(parsed)));
  }
  return fallback;
}

function stringFromValue(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) return value.map((item) => String(item)).join("; ");
  if (value && typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "Build, with differentiation and staged validation." : "Do not build without reframing.";
  return fallback;
}

function arrayFromValue(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value];
  return fallback;
}

function arrayFromPlanningValue(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\r?\n|[,;，；、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeLocalPlanningOutput(value: unknown): HermesPlanningOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Local Hermes planning output must be a JSON object.");
  }

  const record = value as Record<string, unknown>;
  const pmPlanningAdvice = stringFromValue(record.pmPlanningAdvice ?? record.planning_advice, "").trim();
  const problemAndUsers = stringFromValue(record.problemAndUsers ?? record.problem_and_users, "").trim();
  const coreFeatures = arrayFromPlanningValue(record.coreFeatures ?? record.core_features ?? record.features).slice(0, 5);

  if (!pmPlanningAdvice) throw new Error("Local Hermes planning output missing pmPlanningAdvice.");
  if (!problemAndUsers) throw new Error("Local Hermes planning output missing problemAndUsers.");
  if (coreFeatures.length < 3 || coreFeatures.length > 5) throw new Error("Local Hermes planning output coreFeatures must contain 3-5 items.");

  return { pmPlanningAdvice, problemAndUsers, coreFeatures };
}

function normalizeLocalHermesOutput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const output = { ...(value as Record<string, unknown>) };
  output.summary = stringFromValue(output.summary, "Local Hermes completed the research run.");
  const differentiation = output.differentiation;

  if (differentiation && typeof differentiation === "object" && !Array.isArray(differentiation)) {
    const d = { ...(differentiation as Record<string, unknown>) };
    d.redundancy_risk = numberFromValue(d.redundancy_risk, 50);
    d.differentiation_score = numberFromValue(d.differentiation_score, 50);
    d.should_build = stringFromValue(d.should_build, "仅在差异化明确且可以分阶段验证时建设。");
    d.mvp_reframe = stringFromValue(d.mvp_reframe, "围绕具体、可验证、具备竞品意识的工作流重构 MVP（最小可行产品）。");
    d.must_have_features = arrayFromValue(d.must_have_features, ["竞品研究", "PRD（产品需求文档）生成", "PDRS（产品决策评分）", "Codex Pack（编码任务包）导出"]);
    d.should_not_build_features = arrayFromValue(d.should_not_build_features, ["通用应用生成器", "未经审查的第三方技能自动执行"]);
    d.reuse_strategy = arrayFromValue(d.reuse_strategy, ["reference_only"]);
    output.differentiation = d;
  }

  output.prd = objectFromText(output.prd, "summary");
  output.codex_pack_seed = objectFromText(output.codex_pack_seed, "summary");
  const monitorPlan = output.monitor_plan;
  if (monitorPlan && typeof monitorPlan === "object" && !Array.isArray(monitorPlan)) {
    const plan = { ...(monitorPlan as Record<string, unknown>) };
    plan.what_to_monitor = arrayFromValue(plan.what_to_monitor, ["竞品发布", "功能重叠", "定位变化"]);
    plan.metrics = arrayFromValue(plan.metrics, ["功能重叠度", "威胁等级", "差异化漂移分数"]);
    plan.competitor_drift_signals = arrayFromValue(plan.competitor_drift_signals, ["竞品新增 PRD（产品需求文档）导出", "竞品新增研究工作流"]);
    plan.hermes_cron_suggestion = stringFromValue(plan.hermes_cron_suggestion, "每周运行一次竞品扫描。");
    plan.suggested_schedule = stringFromValue(plan.suggested_schedule, "0 9 * * 1");
    plan.next_iteration_actions = arrayFromValue(plan.next_iteration_actions, ["刷新竞品矩阵", "重新计算 PDRS（产品决策评分）", "修订 Codex Pack（编码任务包）"]);
    output.monitor_plan = plan;
  }
  return output;
}

export async function createLocalResearchRun(input: CreateResearchRunInput): Promise<HermesRunResult> {
  const hermesRunId = `local_${randomUUID()}`;
  const usageBefore = await captureLocalUsageSnapshot();
  const { stdout, stderr } = await runLocalHermesCli(buildLocalHermesPrompt(input));
  const rawCliOutput = stdout || stderr;
  const [agentLogDelta, usageAfter] = await Promise.all([
    readAgentLogDelta(usageBefore),
    readJsonFile<SkillUsageSnapshot>(skillUsagePath(), {})
  ]);
  const resourceUsage = localResourceUsageFromLogs(input, rawCliOutput, agentLogDelta, usageBefore.skillUsage, usageAfter);

  try {
    const json = extractJsonObject(rawCliOutput);
    const normalizedOutput = normalizeLocalHermesOutput(JSON.parse(json));
    const parsedOutput = parseHermesResearchOutput(normalizedOutput);

    return {
      hermesRunId,
      mode: "local",
      status: "completed",
      rawOutput: json,
      parsedOutput,
      resourceUsage
    };
  } catch (error) {
    const parsedOutput = createMockHermesOutput(input);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      hermesRunId,
      mode: "local",
      status: "completed_with_fallback",
      rawOutput: JSON.stringify({
        localHermesFallback: true,
        reason: errorMessage,
        cliOutput: rawCliOutput,
        fallbackOutput: parsedOutput
      }, null, 2),
      parsedOutput,
      resourceUsage
    };
  }
}

export async function createLocalPlanningRun(input: CreatePlanningRunInput): Promise<HermesPlanningOutput> {
  const { stdout, stderr } = await runLocalHermesCli(buildLocalPlanningPrompt(input));
  const rawCliOutput = stdout || stderr;
  const json = extractJsonObject(rawCliOutput);
  return normalizeLocalPlanningOutput(JSON.parse(json));
}
