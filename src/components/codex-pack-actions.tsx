"use client";

import { useMemo, useRef, useState } from "react";
import type PptxGenJS from "pptxgenjs";
import type { CodexPackFile } from "@/lib/export/codex-pack";
import { packToClipboardText } from "@/lib/export/codex-pack";
import { dictionaries, type Locale } from "@/lib/i18n";

export function CodexPackActions({ files, locale = "en" }: { files: CodexPackFile[]; locale?: Locale }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fullPack = useMemo(() => packToClipboardText(files), [files]);
  const t = dictionaries[locale].codexPackActions;
  const pitchDeck = files.find((file) => file.filename === "pitch_deck_outline.md");
  const prd = files.find((file) => file.filename === "PRD.md");
  const evaluation = files.find((file) => file.filename === "evaluation_report.md");

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
    const blob = new Blob([file.content], { type: contentTypeFor(file.filename) });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadPitchDeck() {
    const pptxgen = (await import("pptxgenjs")).default;
    const pptx = new pptxgen();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "SpecFlow Agent";
    pptx.subject = "Finance-style interview pitch deck";
    pptx.title = "Interview Product Pitch";
    pptx.company = "SpecFlow";

    const deckText = pitchDeck?.content ?? "";
    const projectName = extractTitle(deckText) || "SpecFlow Interview Project";
    const thesis = extractLine(deckText, "Thesis:") || extractLine(prd?.content ?? "", "## 1. Product Goal") || "Interview-ready product workflow";
    const pdrs = extractLine(deckText, "PDRS:") || extractLine(evaluation?.content ?? "", "- PDRS:") || "pending";
    const decision = extractLine(deckText, "Decision:") || extractLine(evaluation?.content ?? "", "- Decision:") || "pending";
    const featureItems = extractSectionItems(deckText, "Core 3-5 features").slice(0, 5);

    addTitleSlide(pptx, projectName, thesis, pdrs, decision);
    addContentSlide(pptx, "Problem and User", [
      "Live interviews compress discovery, requirements, prototype explanation, and implementation planning.",
      "The workflow must force evidence, scope control, and artifact quality before coding.",
      "Target users and financial suitability boundaries remain visible throughout the process."
    ]);
    addKpiSlide(pptx, "Decision Dashboard", [
      ["PDRS", pdrs],
      ["Decision", decision],
      ["Scope", "Top 3-5"],
      ["Timebox", "90 min"]
    ]);
    addContentSlide(pptx, "Core Product Scope", featureItems.length ? featureItems : [
      "Problem discovery intake",
      "RICE-based feature selection",
      "PRD and prototype export",
      "Finance-style deck generation",
      "Vibe-coding handoff"
    ]);
    addFlowSlide(pptx);
    addContentSlide(pptx, "Risk and Compliance Controls", [
      "Financial suitability is enabled only for finance-related projects.",
      "No guaranteed return, principal protection, or no-risk claim.",
      "Third-party skills stay reference-only until reviewed.",
      "Generated artifacts keep assumptions and risks auditable."
    ]);
    addContentSlide(pptx, "Delivery Roadmap", [
      "Phase 1: structured intake, discovery, and PRD export.",
      "Phase 2: prototype wireframe and finance-style deck generation.",
      "Phase 3: monitored competitor drift and skill library hardening."
    ]);
    addContentSlide(pptx, "Demo Script", [
      "Start from a raw idea.",
      "Select industry, target users, stack, and monitoring choices.",
      "Run research, select core points, and evaluate readiness.",
      "Export PRD, prototype, PPTX, and vibe-coding task plan."
    ]);
    addAppendixSlide(pptx);

    await pptx.writeFile({ fileName: `${safeFilename(projectName)}-interview-pitch.pptx` });
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copyFullPack} className="rounded-lg bg-zinc-950 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
          {copyState === "copied" ? t.copied : t.copyFullPack}
        </button>
        {pitchDeck && (
          <button type="button" onClick={downloadPitchDeck} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            Download finance PPTX
          </button>
        )}
        {files.map((file) => (
          <button key={file.filename} type="button" onClick={() => downloadFile(file)} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
            {t.download} {file.filename}
          </button>
        ))}
      </div>
      {copyState === "failed" && <p className="mt-2 text-sm text-amber-700">{t.clipboardFailed}</p>}
      <textarea ref={textareaRef} readOnly rows={8} className="mt-3 w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-xs text-zinc-700" value={fullPack} />
    </div>
  );
}

function contentTypeFor(filename: string) {
  if (filename.endsWith(".svg")) return "image/svg+xml;charset=utf-8";
  if (filename.endsWith(".json")) return "application/json;charset=utf-8";
  return "text/markdown;charset=utf-8";
}

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "specflow";
}

function extractTitle(markdown: string) {
  const line = markdown.split("\n").find((item) => item.startsWith("# "));
  return line?.replace(/^#\s+/, "").replace(/^Finance-style Pitch Deck Outline:\s*/, "").trim();
}

function extractLine(markdown: string, label: string) {
  const line = markdown.split("\n").find((item) => item.includes(label));
  return line?.split(label).pop()?.trim();
}

function extractSectionItems(markdown: string, heading: string) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.includes(heading));
  if (start === -1) return [];
  const items: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\d+\.\s/.test(line) && items.length > 0) break;
    if (line.trim().startsWith("- ")) items.push(line.trim().slice(2));
  }
  return items;
}

type Pptx = PptxGenJS;

