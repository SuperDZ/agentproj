"use client";

import { createProject } from "@/app/actions";
import { buttonStyles, fieldStyles } from "@/components/ui";
import { ArrowRight, FileText, Loader2, Sparkles } from "lucide-react";
import { useFormStatus } from "react-dom";

function CreateProjectProgress() {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <div className="rounded-lg border border-brand-500/20 bg-brand-50 p-4 text-sm leading-6 text-stone-800 shadow-sm">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-brand-700" />
        <span className="font-semibold text-stone-950">正在创建项目</span>
      </div>
      <p className="mt-1 text-xs text-stone-600">系统正在保存项目、写入初始配置，并生成产品规划建议。完成后会自动进入项目工作台。</p>
    </div>
  );
}

function CreateProjectButton() {
  const { pending } = useFormStatus();

  return (
    <button disabled={pending} className={`${buttonStyles.primary} h-11 px-5`}>
      {pending ? "创建中..." : "创建项目"}
      {!pending ? <ArrowRight className="h-4 w-4" /> : null}
    </button>
  );
}

export function ProjectIntakeForm() {
  return (
    <form action={createProject} className="grid gap-7 p-6">
      <input type="hidden" name="industry" value="auto" />
      <input type="hidden" name="targetUser" value="auto" />
      <input type="hidden" name="financial" value="off" />
      <input type="hidden" name="monitoring" value="on" />
      <input type="hidden" name="modelProvider" value="deepseek" />
      <input type="hidden" name="modelName" value="deepseek-chat" />
      <input type="hidden" name="modelUsageMode" value="api" />

      <section className="grid gap-3 rounded-lg border border-brand-500/25 bg-white p-4 shadow-sm shadow-blue-950/[0.04] transition duration-200 hover:border-brand-500/45 hover:shadow-md hover:shadow-blue-950/[0.06] focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white shadow-sm shadow-blue-900/20">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-stone-950">项目命题</p>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">必填</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-stone-600">只输入希望系统处理的产品命题。系统会先生成产品经理视角的规划建议，后续调研由你确认后触发。</p>
          </div>
        </div>
        <textarea
          required
          name="idea"
          rows={4}
          className={`${fieldStyles} min-h-36 resize-y p-3 leading-6`}
          placeholder="例如：为客户经理设计一个 AI 财富产品推荐与适当性审核系统。"
        />
      </section>

      <section className="grid gap-3 rounded-lg border border-stone-200 bg-stone-50/70 p-4 transition duration-200 hover:border-stone-300 hover:bg-white focus-within:border-brand-500/70 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500/15">
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600">
            <FileText className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-stone-950">补充解释</p>
            <p className="mt-1 text-xs leading-5 text-stone-600">写明背景、约束、目标用户、业务目标、风险或输出要求。技术栈会在 PRD 生成后再建议。</p>
          </div>
        </div>
        <textarea
          name="ideaExplanation"
          rows={7}
          className={`${fieldStyles} min-h-44 resize-y p-3 leading-6`}
          placeholder="例如：面试时间 90 分钟，需要输出问题发现、需求定义、核心 3-5 个功能点、PRD、原型说明和可交给 Codex 的实现计划。"
        />
      </section>

      <div className="grid gap-2 rounded-lg border border-brand-500/15 bg-brand-50/80 p-4 text-sm leading-6 text-stone-700">
        <p className="font-bold text-stone-950">创建后的流程</p>
        <p>创建后只生成项目规划建议和汇报展示助手初稿。确认问题、用户和 3-5 个核心功能后，才运行 Hermes 调研。</p>
      </div>

      <CreateProjectProgress />

      <div className="flex justify-end border-t border-stone-200 pt-5">
        <CreateProjectButton />
      </div>
    </form>
  );
}
