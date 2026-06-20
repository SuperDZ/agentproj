"use client";

import { createProject } from "@/app/actions";
import { buttonStyles, fieldStyles } from "@/components/ui";
import { useFormStatus } from "react-dom";

function CreateProjectProgress() {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-teal-900">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-teal-700" />
        <span className="font-semibold">正在创建项目</span>
      </div>
      <p className="mt-1 text-xs">系统正在保存项目、写入初始配置，并生成产品规划建议。完成后会自动进入项目工作台。</p>
    </div>
  );
}

function CreateProjectButton() {
  const { pending } = useFormStatus();

  return (
    <button disabled={pending} className={buttonStyles.primary}>
      {pending ? "创建中..." : "创建项目"}
    </button>
  );
}

export function ProjectIntakeForm() {
  return (
    <form action={createProject} className="grid gap-6 p-5">
      <input type="hidden" name="industry" value="auto" />
      <input type="hidden" name="targetUser" value="auto" />
      <input type="hidden" name="financial" value="off" />
      <input type="hidden" name="monitoring" value="on" />
      <input type="hidden" name="modelProvider" value="deepseek" />
      <input type="hidden" name="modelName" value="deepseek-chat" />
      <input type="hidden" name="modelUsageMode" value="api" />

      <section className="grid gap-3">
        <div>
          <p className="text-sm font-bold text-stone-950">项目命题</p>
          <p className="mt-1 text-xs leading-5 text-stone-500">只输入希望系统处理的产品命题。系统会先生成产品经理视角的规划建议，后续调研由你确认后触发。</p>
        </div>
        <textarea
          required
          name="idea"
          rows={4}
          className={`${fieldStyles} min-h-32 p-3`}
          placeholder="例如：为客户经理设计一个 AI 财富产品推荐与适当性审核系统。"
        />
      </section>

      <section className="grid gap-3">
        <div>
          <p className="text-sm font-bold text-stone-950">补充解释</p>
          <p className="mt-1 text-xs leading-5 text-stone-500">写明背景、约束、目标用户、业务目标、风险或输出要求。技术栈会在 PRD 生成后再建议。</p>
        </div>
        <textarea
          name="ideaExplanation"
          rows={7}
          className={`${fieldStyles} min-h-44 p-3`}
          placeholder="例如：面试时间 90 分钟，需要输出问题发现、需求定义、核心 3-5 个功能点、PRD、原型说明和可交给 Codex 的实现计划。"
        />
      </section>

      <div className="grid gap-2 rounded-lg border border-teal-100 bg-teal-50/70 p-4 text-sm leading-6 text-stone-700">
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
