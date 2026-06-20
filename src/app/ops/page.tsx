import Link from "next/link";
import type React from "react";
import { Activity, Archive, ArrowLeft, Boxes, Database, Server, TriangleAlert, WalletCards } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { Badge, Card, Progress } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsPage() {
  const [tasks, deadTasks, heartbeats, errors, modelInvocations, artifactStats] = await Promise.all([
    prisma.asyncTask.findMany({ orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.asyncTask.findMany({ where: { status: { in: ["failed", "dead"] } }, orderBy: { updatedAt: "desc" }, take: 10 }),
    prisma.workerHeartbeat.findMany({ orderBy: { lastSeenAt: "desc" }, take: 10 }),
    prisma.operationalEvent.findMany({ where: { level: { in: ["error", "warn"] } }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.modelInvocation.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.storedArtifact.aggregate({ _count: { _all: true }, _sum: { sizeBytes: true } })
  ]);

  const taskCounts = countBy(tasks, (task) => task.status);
  const modelTotalTokens = modelInvocations.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0);
  const modelCost = modelInvocations.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0);

  return (
    <main className="min-h-screen">
      <header className="border-b border-stone-200/80 bg-[#fffdf8]/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-teal-800">
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-teal-800">Operations</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">系统运行面板</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">查看 AsyncTask、worker 心跳、错误事件、模型调用和 Artifact Storage 占用。</p>
            </div>
            <Badge tone={deadTasks.length ? "red" : "green"}>{deadTasks.length ? `${deadTasks.length} 个异常任务` : "运行状态正常"}</Badge>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric icon={<Boxes className="h-4 w-4" />} label="近期任务" value={String(tasks.length)} helper={`running ${taskCounts.running ?? 0} / waiting ${taskCounts.waiting ?? 0}`} />
          <Metric icon={<TriangleAlert className="h-4 w-4" />} label="失败/死信" value={String(deadTasks.length)} helper="需要人工复核或重放" tone={deadTasks.length ? "risk" : "neutral"} />
          <Metric icon={<Server className="h-4 w-4" />} label="Worker 心跳" value={String(heartbeats.length)} helper={heartbeats[0] ? `最近 ${formatDate(heartbeats[0].lastSeenAt)}` : "暂无心跳"} />
          <Metric icon={<WalletCards className="h-4 w-4" />} label="模型 Token" value={String(modelTotalTokens)} helper={modelCost ? `$${modelCost.toFixed(4)}` : "未记录成本"} />
          <Metric icon={<Archive className="h-4 w-4" />} label="Artifact" value={String(artifactStats._count._all)} helper={formatBytes(artifactStats._sum.sizeBytes ?? 0)} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <SectionTitle icon={<Activity className="h-5 w-5" />} title="AsyncTask 队列" />
            <div className="mt-4 overflow-hidden rounded-lg border border-stone-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-100 text-xs uppercase text-stone-500">
                  <tr><th className="p-3">任务</th><th className="p-3">状态</th><th className="p-3">尝试</th><th className="p-3">下次运行</th><th className="p-3">更新</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white/80">
                  {tasks.map((task) => (
                    <tr key={task.id}>
                      <td className="p-3"><p className="font-semibold text-stone-950">{task.type}</p><p className="font-mono text-[11px] text-stone-500">{task.id}</p></td>
                      <td className="p-3"><Badge tone={taskTone(task.status)}>{task.status}</Badge></td>
                      <td className="p-3 font-mono text-stone-700">{task.attemptCount}/{task.maxAttempts}</td>
                      <td className="p-3 text-stone-600">{formatDate(task.runAfter)}</td>
                      <td className="p-3 text-stone-600">{formatDate(task.updatedAt)}</td>
                    </tr>
                  ))}
                  {tasks.length === 0 ? <tr><td colSpan={5} className="p-4 text-stone-500">暂无任务。</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <SectionTitle icon={<Server className="h-5 w-5" />} title="Worker 心跳" />
            <div className="mt-4 grid gap-3">
              {heartbeats.map((item) => (
                <div key={item.id} className="rounded-lg border border-stone-200 bg-white/80 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-mono text-xs font-semibold text-stone-950">{item.workerId}</p>
                    <Badge tone={item.status === "running" ? "green" : "slate"}>{item.status}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-stone-500">{item.hostname} / pid {item.pid} / {formatDate(item.lastSeenAt)}</p>
                </div>
              ))}
              {heartbeats.length === 0 ? <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-500">暂无 worker 心跳。</p> : null}
            </div>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <SectionTitle icon={<TriangleAlert className="h-5 w-5" />} title="最近错误事件" />
            <div className="mt-4 grid gap-2">
              {errors.map((event) => (
                <div key={event.id} className="rounded-md border border-stone-200 bg-white/80 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={event.level === "error" ? "red" : "yellow"}>{event.level}</Badge>
                    <span className="font-mono text-[11px] text-stone-400">{formatDate(event.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-stone-950">{event.eventType}</p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">{event.message}</p>
                </div>
              ))}
              {errors.length === 0 ? <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-500">暂无错误或告警事件。</p> : null}
            </div>
          </Card>

          <Card>
            <SectionTitle icon={<Database className="h-5 w-5" />} title="模型与存储指标" />
            <div className="mt-4 grid gap-4">
              <div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-stone-950">模型成功率</span>
                  <span className="font-mono text-stone-600">{successRate(modelInvocations)}%</span>
                </div>
                <div className="mt-2"><Progress value={Number(successRate(modelInvocations))} /></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <MiniMetric label="调用次数" value={String(modelInvocations.length)} />
                <MiniMetric label="Artifact 总量" value={formatBytes(artifactStats._sum.sizeBytes ?? 0)} />
              </div>
              <div className="rounded-lg border border-stone-200 bg-white/80 p-3">
                <p className="text-xs font-semibold uppercase text-stone-500">成本说明</p>
                <p className="mt-2 text-sm leading-6 text-stone-600">当前只在模型供应商返回 usage 时记录 token；没有 usage 时不估算成本。</p>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <h2 className="flex items-center gap-2 text-base font-bold text-stone-950">{icon}{title}</h2>;
}

function Metric({ icon, label, value, helper, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string; helper: string; tone?: "neutral" | "risk" }) {
  return (
    <div className={tone === "risk" ? "rounded-lg border border-rose-200 bg-rose-50/70 p-4" : "rounded-lg border border-stone-200 bg-white/85 p-4"}>
      <p className="flex items-center gap-2 text-xs font-semibold text-stone-500">{icon}{label}</p>
      <p className="mt-3 truncate font-mono text-2xl font-semibold text-stone-950">{value}</p>
      <p className="mt-2 truncate text-xs text-stone-500">{helper}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white/80 p-3">
      <p className="text-xs font-semibold text-stone-500">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-bold text-stone-950">{value}</p>
    </div>
  );
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function taskTone(status: string): "green" | "yellow" | "red" | "blue" | "slate" {
  if (status === "succeeded") return "green";
  if (status === "failed" || status === "dead") return "red";
  if (status === "running") return "blue";
  if (status === "queued" || status === "waiting") return "yellow";
  return "slate";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(value);
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function successRate(items: Array<{ status: string }>) {
  if (items.length === 0) return "0";
  const ok = items.filter((item) => item.status === "ok").length;
  return ((ok / items.length) * 100).toFixed(0);
}
