import { createProject } from "@/app/actions";
import { Card } from "@/components/ui";

export default function NewProjectPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-bold">Start New Project</h1>
      <p className="mt-2 text-slate-400">Capture the product idea before Hermes research and PDRS scoring.</p>
      <Card className="mt-8">
        <form action={createProject} className="grid gap-5">
          <label className="grid gap-2"><span>Product idea</span><textarea required name="idea" rows={5} className="rounded-xl border border-slate-700 bg-slate-950 p-3" placeholder="我想做一个面向客户经理的 AI 财富产品推荐系统..." /></label>
          <div className="grid gap-5 md:grid-cols-2">
            <label className="grid gap-2"><span>Industry</span><input required name="industry" className="rounded-xl border border-slate-700 bg-slate-950 p-3" placeholder="fintech / SaaS / devtools" /></label>
            <label className="grid gap-2"><span>Target user</span><input required name="targetUser" className="rounded-xl border border-slate-700 bg-slate-950 p-3" placeholder="founders, PMs, customer managers" /></label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-xl border border-slate-800 p-3"><input type="checkbox" name="financial" />Need financial suitability check?</label>
            <label className="flex items-center gap-3 rounded-xl border border-slate-800 p-3"><input type="checkbox" name="monitoring" />Need continuous competitor monitoring?</label>
          </div>
          <label className="grid gap-2"><span>Preferred tech stack</span><input name="stack" className="rounded-xl border border-slate-700 bg-slate-950 p-3" defaultValue="Next.js, TypeScript, Prisma, SQLite, Tailwind CSS" /></label>
          <button className="rounded-xl bg-blue-500 px-5 py-3 font-semibold text-white hover:bg-blue-400">Create Project</button>
        </form>
      </Card>
    </main>
  );
}
