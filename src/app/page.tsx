import Link from "next/link";
import { ArrowRight, CheckCircle2, GitBranch, Sparkles } from "lucide-react";
import { createDemoProject } from "./actions";
import { LanguageToggle } from "@/components/language-toggle";
import { Card } from "@/components/ui";
import { getLocale } from "@/lib/i18n-server";

const homeCopy = {
  en: {
    eyebrow: "AI product decision workspace",
    headline: "Turn a product idea into an evidence-based build decision before writing code.",
    subhead: "SpecFlow calls Hermes at project creation to analyze the idea and explanation, then carries the work through recoverable research status, competitor evidence, differentiation, PRD, PDRS evaluation, prototype prompts, and a Codex-ready task pack.",
    start: "Start New Project",
    demo: "View Demo Project",
    panelTitle: "Decision pipeline",
    panelItems: [
      "Idea + explanation intake",
      "Hermes planning analysis",
      "Recoverable Hermes research",
      "Competitor matrix and differentiation",
      "MVP modification advice",
      "PRD and tech stack recommendation",
      "Hermes PDRS evaluation",
      "Prototype prompt and Codex Pack"
    ],
    cards: [
      "Creation-time Hermes planning",
      "Persistent research status and timer",
      "Evidence-based PDRS and Codex handoff"
    ]
  },
  zh: {
    eyebrow: "AI 产品决策工作台",
    headline: "在写代码之前，先把产品想法变成有证据的建设决策。",
    subhead: "SpecFlow 在创建项目时调用 Hermes 分析项目命题与补充解释，生成项目规划建议、确认问题与用户、3-5 个核心功能；随后进入可恢复的 Hermes 研究、竞品矩阵、差异化判断、MVP 修改建议、PRD、原型 prompt 和 Codex Pack。",
    start: "新建项目",
    demo: "查看演示项目",
    panelTitle: "决策流水线",
    panelItems: [
      "录入项目命题与补充解释",
      "Hermes 生成项目规划建议",
      "可恢复的 Hermes 研究状态与计时",
      "竞品矩阵与差异化判断",
      "MVP 修改建议",
      "PRD 与技术栈建议",
      "原型 prompt 与 Codex Pack 导出"
    ],
    cards: [
      "创建阶段真实调用 Hermes 规划",
      "研究状态持久化，刷新后继续显示",
      "基于证据评分并交付 Codex 任务包"
    ]
  }
} as const;

export default async function Home() {
  const locale = await getLocale();
  const t = homeCopy[locale];

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_46%,#f7f7f5_100%)]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-950 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-950">SpecFlow Agent</p>
            <p className="text-xs text-zinc-500">{t.eyebrow}</p>
          </div>
        </div>
        <LanguageToggle locale={locale} />
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-76px)] max-w-7xl items-center gap-10 px-6 py-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-sm font-medium text-blue-700 shadow-sm">
            <GitBranch className="h-4 w-4" /> {t.eyebrow}
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold leading-tight tracking-normal text-zinc-950 md:text-6xl">{t.headline}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">{t.subhead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/projects/new" className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
              {t.start} <ArrowRight className="h-4 w-4" />
            </Link>
            <form action={createDemoProject}>
              <button className="rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50">{t.demo}</button>
            </form>
          </div>
        </div>

        <Card className="p-0">
          <div className="border-b border-zinc-200 px-5 py-4">
            <p className="text-sm font-semibold text-zinc-950">{t.panelTitle}</p>
          </div>
          <div className="grid gap-1 p-3">
            {t.panelItems.map((item, index) => (
              <div key={index} className="flex items-center gap-3 rounded-md px-3 py-3 hover:bg-zinc-50">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 text-sm font-semibold text-blue-700">{index + 1}</div>
                <span className="text-sm font-medium text-zinc-800">{item}</span>
                <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-500" />
              </div>
            ))}
          </div>
          <div className="grid gap-3 border-t border-zinc-200 bg-zinc-50 p-5 md:grid-cols-3">
            {t.cards.map((item, index) => (
              <div key={index} className="rounded-md border border-zinc-200 bg-white p-3">
                <p className="text-sm font-medium text-zinc-800">{item}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}
