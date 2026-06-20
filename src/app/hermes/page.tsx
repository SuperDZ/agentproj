import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HermesHeaderActions, HermesManagementPanel } from "@/components/hermes-management-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HermesSearchParams = Record<string, string | string[] | undefined>;

function firstParam(searchParams: HermesSearchParams | undefined, key: string) {
  const value = searchParams?.[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function HermesPage({ searchParams }: { searchParams?: Promise<HermesSearchParams> }) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const projectId = firstParam(resolvedSearchParams, "projectId");
  const backHref = projectId ? `/projects/${encodeURIComponent(projectId)}` : "/projects";
  const backLabel = projectId ? "返回项目详情" : "返回项目管理";

  return (
    <main className="min-h-screen">
      <header className="border-b border-stone-200/80 bg-[#fffdf8]/90 backdrop-blur">
        <div className="mx-auto grid max-w-7xl gap-4 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <Link href={backHref} className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-stone-600 transition hover:text-teal-800">
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">Hermes 工具管理</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              集中管理 Hermes 相关 Skill、Tool、白名单、搜索导入和自定义 Skill。
            </p>
          </div>
          <HermesHeaderActions />
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-7">
        <HermesManagementPanel projectId={projectId} />
      </div>
    </main>
  );
}
