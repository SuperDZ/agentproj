import { execFile } from "node:child_process";
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

  it("normalizes saved model config and reports the same local env fallbacks used by the runner", async () => {
    vi.resetModules();
    process.env.HERMES_LOCAL_PYTHON = process.execPath;
    process.env.HERMES_LOCAL_PROVIDER = "local-provider";
    process.env.HERMES_LOCAL_MODEL = "local-model";
    process.env.HERMES_INFERENCE_PROVIDER = "inference-provider";
    process.env.HERMES_INFERENCE_MODEL = "inference-model";

    await fs.mkdir(path.dirname(modelConfigPath), { recursive: true });
    await fs.writeFile(modelConfigPath, JSON.stringify({
      provider: "  saved-provider  ",
      model: "  saved-model  ",
      usageMode: "unknown",
      codexCliCommand: "  codex-custom  "
    }), "utf8");

    const { getHermesStatus, readModelConfig } = await import("@/lib/hermes/control");
    await expect(readModelConfig()).resolves.toEqual({
      provider: "saved-provider",
      model: "saved-model",
      usageMode: "api",
      codexCliCommand: "codex-custom"
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
      provider: "saved-provider",
      model: "saved-model",
      usageMode: "api",
      codexCliCommand: "codex"
    });

    const output = createMockHermesOutput({ projectId: "p1", idea: "SpecFlow", industry: "devtools", targetUser: "PMs" });
    vi.mocked(execFile).mockImplementation((command, args, options, callback) => {
      expect(args).toEqual(expect.arrayContaining(["--provider", "saved-provider", "-m", "saved-model"]));
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

  it("rejects unsupported saved Codex CLI mode before spawning local Hermes CLI", async () => {
    vi.resetModules();
    process.env.HERMES_MODE = "local";
    process.env.HERMES_LOCAL_PYTHON = process.execPath;

    const { saveModelConfig } = await import("@/lib/hermes/control");
    await saveModelConfig({
      provider: "codex-cli",
      model: "gpt-5.5",
      usageMode: "codex-cli",
      codexCliCommand: "codex"
    });

    const { hermesClient } = await import("@/lib/hermes/client");
    await expect(hermesClient.createResearchRun({
      projectId: "p1",
      idea: "SpecFlow",
      industry: "devtools",
      targetUser: "PMs"
    })).rejects.toThrow("Codex CLI usage mode is saved but is not supported");
    expect(execFile).not.toHaveBeenCalled();
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

    expect(result.status).toBe("completed");
    expect(result.rawOutput).toContain("localHermesFallback");
    expect(result.parsedOutput?.competitors.length).toBeGreaterThanOrEqual(7);
  });
});
