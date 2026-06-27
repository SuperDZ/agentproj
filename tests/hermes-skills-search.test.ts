import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tempRoot = "";
let previousRoot: string | undefined;
let previousCacheTtl: string | undefined;
let previousTimeout: string | undefined;

beforeEach(async () => {
  vi.resetModules();
  previousRoot = process.env.HERMES_LOCAL_ROOT;
  previousCacheTtl = process.env.HERMES_GITHUB_SEARCH_CACHE_TTL_MS;
  previousTimeout = process.env.HERMES_GITHUB_SEARCH_TIMEOUT_MS;
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-skills-"));
  process.env.HERMES_LOCAL_ROOT = tempRoot;
  process.env.HERMES_GITHUB_SEARCH_CACHE_TTL_MS = "60000";
  process.env.HERMES_GITHUB_SEARCH_TIMEOUT_MS = "50";
});

afterEach(async () => {
  vi.unstubAllGlobals();
  process.env.HERMES_LOCAL_ROOT = previousRoot;
  process.env.HERMES_GITHUB_SEARCH_CACHE_TTL_MS = previousCacheTtl;
  process.env.HERMES_GITHUB_SEARCH_TIMEOUT_MS = previousTimeout;
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

function stubGithubSearch() {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    headers: new Headers(),
    json: async () => ({
      items: [
        {
          full_name: "community/example-skills",
          description: "Community skill collection",
          stargazers_count: 120,
          html_url: "https://github.com/community/example-skills",
          clone_url: "https://github.com/community/example-skills.git",
          updated_at: "2026-01-01T00:00:00Z",
          pushed_at: "2026-01-01T00:00:00Z",
          archived: false,
          disabled: false
        },
        {
          full_name: "abandoned/unsafe-skills",
          description: "Archived skills",
          stargazers_count: 2,
          html_url: "https://github.com/abandoned/unsafe-skills",
          clone_url: "https://github.com/abandoned/unsafe-skills.git",
          updated_at: "2020-01-01T00:00:00Z",
          pushed_at: "2020-01-01T00:00:00Z",
          archived: true,
          disabled: false
        }
      ]
    })
  })));
}

describe("Hermes skills search safety policy", () => {
  it("returns source, stars, and conservative safety status for GitHub skills", async () => {
    stubGithubSearch();
    const { searchGithubSkills } = await import("@/lib/hermes/control");

    const results = await searchGithubSkills("agent skills");

    expect(results[0]).toMatchObject({
      kind: "skill",
      name: "community/example-skills",
      stars: 120,
      url: "https://github.com/community/example-skills",
      cloneUrl: "https://github.com/community/example-skills.git",
      whitelisted: false,
      safety: { status: "unreviewed", label: "未经过本地白名单审查" }
    });
    expect(results[1].safety.status).toBe("failed");
    expect(results[1].safety.label).toBe("未通过安全检查");
  });

  it("marks local whitelist entries as passed and persists them under Hermes root", async () => {
    stubGithubSearch();
    const { addSkillWhitelist, readSkillWhitelist, searchGithubSkills } = await import("@/lib/hermes/control");

    await addSkillWhitelist({
      name: "community/example-skills",
      url: "https://github.com/community/example-skills",
      cloneUrl: "https://github.com/community/example-skills.git",
      kind: "skill"
    });
    const whitelist = await readSkillWhitelist();
    const results = await searchGithubSkills("agent skills");

    expect(whitelist[0].name).toBe("community/example-skills");
    expect(results[0].whitelisted).toBe(true);
    expect(results[0].safety.status).toBe("passed");
    await expect(fs.access(path.join(tempRoot, "skills", "safety-whitelist.json"))).resolves.toBeUndefined();
  });

  it("uses cached GitHub search results within the configured TTL", async () => {
    stubGithubSearch();
    const { searchGithubSkills } = await import("@/lib/hermes/control");

    await searchGithubSkills("agent skills");
    await searchGithubSkills("agent skills");

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns a clear rate limit error when GitHub search is exhausted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 403,
      headers: new Headers({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1767225600"
      })
    })));
    const { searchGithubSkills } = await import("@/lib/hermes/control");

    await expect(searchGithubSkills("agent skills")).rejects.toThrow("GitHub search rate limit exceeded");
  });

  it("times out slow GitHub search requests", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      const signal = (init as RequestInit).signal;
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    const { searchGithubSkills } = await import("@/lib/hermes/control");

    await expect(searchGithubSkills("agent skills")).rejects.toThrow("GitHub search timed out after 50ms");
  });
});
