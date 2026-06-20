import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { hermesResearchResourceLogArtifact, parseHermesResearchResourceLog, type HermesResourceUsageItem } from "@/lib/skills/resource-config";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ResearchLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      researchRuns: { orderBy: { createdAt: "desc" } },
      artifacts: {
        where: { artifactType: hermesResearchResourceLogArtifact },
        orderBy: { createdAt: "desc" }
      }
    }
  });
  if (!project) notFound();

  const logs = project.artifacts.map((artifact) => ({ artifact, log: parseHermesResearchResourceLog(artifact.content) })).filter((item) => item.log);
  const latest = logs[0]?.log ?? null;

  return (
    <main className="min-h-screen">
      <header className="border-b border-stone-200/80 bg-[#fffdf8]/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <Link href={`/projects/${project.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-teal-800">
            <ArrowLeft className="h-4 w-4" />
            返回项目详情
          </Link>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-teal-800">Hermes Research Log</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">调研日志</h1>
              <p className="mt-2 text-sm leading-6 text-stone-600">展示最近一次 Hermes 调研报告的 Skill / Tool 使用统计。</p>
            </div>
            <Badge tone={latest?.mode === "auto" ? "blue" : "slate"}>{latest?.mode === "auto" ? "Hermes 自主决定" : "详细配置"}</Badge>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8">
        {!latest ? (
          <Card>
            <div className="flex items-start gap-3">
              <ClipboardList className="mt-1 h-5 w-5 text-stone-400" />
              <div>
                <h2 className="font-bold text-stone-950">暂无调研日志</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">运行 Hermes 调研并完成后，系统会在这里展示本次使用的 Skills 和 Tools。</p>
              </div>
            </div>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="ResearchRun" value={latest.researchRunId || "未记录"} />
              <Metric label="HermesRun" value={latest.hermesRunId || "未记录"} />
              <Metric label="Skills" value={String(latest.skills.length)} />
              <Metric label="Tools" value={String(latest.tools.length)} />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <UsageTable title="Skills 使用统计" items={latest.skills} />
              <UsageTable title="Tools 使用统计" items={latest.tools} />
            </div>
            {logs.length > 1 ? (
              <Card>
                <h2 className="font-bold text-stone-950">历史调研记录</h2>
                <div className="mt-3 grid gap-2 text-sm text-stone-600">
                  {logs.slice(1).map(({ artifact, log }) => (
                    <div key={artifact.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 bg-white/80 px-3 py-2">
                      <span>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "medium" }).format(artifact.createdAt)}</span>
                      <span className="font-mono text-xs">{log?.researchRunId}</span>
                      <span>{log?.skills.length ?? 0} Skills / {log?.tools.length ?? 0} Tools</span>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-stone-200 bg-white/85 p-4 shadow-sm">
      <p className="text-xs font-semibold text-stone-500">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-bold text-stone-950" title={value}>{value}</p>
    </div>
  );
}

function UsageTable({ title, items }: { title: string; items: HermesResourceUsageItem[] }) {
  return (
    <Card>
      <h2 className="font-bold text-stone-950">{title}</h2>
      <div className="mt-4 overflow-hidden rounded-lg border border-stone-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-100 text-xs uppercase text-stone-500">
            <tr>
              <th className="p-3">名称</th>
              <th className="p-3">次数</th>
              <th className="p-3">状态</th>
              <th className="p-3">说明</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200 bg-white/80">
            {items.map((item, index) => (
              <tr key={`${item.kind}:${item.name}:${index}`}>
                <td className="p-3 font-semibold text-stone-950">
                  {item.name}
                  {item.path ? <p className="mt-1 break-all font-mono text-[11px] font-normal text-stone-500">{item.path}</p> : null}
                </td>
                <td className="p-3 font-mono text-stone-700">{item.callCount}</td>
                <td className="p-3 text-stone-700">{statusLabel(item.status)}</td>
                <td className="p-3 text-xs leading-5 text-stone-600">{item.reason || item.purpose?.join("、") || "未返回说明。"}</td>
              </tr>
            ))}
            {items.length === 0 ? <tr><td colSpan={4} className="p-4 text-sm text-stone-500">本次调研未记录该类资源。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function statusLabel(status: HermesResourceUsageItem["status"]) {
  if (status === "used") return "已使用";
  if (status === "planned") return "计划使用";
  return "未报告";
}
