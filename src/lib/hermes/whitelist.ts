import fs from "node:fs/promises";
import path from "node:path";
import type { SkillWhitelistEntry } from "@/lib/skills/skill-types";

export function hermesRoot() {
  return process.env.HERMES_LOCAL_ROOT || "hermes-agent";
}

function whitelistFile() {
  return path.join(/*turbopackIgnore: true*/ hermesRoot(), "skills", "safety-whitelist.json");
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

function sameWhitelistEntry(left: SkillWhitelistEntry, right: Pick<SkillWhitelistEntry, "name" | "url" | "cloneUrl">) {
  return left.name === right.name || (!!left.url && left.url === right.url) || (!!left.cloneUrl && left.cloneUrl === right.cloneUrl);
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
