import Link from "next/link";
import { ArrowRight, CheckCircle2, FolderKanban, GitBranch, Plus, Sparkles } from "lucide-react";
import { createDemoProject } from "./actions";
import { LanguageToggle } from "@/components/language-toggle";
import { Card, buttonStyles } from "@/components/ui";
import { dictionaries } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export default async function Home() {
  const locale = await getLocale();
  const t = dictionaries[locale].home;

  return (
    <main className="min-h-screen">
      <header className="border-b border-stone-200/80 bg-[#fffdf8]/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-950 text-white shadow-lg shadow-stone-300">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-stone-950">SpecFlow Agent</p>
              <p className="text-xs text-stone-500">{t.eyebrow}</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/projects" className="hidden text-sm font-semibold text-stone-700 transition hover:text-teal-800 sm:inline">
              Project Management
            </Link>
            <LanguageToggle locale={locale} />
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[0.92fr_1.08fr] lg:py-14">
        <div className="flex flex-col justify-center">
          <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
            <GitBranch className="h-4 w-4" />
            {t.eyebrow}
          </div>
          <h1 className="max-w-4xl text-5xl font-semibold leading-[1.04] text-stone-950 md:text-6xl">{t.headline}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">{t.subhead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/projects" className={buttonStyles.primary}>
              <FolderKanban className="h-4 w-4" />
              Project Management
            </Link>
            <Link href="/projects/new" className={buttonStyles.secondary}>
              <Plus className="h-4 w-4" />
              {t.start}
            </Link>
            <form action={createDemoProject}>
              <button className={buttonStyles.secondary}>
                {t.demo}
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>

        <Card className="relative overflow-hidden p-0">
          <div className="absolute right-0 top-0 h-28 w-28 border-l border-stone-200 bg-teal-700/10" />
          <div className="border-b border-stone-200 px-5 py-4">
            <p className="text-sm font-bold text-stone-950">{t.panelTitle}</p>
          </div>
          <div className="grid gap-1 p-3">
            {t.panelItems.map((item, index) => (
              <div key={item} className="group grid min-h-14 grid-cols-[36px_minmax(0,1fr)_24px] items-center gap-3 rounded-md px-3 py-3 transition hover:bg-teal-50/70">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-stone-950 text-sm font-bold text-white">{index + 1}</div>
                <span className="text-sm font-semibold text-stone-800">{item}</span>
                <CheckCircle2 className="h-4 w-4 text-teal-700" />
              </div>
            ))}
          </div>
          <div className="grid gap-3 border-t border-stone-200 bg-stone-100/60 p-5 md:grid-cols-3">
            {t.cards.map((item) => (
              <div key={item} className="rounded-md border border-stone-200 bg-white/90 p-3">
                <p className="text-sm font-semibold leading-5 text-stone-800">{item}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}
