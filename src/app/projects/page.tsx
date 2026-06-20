import Link from "next/link";
import { ArrowDownUp, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink, FolderKanban, Plus, Search, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import { deleteProject } from "@/app/actions";
import { ProjectDeleteButton } from "@/components/project-delete-button";
import { Badge, Card, buttonStyles, fieldStyles } from "@/components/ui";
import { prisma } from "@/lib/db/prisma";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

const statusMeta: Record<string, { label: string; tone: "blue" | "green" | "yellow" | "red" | "slate" }> = {
  queued: { label: "排队中", tone: "yellow" },
  running: { label: "运行中", tone: "blue" },
  completed: { label: "已完成", tone: "green" },
  completed_with_fallback: { label: "兜底完成", tone: "yellow" },
  completed_without_output: { label: "无输出", tone: "yellow" },
  failed: { label: "失败", tone: "red" },
  canceled: { label: "已取消", tone: "slate" }
};

const sortOptions = [
  { value: "updated_desc", label: "修改时间：新到旧" },
  { value: "updated_asc", label: "修改时间：旧到新" },
  { value: "name_asc", label: "名称：A-Z" },
  { value: "name_desc", label: "名称：Z-A" },
  { value: "score_desc", label: "评分：高到低" },
  { value: "score_asc", label: "评分：低到高" }
] as const;

const timeOptions = [
  { value: "all", label: "全部时间" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "90d", label: "近 90 天" },
  { value: "365d", label: "近 1 年" }
] as const;

const researchOptions = [
  { value: "all", label: "全部进度" },
  { value: "not_started", label: "未运行" },
  { value: "queued", label: "排队中" },
  { value: "running", label: "运行中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "other", label: "其他状态" }
] as const;

const ratingOptions = [
  { value: "all", label: "全部评分状态" },
  { value: "rated", label: "已评分" },
  { value: "unrated", label: "未评分" }
] as const;

type ProjectsSearchParams = Record<string, string | string[] | undefined>;
type ProjectListItem = Awaited<ReturnType<typeof getProjects>>[number];

function firstParam(searchParams: ProjectsSearchParams, key: string, fallback = "") {
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function normalizeParams(searchParams: ProjectsSearchParams) {
  return {
    q: firstParam(searchParams, "q").trim(),
    sort: firstParam(searchParams, "sort", "updated_desc"),
    industry: firstParam(searchParams, "industry", "all"),
    period: firstParam(searchParams, "period", "all"),
    research: firstParam(searchParams, "research", "all"),
    completion: firstParam(searchParams, "completion", "all"),
    rating: firstParam(searchParams, "rating", "all"),
    page: Math.max(1, Number.parseInt(firstParam(searchParams, "page", "1"), 10) || 1)
  };
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(value);
}

function researchBadge(status: string | undefined) {
  if (!status) return <Badge tone="slate">未运行</Badge>;
  const meta = statusMeta[status] ?? { label: status, tone: "slate" as const };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function researchIcon(status: string | undefined) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "failed") return <TriangleAlert className="h-4 w-4 text-rose-600" />;
  if (status === "queued" || status === "running") return <Clock3 className="h-4 w-4 text-amber-600" />;
  return <Search className="h-4 w-4 text-stone-500" />;
}

function getResearchFilterStatus(project: ProjectListItem) {
  const status = project.researchRuns[0]?.status;
  if (!status) return "not_started";
  if (["queued", "running", "completed", "failed"].includes(status)) return status;
  return "other";
}

function periodStart(period: string) {
  const daysByPeriod: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };
  const days = daysByPeriod[period];
  if (!days) return null;
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function getProjectScore(project: ProjectListItem) {
  return project.evaluations[0]?.pdrs ?? null;
}

function filterProjects(projects: ProjectListItem[], filters: ReturnType<typeof normalizeParams>) {
  const keyword = filters.q.toLowerCase();
  const startDate = periodStart(filters.period);

  return projects.filter((project) => {
    const latestScore = getProjectScore(project);
    const matchesKeyword = !keyword || [project.name, project.idea, project.industry, project.targetUser, project.status].some((value) => value.toLowerCase().includes(keyword));
    const matchesIndustry = filters.industry === "all" || project.industry === filters.industry;
    const matchesPeriod = !startDate || project.updatedAt >= startDate;
    const matchesResearch = filters.research === "all" || getResearchFilterStatus(project) === filters.research;
    const matchesCompletion = filters.completion === "all" || project.status === filters.completion;
    const matchesRating = filters.rating === "all" || (filters.rating === "rated" ? latestScore !== null : latestScore === null);
    return matchesKeyword && matchesIndustry && matchesPeriod && matchesResearch && matchesCompletion && matchesRating;
  });
}

function sortProjects(projects: ProjectListItem[], sort: string) {
  return [...projects].sort((left, right) => {
    const leftScore = getProjectScore(left) ?? Number.NEGATIVE_INFINITY;
    const rightScore = getProjectScore(right) ?? Number.NEGATIVE_INFINITY;
    switch (sort) {
      case "updated_asc":
        return left.updatedAt.getTime() - right.updatedAt.getTime();
      case "name_asc":
        return left.name.localeCompare(right.name, "zh-CN");
      case "name_desc":
        return right.name.localeCompare(left.name, "zh-CN");
      case "score_desc":
        return rightScore - leftScore;
      case "score_asc":
        return (getProjectScore(left) ?? Number.POSITIVE_INFINITY) - (getProjectScore(right) ?? Number.POSITIVE_INFINITY);
      default:
        return right.updatedAt.getTime() - left.updatedAt.getTime();
    }
  });
}

function pageHref(filters: ReturnType<typeof normalizeParams>, page: number) {
  const params = new URLSearchParams();
  Object.entries({ ...filters, page: String(page) }).forEach(([key, value]) => {
    if (value && value !== "all" && !(key === "sort" && value === "updated_desc") && !(key === "page" && value === "1")) params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `/projects?${query}` : "/projects";
}

async function getProjects() {
  return prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      researchRuns: { orderBy: { createdAt: "desc" }, take: 1 },
      evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { artifacts: true, competitors: true, evaluations: true, monitorJobs: true, researchRuns: true } }
    }
  });
}

