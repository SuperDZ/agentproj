"use client";

import { useMemo, useRef, useState } from "react";
import type { CodexPackFile } from "@/lib/export/codex-pack";
import { packToClipboardText } from "@/lib/export/codex-pack";

export function CodexPackActions({ files }: { files: CodexPackFile[] }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fullPack = useMemo(() => packToClipboardText(files), [files]);

  async function copyFullPack() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API unavailable.");
      await navigator.clipboard.writeText(fullPack);
      setCopyState("copied");
    } catch {
      textareaRef.current?.focus();
      textareaRef.current?.select();
      setCopyState("failed");
    } finally {
      window.setTimeout(() => setCopyState("idle"), 2200);
    }
  }

  function downloadFile(file: CodexPackFile) {
    const blob = new Blob([file.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copyFullPack} className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-950">
          {copyState === "copied" ? "Copied" : "Copy full pack"}
        </button>
        {files.map((file) => (
          <button key={file.filename} type="button" onClick={() => downloadFile(file)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800">
            Download {file.filename}
          </button>
        ))}
      </div>
      {copyState === "failed" && <p className="mt-2 text-sm text-amber-200">Clipboard access failed. The full pack text is selected below so you can copy it manually.</p>}
      <textarea ref={textareaRef} readOnly rows={8} className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs" value={fullPack} />
    </div>
  );
}