function addTitleSlide(pptx: Pptx, title: string, thesis: string, pdrs: string, decision: string) {
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFC" };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.0, fill: { color: "111827" }, line: { color: "111827" } });
  slide.addText(title, { x: 0.55, y: 0.25, w: 8.6, h: 0.35, fontFace: "Aptos Display", fontSize: 20, bold: true, color: "FFFFFF", margin: 0 });
  slide.addText("Finance-style interview pitch", { x: 10.3, y: 0.32, w: 2.4, h: 0.28, fontSize: 9, color: "FBBF24", align: "right", margin: 0 });
  slide.addText(thesis, { x: 0.65, y: 1.45, w: 7.3, h: 1.0, fontSize: 24, bold: true, color: "18181B", fit: "shrink" });
  addMetricCard(slide, pptx, "PDRS", pdrs, 8.35, 1.42);
  addMetricCard(slide, pptx, "Decision", decision, 10.55, 1.42);
  slide.addText("90-minute output chain", { x: 0.65, y: 3.15, w: 3.0, h: 0.28, fontSize: 12, bold: true, color: "172554", margin: 0 });
  ["Problem discovery", "Top 3-5 scope", "PRD", "Prototype", "PPTX", "Vibe-coding"].forEach((item, index) => {
    slide.addShape(pptx.ShapeType.rect, { x: 0.65 + index * 2.05, y: 3.65, w: 1.75, h: 0.62, rectRadius: 0.08, fill: { color: index === 0 ? "DBEAFE" : "FFFFFF" }, line: { color: "CBD5E1" } });
    slide.addText(item, { x: 0.78 + index * 2.05, y: 3.86, w: 1.48, h: 0.18, fontSize: 8.5, color: "18181B", align: "center", margin: 0 });
  });
}

function addContentSlide(pptx: Pptx, title: string, items: string[]) {
  const slide = createBaseSlide(pptx, title);
  items.slice(0, 6).forEach((item, index) => {
    slide.addText(`${index + 1}`, { x: 0.75, y: 1.45 + index * 0.75, w: 0.32, h: 0.28, fontSize: 11, bold: true, color: "B45309", margin: 0 });
    slide.addText(item, { x: 1.2, y: 1.39 + index * 0.75, w: 10.8, h: 0.4, fontSize: 15, color: "18181B", fit: "shrink", margin: 0.02 });
  });
}

function addKpiSlide(pptx: Pptx, title: string, metrics: Array<[string, string]>) {
  const slide = createBaseSlide(pptx, title);
  metrics.forEach(([label, value], index) => {
    addMetricCard(slide, pptx, label, value, 0.7 + index * 3.1, 1.45);
  });
  slide.addText("Use this slide as the interview control panel: it makes readiness, scope, risk, and timebox explicit.", { x: 0.8, y: 4.35, w: 11.2, h: 0.5, fontSize: 16, color: "3F3F46", fit: "shrink" });
}

function addFlowSlide(pptx: Pptx) {
  const slide = createBaseSlide(pptx, "Prototype Flow");
  ["Intake", "Discover", "Define", "Artifact Workspace", "Presenter"].forEach((item, index) => {
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.65 + index * 2.45, y: 2.2, w: 1.82, h: 0.72, fill: { color: index === 4 ? "172554" : "FFFFFF" }, line: { color: "CBD5E1" } });
    slide.addText(item, { x: 0.82 + index * 2.45, y: 2.45, w: 1.48, h: 0.18, fontSize: 10, bold: true, color: index === 4 ? "FFFFFF" : "18181B", align: "center", margin: 0 });
    if (index < 4) slide.addShape(pptx.ShapeType.rightArrow, { x: 2.25 + index * 2.45, y: 2.42, w: 0.5, h: 0.28, fill: { color: "B45309" }, line: { color: "B45309" } });
  });
}

function addAppendixSlide(pptx: Pptx) {
  addContentSlide(pptx, "Appendix: Tool References", [
    "Excalidraw and tldraw for prototype and flow-diagram patterns.",
    "PptxGenJS for PowerPoint generation inside the product workflow.",
    "Recharts for finance-style KPI and risk charts.",
    "Open-source skills stay reference-only until license and security review."
  ]);
}

function createBaseSlide(pptx: Pptx, title: string) {
  const slide = pptx.addSlide();
  slide.background = { color: "F8FAFC" };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.72, fill: { color: "172554" }, line: { color: "172554" } });
  slide.addText(title, { x: 0.55, y: 0.23, w: 8.6, h: 0.24, fontSize: 17, bold: true, color: "FFFFFF", margin: 0 });
  slide.addText("SpecFlow Agent", { x: 10.5, y: 0.25, w: 2.2, h: 0.22, fontSize: 8.5, color: "FBBF24", align: "right", margin: 0 });
  return slide;
}

function addMetricCard(slide: ReturnType<Pptx["addSlide"]>, pptx: Pptx, label: string, value: string, x: number, y: number) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w: 1.82, h: 0.9, fill: { color: "FFFFFF" }, line: { color: "CBD5E1" } });
  slide.addText(label, { x: x + 0.15, y: y + 0.16, w: 1.46, h: 0.16, fontSize: 8.5, color: "71717A", margin: 0 });
  slide.addText(value, { x: x + 0.15, y: y + 0.42, w: 1.46, h: 0.28, fontSize: 14, bold: true, color: "172554", fit: "shrink", margin: 0 });
}