export default async function ProjectsPage({ searchParams }: { searchParams?: Promise<ProjectsSearchParams> }) {
  const rawSearchParams = searchParams ? await searchParams : {};
  const filters = normalizeParams(rawSearchParams);
  const projects = await getProjects();
  const industries = [...new Set(projects.map((project) => project.industry).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const completionStatuses = [...new Set(projects.map((project) => project.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const filteredProjects = filterProjects(projects, filters);
  const sortedProjects = sortProjects(filteredProjects, filters.sort);
  const totalPages = Math.max(1, Math.ceil(sortedProjects.length / PAGE_SIZE));
  const currentPage = Math.min(filters.page, totalPages);
  const visibleProjects = sortedProjects.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const activeRuns = projects.filter((project) => ["queued", "running"].includes(project.researchRuns[0]?.status ?? "")).length;
  const hasActiveFilters = filters.q || filters.industry !== "all" || filters.period !== "all" || filters.research !== "all" || filters.completion !== "all" || filters.rating !== "all" || filters.sort !== "updated_desc";

  return (
    <main className="min-h-screen">
      <header className="border-b border-stone-200/80 bg-[#fffdf8]/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-950 text-white">
              <FolderKanban className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-stone-950">SpecFlow Agent</p>
              <p className="text-xs text-stone-500">项目管理</p>
            </div>
          </Link>
          <Link href="/projects/new" className={buttonStyles.primary}>
            <Plus className="h-4 w-4" />
            新建项目
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div>
            <p className="text-xs font-bold uppercase text-teal-800">Portfolio Control</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-950">项目管理</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">集中管理产品决策项目，查看 Hermes 调研状态、产物数量和 PDRS 评分，并执行搜索、筛选、排序、打开和删除操作。</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="项目总数" value={projects.length} />
            <Stat label="调研中" value={activeRuns} />
            <Stat label="已评分" value={projects.filter((project) => project._count.evaluations > 0).length} />
          </div>
        </div>

        <Card className="mb-5">
          <form action="/projects" className="grid gap-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.5fr)_220px_120px]">
              <Labeled label="搜索" icon={<Search className="h-3.5 w-3.5" />}>
                <input name="q" defaultValue={filters.q} placeholder="搜索项目名称、想法、行业、目标用户或状态" className={`${fieldStyles} h-10`} />
              </Labeled>
              <Labeled label="排序" icon={<ArrowDownUp className="h-3.5 w-3.5" />}>
                <select name="sort" defaultValue={filters.sort} className={`${fieldStyles} h-10`}>
                  {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Labeled>
              <div className="flex items-end">
                <button type="submit" className={buttonStyles.primary}>
                  <Search className="h-4 w-4" />
                  查询
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Labeled label="行业" icon={<SlidersHorizontal className="h-3.5 w-3.5" />}>
                <select name="industry" defaultValue={filters.industry} className={`${fieldStyles} h-10`}>
                  <option value="all">全部行业</option>
                  {industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
                </select>
              </Labeled>
              <Labeled label="时间段"><select name="period" defaultValue={filters.period} className={`${fieldStyles} h-10`}>{timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Labeled>
              <Labeled label="调研进度"><select name="research" defaultValue={filters.research} className={`${fieldStyles} h-10`}>{researchOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Labeled>
              <Labeled label="完成状态">
                <select name="completion" defaultValue={filters.completion} className={`${fieldStyles} h-10`}>
                  <option value="all">全部状态</option>
                  {completionStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </Labeled>
              <Labeled label="评分状态"><select name="rating" defaultValue={filters.rating} className={`${fieldStyles} h-10`}>{ratingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Labeled>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
              <p className="text-sm text-stone-600">共匹配 <span className="font-bold text-stone-950">{filteredProjects.length}</span> 个项目，每页展示 {PAGE_SIZE} 个。</p>
              {hasActiveFilters ? <Link href="/projects" className={buttonStyles.secondary}><X className="h-4 w-4" />清空条件</Link> : null}
            </div>
          </form>
        </Card>

        {projects.length === 0 ? (
          <EmptyState title="暂无项目" description="先创建一个项目，系统会生成 Hermes 初始规划，并进入可追踪的调研流程。" action="新建项目" href="/projects/new" icon={<FolderKanban className="h-10 w-10 text-stone-400" />} />
        ) : visibleProjects.length === 0 ? (
          <EmptyState title="没有匹配项目" description="当前搜索和筛选条件没有命中项目。请调整关键词、时间段或状态条件。" action="清空条件" href="/projects" icon={<Search className="h-10 w-10 text-stone-400" />} />
        ) : (
          <>
            <div className="grid gap-3">
              {visibleProjects.map((project) => {
                const latestRun = project.researchRuns[0];
                const latestEvaluation = project.evaluations[0];
                const deleteProjectAction = deleteProject.bind(null, project.id);

                return (
                  <Card key={project.id} className="p-0">
                    <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-lg font-bold text-stone-950">{project.name}</h2>
                          <Badge tone="slate">{project.status}</Badge>
                          {researchBadge(latestRun?.status)}
                        </div>
                        <p className="mt-2 line-clamp-2 max-w-4xl text-sm leading-6 text-stone-600">{project.idea}</p>
                        <div className="mt-4 grid gap-3 text-sm text-stone-700 sm:grid-cols-2 xl:grid-cols-4">
                          <Info label="行业" value={project.industry} />
                          <Info label="目标用户" value={project.targetUser} />
                          <Info label="最近更新" value={formatDate(project.updatedAt)} />
                          <Info label="PDRS" value={latestEvaluation ? latestEvaluation.pdrs.toFixed(1) : "未评分"} />
                        </div>
                      </div>

                      <div className="grid gap-4 border-t border-stone-200 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                        <div className="grid grid-cols-5 gap-2 text-center text-xs">
                          <MiniStat label="调研" value={project._count.researchRuns} />
                          <MiniStat label="竞品" value={project._count.competitors} />
                          <MiniStat label="产物" value={project._count.artifacts} />
                          <MiniStat label="评分" value={project._count.evaluations} />
                          <MiniStat label="监控" value={project._count.monitorJobs} />
                        </div>
                        <div className="flex items-center gap-2 text-sm text-stone-600">
                          {researchIcon(latestRun?.status)}
                          <span className="truncate">{latestRun ? `最近调研：${formatDate(latestRun.createdAt)}，模式：${latestRun.mode}` : "尚未运行 Hermes 调研"}</span>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link href={`/projects/${project.id}`} className={buttonStyles.primary}>
                            <ExternalLink className="h-4 w-4" />
                            打开
                          </Link>
                          <ProjectDeleteButton action={deleteProjectAction} projectName={project.name} />
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white/80 px-4 py-3 text-sm">
              <p className="text-stone-600">第 <span className="font-bold text-stone-950">{currentPage}</span> / {totalPages} 页，显示 {visibleProjects.length} / {filteredProjects.length} 个匹配项目。</p>
              <div className="flex items-center gap-2">
                <PageLink href={pageHref(filters, Math.max(1, currentPage - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" />上一页</PageLink>
                <PageLink href={pageHref(filters, Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>下一页<ChevronRight className="h-4 w-4" /></PageLink>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white/70 px-4 py-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-stone-950">{value}</p>
    </div>
  );
}

function Labeled({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-stone-500">{icon}{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-stone-500">{label}</p><p className="mt-1 truncate font-semibold">{value}</p></div>;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md bg-stone-100 px-2 py-2"><p className="font-bold text-stone-950">{value}</p><p className="mt-1 text-stone-500">{label}</p></div>;
}

function EmptyState({ title, description, action, href, icon }: { title: string; description: string; action: string; href: string; icon: React.ReactNode }) {
  return (
    <Card className="flex min-h-64 flex-col items-center justify-center text-center">
      {icon}
      <h2 className="mt-4 text-lg font-bold text-stone-950">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-stone-600">{description}</p>
      <Link href={href} className={`${buttonStyles.primary} mt-5`}>
        <Plus className="h-4 w-4" />
        {action}
      </Link>
    </Card>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-disabled={disabled} className={cn(buttonStyles.secondary, "h-9 px-3", disabled && "pointer-events-none opacity-50")}>
      {children}
    </Link>
  );
}
