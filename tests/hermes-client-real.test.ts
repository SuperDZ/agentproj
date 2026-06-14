import { afterEach, describe, expect, it, vi } from "vitest";
import { hermesClient } from "@/lib/hermes/client";
import { createMockHermesOutput } from "@/lib/hermes/mock";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("Hermes real adapter", () => {
  it("creates an external research run without requiring immediate output", async () => {
    process.env.HERMES_MODE = "real";
    process.env.HERMES_API_BASE_URL = "https://hermes.example";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      expect(String(url)).toBe("https://hermes.example/runs/research");
      expect(init?.method).toBe("POST");
      return Response.json({ id: "run_async_1", status: "queued" });
    });

    const result = await hermesClient.createResearchRun({
      projectId: "p1",
      idea: "SpecFlow",
      industry: "devtools",
      targetUser: "PMs"
    });

    expect(result).toMatchObject({
      hermesRunId: "run_async_1",
      mode: "real",
      status: "queued"
    });
    expect(result.parsedOutput).toBeUndefined();
  });

  it("loads final output from a configured output endpoint", async () => {
    process.env.HERMES_MODE = "real";
    process.env.HERMES_API_BASE_URL = "https://hermes.example";
    process.env.HERMES_RESEARCH_OUTPUT_PATH_TEMPLATE = "/runs/{runId}/output";
    const output = createMockHermesOutput({ projectId: "p1", idea: "SpecFlow", industry: "devtools", targetUser: "PMs" });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/runs/run_1")) {
        return Response.json({ id: "run_1", status: "completed" });
      }
      if (String(url).endsWith("/runs/run_1/output")) {
        return Response.json({ output });
      }
      throw new Error(`Unexpected URL: ${String(url)}`);
    });

    const result = await hermesClient.getRunResult("run_1");

    expect(result.status).toBe("completed");
    expect(result.parsedOutput?.competitors.length).toBeGreaterThanOrEqual(7);
  });

  it("falls back to the final output artifact in run events", async () => {
    process.env.HERMES_MODE = "real";
    process.env.HERMES_API_BASE_URL = "https://hermes.example";
    delete process.env.HERMES_RESEARCH_OUTPUT_PATH_TEMPLATE;
    const output = createMockHermesOutput({ projectId: "p1", idea: "SpecFlow", industry: "devtools", targetUser: "PMs" });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).endsWith("/runs/run_2")) {
        return Response.json({ id: "run_2", status: "completed" });
      }
      if (String(url).endsWith("/runs/run_2/events")) {
        return Response.json({ events: [{ id: "e1", artifact: { content: output } }] });
      }
      throw new Error(`Unexpected URL: ${String(url)}`);
    });

    const result = await hermesClient.getRunResult("run_2");

    expect(result.status).toBe("completed");
    expect(result.parsedOutput?.summary).toContain("SpecFlow");
  });

  it("marks completed runs without output distinctly", async () => {
    process.env.HERMES_MODE = "real";
    process.env.HERMES_API_BASE_URL = "https://hermes.example";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ id: "run_3", status: "completed" }));

    await expect(hermesClient.getRunStatus("run_3")).resolves.toBe("completed_without_output");
  });
});
