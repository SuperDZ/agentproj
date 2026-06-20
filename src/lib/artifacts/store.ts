import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { logEvent, recordMetric } from "@/lib/observability";

export type ArtifactPayload = {
  projectId: string;
  artifactType: string;
  filename: string;
  content: string | Buffer;
  mimeType?: string;
  generatedArtifactId?: string;
  forceFile?: boolean;
};

export function artifactStorageRoot() {
  return path.resolve(process.cwd(), process.env.ARTIFACT_STORAGE_DIR || ".data/artifacts");
}

export function artifactInlineMaxBytes() {
  const value = Number(process.env.ARTIFACT_INLINE_MAX_BYTES ?? 262_144);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 262_144;
}

export function mimeTypeFor(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json")) return "application/json;charset=utf-8";
  if (lower.endsWith(".md")) return "text/markdown;charset=utf-8";
  if (lower.endsWith(".txt")) return "text/plain;charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml;charset=utf-8";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (lower.endsWith(".doc") || lower.endsWith(".html")) return "text/html;charset=utf-8";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

function safeFilename(filename: string) {
  return filename.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 140) || "artifact.bin";
}

function bufferFromContent(content: string | Buffer) {
  return Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
}

function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

function preview(content: string | Buffer) {
  if (Buffer.isBuffer(content)) return undefined;
  return content.slice(0, 1000);
}

function localPathFromStorageKey(storageKey: string) {
  const root = artifactStorageRoot();
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(root)) throw new Error("Artifact storage key escaped storage root.");
  return target;
}

export async function putArtifact(input: ArtifactPayload) {
  const data = bufferFromContent(input.content);
  const sizeBytes = data.byteLength;
  const mimeType = input.mimeType || mimeTypeFor(input.filename);
  const checksumSha256 = sha256(data);
  const shouldStoreInDb = !input.forceFile && typeof input.content === "string" && sizeBytes <= artifactInlineMaxBytes();
  const startedAt = Date.now();

  try {
    if (shouldStoreInDb) {
      const generatedArtifact = input.generatedArtifactId
        ? await prisma.generatedArtifact.findUniqueOrThrow({ where: { id: input.generatedArtifactId } })
        : await prisma.generatedArtifact.create({
          data: {
            projectId: input.projectId,
            artifactType: input.artifactType,
            content: input.content as string
          }
        });

      const stored = await prisma.storedArtifact.create({
        data: {
          projectId: input.projectId,
          generatedArtifactId: generatedArtifact.id,
          artifactType: input.artifactType,
          filename: safeFilename(input.filename),
          mimeType,
          storageKind: "database",
          storageKey: `generated:${generatedArtifact.id}`,
          sizeBytes,
          checksumSha256,
          textPreview: input.content as string
        }
      });
      await recordArtifactWrite(input.projectId, input.artifactType, "database", sizeBytes, Date.now() - startedAt);
      return stored;
    }

    const id = randomUUID();
    const filename = safeFilename(input.filename);
    const storageKey = path.join(input.projectId, id, filename).replace(/\\/g, "/");
    const target = localPathFromStorageKey(storageKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);

    const stored = await prisma.storedArtifact.create({
      data: {
        id,
        projectId: input.projectId,
        generatedArtifactId: input.generatedArtifactId,
        artifactType: input.artifactType,
        filename,
        mimeType,
        storageKind: "local",
        storageKey,
        sizeBytes,
        checksumSha256,
        textPreview: preview(input.content)
      }
    });
    await recordArtifactWrite(input.projectId, input.artifactType, "local", sizeBytes, Date.now() - startedAt);
    return stored;
  } catch (error) {
    await logEvent({
      level: "error",
      source: "artifact-store",
      eventType: "artifact.write_failed",
      message: error instanceof Error ? error.message : "Artifact write failed.",
      projectId: input.projectId,
      metadata: { artifactType: input.artifactType, filename: input.filename, sizeBytes }
    });
    throw error;
  }
}

async function recordArtifactWrite(projectId: string, artifactType: string, storageKind: string, sizeBytes: number, latencyMs: number) {
  await logEvent({
    source: "artifact-store",
    eventType: "artifact.write",
    message: `Stored ${artifactType} artifact.`,
    projectId,
    metadata: { artifactType, storageKind, sizeBytes, latencyMs }
  });
  await recordMetric({
    name: "artifact.write.bytes",
    value: sizeBytes,
    unit: "bytes",
    tags: { artifactType, storageKind }
  });
}

export async function listProjectArtifacts(projectId: string) {
  return prisma.storedArtifact.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" }
  });
}

export async function getArtifactDownload(artifactId: string) {
  const startedAt = Date.now();
  const artifact = await prisma.storedArtifact.findUniqueOrThrow({
    where: { id: artifactId },
    include: { generatedArtifact: true }
  });

  let data: Buffer;
  if (artifact.storageKind === "database") {
    const content = artifact.generatedArtifact?.content ?? artifact.textPreview ?? "";
    data = Buffer.from(content, "utf8");
  } else {
    data = await fs.readFile(localPathFromStorageKey(artifact.storageKey));
  }

  await logEvent({
    source: "artifact-store",
    eventType: "artifact.download",
    message: `Downloaded ${artifact.artifactType} artifact.`,
    projectId: artifact.projectId,
    metadata: {
      artifactId: artifact.id,
      artifactType: artifact.artifactType,
      storageKind: artifact.storageKind,
      sizeBytes: data.byteLength,
      latencyMs: Date.now() - startedAt
    }
  });
  await recordMetric({
    name: "artifact.download.bytes",
    value: data.byteLength,
    unit: "bytes",
    tags: { artifactType: artifact.artifactType, storageKind: artifact.storageKind }
  });
  return { artifact, data };
}

export async function deleteProjectStoredArtifacts(projectId: string) {
  return deleteStoredArtifacts(projectId, undefined, "artifact.project_cleanup");
}

export async function deleteProjectStoredArtifactsByTypes(projectId: string, artifactTypes: string[]) {
  if (artifactTypes.length === 0) return { count: 0 };
  return deleteStoredArtifacts(projectId, artifactTypes, "artifact.type_cleanup");
}

async function deleteStoredArtifacts(projectId: string, artifactTypes: string[] | undefined, eventType: string) {
  const where = artifactTypes ? { projectId, artifactType: { in: artifactTypes } } : { projectId };
  const artifacts = await prisma.storedArtifact.findMany({ where });
  const root = artifactStorageRoot();
  await Promise.allSettled(
    artifacts
      .filter((artifact) => artifact.storageKind === "local")
      .map(async (artifact) => {
        const target = localPathFromStorageKey(artifact.storageKey);
        if (target.startsWith(root)) await fs.rm(path.dirname(target), { recursive: true, force: true });
      })
  );
  const result = await prisma.storedArtifact.deleteMany({ where });
  await logEvent({
    source: "artifact-store",
    eventType,
    message: `Deleted stored artifacts for project ${projectId}.`,
    projectId,
    metadata: { count: result.count, artifactTypes }
  });
  return result;
}
