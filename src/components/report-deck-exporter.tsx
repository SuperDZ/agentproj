"use client";

import { useState } from "react";
import type PptxGenJS from "pptxgenjs";

type ReportDeckPackage = {
  prompt: string;
  deckTitle: string;
  slides: Array<{ title: string; bullets?: string[]; speakerNotes?: string; content?: string }>;
  manuscript: string;
};

type ReportDeckExporterProps = {
  endpoint: string;
  filenameBase: string;
  disabled?: boolean;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

type OutputHandles = {
  pptx: FileSystemFileHandle;
  manuscript: FileSystemFileHandle;
  prompt: FileSystemFileHandle;
};

export function ReportDeckExporter({ endpoint, filenameBase, disabled }: ReportDeckExporterProps) {
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function exportDeck() {
    setStatus("running");
    setMessage("正在准备导出目录。");

    try {
      const outputHandles = await prepareOutputHandles(filenameBase);
      setMessage(outputHandles ? "正在生成汇报材料。" : "浏览器不支持选择文件夹，正在改为下载文件。");

      const response = await fetch(endpoint, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "汇报材料生成失败。");

      await writePackage(payload.package as ReportDeckPackage, outputHandles);
      setStatus("success");
      setMessage(outputHandles ? "已写入 PPT、PPT prompt 和 Word 讲稿。" : "已触发 PPT、PPT prompt 和 Word 讲稿下载。");
    } catch (error) {
      setStatus("error");
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessage("已取消文件夹选择。");
        return;
      }
      setMessage(error instanceof Error ? error.message : "汇报材料导出失败。");
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={exportDeck}
        disabled={disabled || status === "running"}
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        {status === "running" ? "生成中..." : "导出 PPT"}
      </button>
      {status !== "idle" && (
        <p className={status === "error" ? "text-sm text-rose-700" : "text-sm text-blue-700"}>{message}</p>
      )}
    </div>
  );
}

async function prepareOutputHandles(filenameBase: string): Promise<OutputHandles | undefined> {
  const directoryPicker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!directoryPicker) return undefined;

  const directory = await directoryPicker();
  const baseName = safeFilename(filenameBase || "report-deck");

  return {
    pptx: await directory.getFileHandle(`${baseName}.pptx`, { create: true }),
    manuscript: await directory.getFileHandle(`${baseName}-讲稿.doc`, { create: true }),
    prompt: await directory.getFileHandle(`${baseName}-Hermes-PPT-prompt.txt`, { create: true })
  };
}

async function writePackage(reportPackage: ReportDeckPackage, outputHandles?: OutputHandles) {
  const pptxBlob = await createPptxBlob(reportPackage);
  const manuscriptBlob = new Blob([wordHtml(reportPackage)], { type: "application/msword;charset=utf-8" });
  const promptBlob = new Blob([reportPackage.prompt], { type: "text/plain;charset=utf-8" });

  if (outputHandles) {
    await writeFile(outputHandles.pptx, pptxBlob);
    await writeFile(outputHandles.manuscript, manuscriptBlob);
    await writeFile(outputHandles.prompt, promptBlob);
    return;
  }

  const baseName = safeFilename(reportPackage.deckTitle || "report-deck");
  download(`${baseName}.pptx`, pptxBlob);
  download(`${baseName}-讲稿.doc`, manuscriptBlob);
  download(`${baseName}-Hermes-PPT-prompt.txt`, promptBlob);
}

async function writeFile(handle: FileSystemFileHandle, blob: Blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function createPptxBlob(reportPackage: ReportDeckPackage) {
  const pptxgen = (await import("pptxgenjs")).default;
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "SpecFlow Agent / Hermes";
  pptx.subject = "Hermes presentation task output";
  pptx.title = reportPackage.deckTitle;
  pptx.company = "SpecFlow";

  addCover(pptx, reportPackage.deckTitle);
  safeSlides(reportPackage).forEach((slide) => addSlide(pptx, slide));
  return await (pptx as unknown as { write: (options: { outputType: "blob" }) => Promise<Blob> }).write({ outputType: "blob" });
}

type Pptx = PptxGenJS;
type SafeSlide = { title: string; bullets: string[]; speakerNotes: string };

function stringsFromValue(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\r?\n|[;；。]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function safeSlides(reportPackage: ReportDeckPackage): SafeSlide[] {
  const slides = Array.isArray(reportPackage.slides) ? reportPackage.slides : [];
  return slides.map((slide, index) => {
    const bullets = stringsFromValue(slide.bullets).concat(stringsFromValue(slide.content));
    return {
      title: String(slide.title || `Slide ${index + 1}`),
      bullets: bullets.length ? bullets : ["No slide content was returned."],
      speakerNotes: String(slide.speakerNotes || slide.content || "")
    };
  });
}

function addCover(pptx: Pptx, title: string) {
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFC" };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.0, fill: { color: "111827" }, line: { color: "111827" } });
  slide.addText("Hermes 汇报材料", { x: 0.65, y: 0.3, w: 3.2, h: 0.24, fontSize: 12, bold: true, color: "FBBF24", margin: 0 });
  slide.addText(title, { x: 0.75, y: 1.8, w: 8.8, h: 0.9, fontSize: 28, bold: true, color: "18181B", fit: "shrink" });
  slide.addText("PRD、Hermes 调研与差异化建议驱动", { x: 0.78, y: 3.1, w: 6.2, h: 0.34, fontSize: 15, color: "3F3F46", margin: 0 });
  slide.addText(new Date().toLocaleDateString("zh-CN"), { x: 10.2, y: 6.75, w: 2.2, h: 0.22, fontSize: 9, color: "71717A", align: "right", margin: 0 });
}

function addSlide(pptx: Pptx, data: SafeSlide) {
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFC" };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.72, fill: { color: "172554" }, line: { color: "172554" } });
  slide.addText(data.title, { x: 0.6, y: 0.23, w: 9.0, h: 0.24, fontSize: 17, bold: true, color: "FFFFFF", margin: 0 });
  data.bullets.slice(0, 6).forEach((item, index) => {
    slide.addText(`${index + 1}`, { x: 0.75, y: 1.3 + index * 0.72, w: 0.3, h: 0.24, fontSize: 10, bold: true, color: "B45309", margin: 0 });
    slide.addText(item, { x: 1.18, y: 1.25 + index * 0.72, w: 10.8, h: 0.34, fontSize: 14, color: "18181B", fit: "shrink", margin: 0.02 });
  });
  if (data.speakerNotes) slide.addNotes(data.speakerNotes);
}

function wordHtml(reportPackage: ReportDeckPackage) {
  const slides = safeSlides(reportPackage)
    .map((slide, index) => `<h2>第 ${index + 1} 页：${escapeHtml(slide.title)}</h2><p>${escapeHtml(slide.speakerNotes)}</p><ul>${slide.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(reportPackage.deckTitle)} 讲稿</title></head><body><h1>${escapeHtml(reportPackage.deckTitle)} 讲稿</h1><pre>${escapeHtml(reportPackage.manuscript)}</pre>${slides}</body></html>`;
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "report-deck";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
