import Link from "next/link";
import { ArrowLeft, FolderKanban } from "lucide-react";
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
      <header className="border-b border-stone-200/80 bg-[#fffdf8]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-950 text-white">
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

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[0.78fr_1.22fr]">
        <aside className="pt-2">
          <p className="text-xs font-bold uppercase text-teal-800">Project Intake</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight text-stone-950">{t.title}</h1>
          <p className="mt-4 text-sm leading-6 text-stone-600">{t.description}</p>
          <div className="mt-6 grid gap-3 text-sm text-stone-700">
            {["先界定用户问题", "再补充业务约束", "最后生成可执行工作台"].map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-md border border-stone-200 bg-white/70 px-3 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-700 text-xs font-bold text-white">{index + 1}</span>
                <span className="font-semibold">{item}</span>
              </div>
            ))}
          </div>
        </aside>

        <Card className="p-0">
          <div className="border-b border-stone-200 px-5 py-4">
            <p className="text-sm font-bold text-stone-950">{t.basics}</p>
          </div>
          <ProjectIntakeForm />
        </Card>
      </div>
    </main>
  );
}
