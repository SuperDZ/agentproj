import { LanguageToggle } from "@/components/language-toggle";
import { ProjectIntakeForm } from "@/components/project-intake-form";
import { Card } from "@/components/ui";
import { dictionaries } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export default async function NewProjectPage() {
  const locale = await getLocale();
  const t = dictionaries[locale].newProject;

  return (
    <main className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-semibold text-zinc-950">SpecFlow Agent</p>
            <p className="text-xs text-zinc-500">{t.basics}</p>
          </div>
          <LanguageToggle locale={locale} />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">{t.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">{t.description}</p>
        </div>

        <Card className="p-0">
          <div className="border-b border-zinc-200 px-5 py-4">
            <p className="text-sm font-semibold text-zinc-950">{t.basics}</p>
          </div>
          <ProjectIntakeForm />
        </Card>
      </div>
    </main>
  );
}
