import { execFile } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockHermesOutput } from "@/lib/hermes/mock";

vi.mock("node:child_process", () => ({
  execFile: vi.fn()
}));

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("Hermes local adapter", () => {
  it("runs local Hermes CLI and parses JSON output", async () => {
    vi.resetModules();
    process.env.HERMES_MODE = "local";
    process.env.HERMES_LOCAL_ROOT = "hermes-agent";
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

  it("falls back to schema-valid research when local Hermes returns invalid JSON", async () => {
    vi.resetModules();
    process.env.HERMES_MODE = "local";

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
