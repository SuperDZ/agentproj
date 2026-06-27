import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockHermesOutput } from "@/lib/hermes/mock";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn(), pid: 1234 }))
}));

const originalEnv = { ...process.env };
const modelConfigPath = path.join(process.cwd(), ".next", "hermes", "model-config.json");

beforeEach(async () => {
  vi.clearAllMocks();
  await fs.rm(modelConfigPath, { force: true });
});

afterEach(async () => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  await fs.rm(modelConfigPath, { force: true });
});

describe("Hermes local adapter", () => {
  it("runs local Hermes CLI and parses JSON output", async () => {
    vi.resetModules();
    process.env.HERMES_MODE = "local";
    process.env.HERMES_LOCAL_ROOT = "hermes-agent";
    process.env.HERMES_LOCAL_PYTHON = "py";
    process.env.HERMES_INFERENCE_PROVIDER = "alibaba";
    process.env.HERMES_INFERENCE_MODEL = "qwen-plus";
    const output = createMockHermesOutput({ projectId: "p1", idea: "SpecFlow", industry: "devtools", targetUser: "PMs" });

    vi.mocked(execFile).mockImplementation((command, args, options, callback) => {
      expect(command).toBe("py");
      expect(args).toEqual(expect.arrayContaining(["-m", "hermes_cli.main", "--provider", "alibaba", "-z"]));
      expect(options).toMatchObject({ cwd: "hermes-agent" });
      callback?.(null, `Hermes response:\n${JSON.stringify(output)}\n`, "");
      return undefined as never;
    });

    const { hermesClient } = await import("@/lib/hermes/client");
    const result = await hermesClient.createResearchRun({
      projectId: "p1",
      idea: "SpecFlow",
      industry: "devtools",
      targetUser: "PMs"
    });

    expect(result.mode).toBe("local");
    expect(result.status).toBe("completed");
    expect(result.parsedOutput?.competitors.length).toBeGreaterThanOrEqual(7);
  });

  it("does not invent local Hermes resource call counts when logs omit usage", async () => {
    vi.resetModules();
    process.env.HERMES_MODE = "local";
    process.env.HERMES_LOCAL_ROOT = "hermes-agent";
    process.env.HERMES_LOCAL_PYTHON = "py";
    const output = createMockHermesOutput({ projectId: "p1", idea: "SpecFlow", industry: "devtools", targetUser: "PMs" });

    vi.mocked(execFile).mockImplementation((command, args, options, callback) => {
      callback?.(null, `Hermes response:\n${JSON.stringify(output)}\n`, "");
      return undefined as never;
    });

    const { hermesClient } = await import("@/lib/hermes/client");
    const result = await hermesClient.createResearchRun({
      projectId: "p1",
      idea: "SpecFlow",
      industry: "devtools",
      targetUser: "PMs",
      resourceMode: "manual",
      enabledSkills: [{ name: "market-research", path: "skills/market-research/SKILL.md" }],
      enabledTools: [{ name: "web-search", path: "tools/web_search.py" }]
    });

    expect(result.resourceUsage?.skills[0]).toMatchObject({
      name: "market-research",
      status: "not_reported",
      reason: "已传给本地 Hermes CLI，但本次 Hermes 调用日志未出现该 Skill 的真实调用记录。"
    });
    expect(result.resourceUsage?.skills[0].callCount).toBeUndefined();
    expect(result.resourceUsage?.tools[0]).toMatchObject({
      name: "web-search",
      status: "not_reported"
    });
    expect(result.resourceUsage?.tools[0].callCount).toBeUndefined();
  });

  it("parses real local Hermes tool logs and skill usage deltas", async () => {
    vi.resetModules();
    const { localResourceUsageFromLogs } = await import("@/lib/hermes/local");

    const usage = localResourceUsageFromLogs({
      projectId: "p1",
      idea: "SpecFlow",
      industry: "devtools",
      targetUser: "PMs",
      resourceMode: "manual",
      enabledSkills: [{ name: "market-research", path: "skills/market-research/SKILL.md" }],
      enabledTools: [{ name: "web_search", path: "tools/web_search.py" }]
    }, "", [
      "2026-06-25 00:00:00 INFO agent.tool_executor: tool web_search completed (1.20s, 200 chars)",
      "2026-06-25 00:00:01 INFO agent.tool_executor: tool web_search completed (0.80s, 120 chars)",
      "2026-06-25 00:00:02 WARNING agent.tool_executor: Tool terminal returned error (0.20s): denied"
    ].join("\n"), {
      "market-research": { use_count: 1, view_count: 0, patch_count: 0 }
    }, {
      "market-research": { use_count: 2, view_count: 1, patch_count: 0 }
    });

    expect(usage?.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "web_search", status: "used", callCount: 2 }),
      expect.objectContaining({ name: "terminal", status: "used", callCount: 1 })
    ]));
    expect(usage?.skills[0]).toMatchObject({ name: "market-research", status: "used", callCount: 2 });
  });

  it("normalizes saved model config and reports the same local env fallbacks used by the runner", async () => {
    vi.resetModules();
    process.env.HERMES_LOCAL_PYTHON = process.execPath;
    process.env.HERMES_LOCAL_PROVIDER = "local-provider";
    process.env.HERMES_LOCAL_MODEL = "local-model";
    process.env.HERMES_INFERENCE_PROVIDER = "inference-provider";
    process.env.HERMES_INFERENCE_MODEL = "inference-model";

    await fs.mkdir(path.dirname(modelConfigPath), { recursive: true });
    await fs.writeFile(modelConfigPath, JSON.stringify({
      provider: "  qwen  ",
      model: "  saved-model  ",
      usageMode: "unknown",
      codexCliCommand: "  codex-custom  "
    }), "utf8");

    const { getHermesStatus, readModelConfig } = await import("@/lib/hermes/control");
    await expect(readModelConfig()).resolves.toEqual({
      provider: "qwen",
      model: "saved-model",
      usageMode: "api"
    });

    await fs.rm(modelConfigPath, { force: true });
    await expect(getHermesStatus()).resolves.toMatchObject({
      localPython: process.execPath,
      pythonExists: true,
      pythonSource: "HERMES_LOCAL_PYTHON",
      provider: "local-provider",
      model: "local-model"
    });
  });

  it("uses saved model configuration for local Hermes CLI arguments", async () => {
    vi.resetModules();
    process.env.HERMES_MODE = "local";
    process.env.HERMES_LOCAL_ROOT = "hermes-agent";
    process.env.HERMES_LOCAL_PYTHON = process.execPath;
    process.env.HERMES_INFERENCE_PROVIDER = "env-provider";
    process.env.HERMES_INFERENCE_MODEL = "env-model";

    const { saveModelConfig } = await import("@/lib/hermes/control");
    await saveModelConfig({
      provider: "qwen",
      model: "saved-model"
    });

    const output = createMockHermesOutput({ projectId: "p1", idea: "SpecFlow", industry: "devtools", targetUser: "PMs" });
    vi.mocked(execFile).mockImplementation((command, args, options, callback) => {
      expect(args).toEqual(expect.arrayContaining(["--provider", "qwen", "-m", "saved-model"]));
      expect(args).not.toEqual(expect.arrayContaining(["env-provider", "env-model"]));
      callback?.(null, `Hermes response:\n${JSON.stringify(output)}\n`, "");
      return undefined as never;
    });

    const { hermesClient } = await import("@/lib/hermes/client");
    const result = await hermesClient.createResearchRun({
      projectId: "p1",
      idea: "SpecFlow",
      industry: "devtools",
      targetUser: "PMs"
    });

    expect(result.status).toBe("completed");
    expect(execFile).toHaveBeenCalledOnce();
  });

  it("defaults saved model to the selected provider when no model is provided", async () => {
    vi.resetModules();

    const { saveModelConfig } = await import("@/lib/hermes/control");
    await expect(saveModelConfig({
      provider: "qwen",
      model: ""
    })).resolves.toMatchObject({
      provider: "qwen",
      model: "qwen-plus",
      usageMode: "api"
    });
  });

  it("ignores legacy saved Codex CLI mode and keeps local Hermes on API provider settings", async () => {
    vi.resetModules();
    process.env.HERMES_MODE = "local";
    process.env.HERMES_LOCAL_PYTHON = process.execPath;

    const { saveModelConfig } = await import("@/lib/hermes/control");
    await saveModelConfig({
      provider: "codex-cli",
      model: "gpt-5.5"
    });

    const output = createMockHermesOutput({ projectId: "p1", idea: "SpecFlow", industry: "devtools", targetUser: "PMs" });
    vi.mocked(execFile).mockImplementation((command, args, options, callback) => {
      expect(args).toEqual(expect.arrayContaining(["--provider", "deepseek", "-m", "gpt-5.5"]));
      callback?.(null, `Hermes response:\n${JSON.stringify(output)}\n`, "");
      return undefined as never;
    });

    const { hermesClient } = await import("@/lib/hermes/client");
    await expect(hermesClient.createResearchRun({
      projectId: "p1",
      idea: "SpecFlow",
      industry: "devtools",
      targetUser: "PMs"
    })).resolves.toMatchObject({ status: "completed" });
    expect(execFile).toHaveBeenCalledOnce();
  });

  it("falls back to schema-valid research when local Hermes returns invalid JSON", async () => {
    vi.resetModules();
    process.env.HERMES_MODE = "local";
    process.env.HERMES_LOCAL_PYTHON = process.execPath;

    vi.mocked(execFile).mockImplementation((command, args, options, callback) => {
      callback?.(null, "{ok:true}", "");
      return undefined as never;
    });

    const { hermesClient } = await import("@/lib/hermes/client");
    const result = await hermesClient.createResearchRun({
      projectId: "p1",
      idea: "SpecFlow",
      industry: "devtools",
      targetUser: "PMs"
    });

    expect(result.status).toBe("completed_with_fallback");
    expect(result.rawOutput).toContain("localHermesFallback");
    expect(result.parsedOutput?.competitors.length).toBeGreaterThanOrEqual(7);
  });

  it("auto-starts Hermes dashboard before local project creation flow", async () => {
    vi.resetModules();
    const tempRoot = path.join(process.cwd(), ".cache", "test-hermes-root");
    await fs.mkdir(tempRoot, { recursive: true });
    process.env.HERMES_MODE = "local";
    process.env.HERMES_LOCAL_ROOT = tempRoot;
    process.env.HERMES_LOCAL_PYTHON = process.execPath;

    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stderr: EventEmitter & { unref: () => void };
      unref: () => void;
    };
    child.pid = 43210;
    child.stderr = Object.assign(new EventEmitter(), { unref: vi.fn() });
    child.unref = vi.fn();
    vi.spyOn(process, "kill").mockImplementation(((pid: number | NodeJS.Signals, signal?: NodeJS.Signals | number) => {
      if (pid === 43210) return true;
      if (signal === 0) return false;
      return true;
    }) as typeof process.kill);
    const childProcess = await import("node:child_process");
    vi.mocked(childProcess.spawn).mockReturnValue(child as never);

    const { ensureLocalHermesDashboardRunning, stopHermesDashboard } = await import("@/lib/hermes/control");
    await stopHermesDashboard();
    const result = await ensureLocalHermesDashboardRunning();

    expect(result).toMatchObject({ mode: "local", checked: true, started: true });
    expect(childProcess.spawn).toHaveBeenCalledWith(
      process.execPath,
      ["-m", "hermes_cli.main", "dashboard"],
      expect.objectContaining({ cwd: tempRoot, detached: true, windowsHide: true })
    );

    await stopHermesDashboard();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
