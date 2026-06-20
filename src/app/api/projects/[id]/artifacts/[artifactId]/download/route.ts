import { getArtifactDownload } from "@/lib/artifacts/store";
import { handleApiError, jsonError } from "@/lib/api/errors";

function contentDisposition(filename: string) {
  const fallback = filename.replace(/[^\w.\-\u4e00-\u9fff]+/g, "-") || "artifact";
  return `attachment; filename*=UTF-8''${encodeURIComponent(fallback)}`;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string; artifactId: string }> }) {
  try {
    const { id, artifactId } = await params;
    const { artifact, data } = await getArtifactDownload(artifactId);
    if (artifact.projectId !== id) return jsonError("Resource not found", 404);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": artifact.mimeType,
        "content-length": String(data.byteLength),
        "content-disposition": contentDisposition(artifact.filename)
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
