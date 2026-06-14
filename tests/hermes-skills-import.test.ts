import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFile: vi.fn()
  };
});

let tempRoot = "";
let previousRoot: string | undefined;
let previousPython: string | undefined;

beforeEach(async () => {
  vi.resetModules();
  vi.mocked(execFile).mockReset();
  previousRoot = process.env.HERMES_LOCAL_ROOT;
  previousPython = process.env.HERMES_LOCAL_PYTHON;
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-import-"));
  process.env.HERMES_LOCAL_ROOT = tempRoot;
  process.env.HERMES_LOCAL_PYTHON = "python";
  vi.mocked(execFile).mockImplementation((_command, _args, _options, callback) => {
    callback?.(null, "installed", "");
    return undefined as never;
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  process.env.HERMES_LOCAL_ROOT = previousRoot;
  process.env.HERMES_LOCAL_PYTHON = previousPython;
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

async function postImport(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/hermes/skills/import/route");
  return POST(new Request("http://localhost/api/hermes/skills/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }));
}

describe("/api/hermes/skills/import whitelist policy", () => {
  it("rejects an unwhitelisted source before installing", async () => {
    const response = await postImport({
      name: "community/example-skills",
      url: "https://github.com/community/example-skills",
      cloneUrl: "https://github.com/community/example-skills.git",
      identifier: "community/example-skills"
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain("请先人工复核并加入白名单");
    expect(execFile).not.toHaveBeenCalled();
  });

  it("allows a whitelisted source and invokes Hermes install", async () => {
    const { addSkillWhitelist } = await import("@/lib/hermes/control");
    await addSkillWhitelist({
      name: "community/example-skills",
      url: "https://github.com/community/example-skills",
      cloneUrl: "https://github.com/community/example-skills.git",
      kind: "skill"
    });

    const response = await postImport({
      name: "community/example-skills",
      url: "https://github.com/community/example-skills",
      cloneUrl: "https://github.com/community/example-skills.git",
      identifier: "community/example-skills"
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ mode: "hermes-cli", stdout: "installed" });
    expect(execFile).toHaveBeenCalledWith(
      "python",
      ["-m", "hermes_cli.main", "skills", "install", "community/example-skills", "--category", "imported", "--yes"],
      expect.objectContaining({ cwd: tempRoot }),
      expect.any(Function)
    );
  });

  it("rejects a failed source even if the source was previously whitelisted", async () => {
    const { addSkillWhitelist } = await import("@/lib/hermes/control");
    await addSkillWhitelist({
      name: "abandoned/unsafe-skills",
      url: "https://github.com/abandoned/unsafe-skills",
      cloneUrl: "https://github.com/abandoned/unsafe-skills.git",
      kind: "skill"
    });

    const response = await postImport({
      name: "abandoned/unsafe-skills",
      url: "https://github.com/abandoned/unsafe-skills",
      cloneUrl: "https://github.com/abandoned/unsafe-skills.git",
      identifier: "abandoned/unsafe-skills",
      safetyStatus: "failed"
    });
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain("未通过安全检查");
    expect(execFile).not.toHaveBeenCalled();
  });
});
