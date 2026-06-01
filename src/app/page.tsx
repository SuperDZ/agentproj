import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { createDemoProject } from "./actions";
import { Card } from "@/components/ui";

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#1d4ed8_0,transparent_35%),#020617]">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
        <div className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-100">
            <Sparkles className="h-4 w-4" /> SpecFlow Agent
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-white md:text-7xl">Before AI writes code, make sure the product is worth building.</h1>
          <p className="mt-6 text-xl leading-8 text-slate-300">从产品想法到竞品调研、差异化判断、PDRS 评分、PRD 和 Codex-ready 任务包。</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/projects/new" className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white hover:bg-blue-400">Start New Project <ArrowRight className="h-4 w-4" /></Link>
            <form action={createDemoProject}><button className="rounded-xl border border-slate-700 px-5 py-3 font-semibold text-slate-100 hover:bg-slate-900">View Demo Project</button></form>
          </div>
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {["Hermes Runtime + mock fallback", "Local explainable PDRS gate", "Structured Codex Pack export"].map((item) => <Card key={item}><ShieldCheck className="mb-3 h-5 w-5 text-emerald-300" /><p className="font-medium">{item}</p></Card>)}
        </div>
      </section>
    </main>
  );
}
