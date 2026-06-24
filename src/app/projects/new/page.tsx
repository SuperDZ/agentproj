import Link from "next/link";
import { ArrowLeft, Check, Circle, FolderKanban } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";
import { ProjectIntakeForm } from "@/components/project-intake-form";
import { Card, buttonStyles } from "@/components/ui";
import { dictionaries } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export default async function NewProjectPage() {
  const locale = await getLocale();
  const t = dictionaries[locale].newProject;

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-white/85 shadow-[0_1px_0_rgba(15,23,42,0.04),0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 text-white shadow-sm shadow-blue-900/20">
              <FolderKanban className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-stone-950">SpecFlow Agent</p>
              <p className="text-xs text-stone-500">{t.basics}</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/projects" className={buttonStyles.secondary}>
              <ArrowLeft className="h-4 w-4" />
              项目管理
            </Link>
            <LanguageToggle locale={locale} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[0.68fr_1.32fr] lg:items-start">
        <aside className="pt-2 lg:sticky lg:top-28">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Project Intake</p>
          <h1 className="mt-4 font-serif text-5xl font-semibold leading-[1.04] text-stone-950 md:text-6xl">{t.title}</h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-stone-600">{t.description}</p>
          <div className="mt-8 rounded-lg border border-stone-200/80 bg-white/60 px-5 py-5 shadow-sm backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-500">工作流状态</p>
            <ol className="mt-5 space-y-0 text-sm">
              {[
                { title: "界定用户问题", status: "当前输入", active: true },
                { title: "补充业务约束", status: "等待补充", active: false },
                { title: "生成可执行工作台", status: "创建后自动进入", active: false }
              ].map((item, index, items) => (
                <li key={item.title} className="relative grid grid-cols-[1.75rem_1fr] gap-3 pb-5 last:pb-0">
                  {index < items.length - 1 ? <span className="absolute left-[0.85rem] top-7 h-[calc(100%-1.75rem)] w-px bg-stone-200" /> : null}
                  <span
                    className={
                      item.active
                        ? "relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm shadow-blue-900/20"
                        : "relative z-10 flex h-7 w-7 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-400"
                    }
                  >
                    {item.active ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                  </span>
                  <span>
                    <span className={item.active ? "block font-bold text-stone-950" : "block font-semibold text-stone-600"}>{item.title}</span>
                    <span className={item.active ? "mt-1 block text-xs text-brand-700" : "mt-1 block text-xs text-stone-500"}>{item.status}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        <Card className="overflow-hidden p-0 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
          <div className="border-b border-stone-200 bg-gradient-to-r from-white via-brand-50/55 to-white px-6 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">核心表单</p>
            <p className="mt-2 text-lg font-bold text-stone-950">{t.basics}</p>
          </div>
          <ProjectIntakeForm />
        </Card>
      </div>
    </main>
  );
}
