"use client";

import { createProject } from "@/app/actions";

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
          <p className="text-sm font-semibold text-zinc-950">项目命题</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            只输入你希望模型处理的命题。系统会先生成产品经理视角规划建议和汇报展示助手初稿，后续研究由你确认后触发。
          </p>
        </div>
        <textarea
          required
          name="idea"
          rows={4}
          className="rounded-lg border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="例如：为客户经理设计一个 AI 财富产品推荐与适当性审核系统"
        />
      </section>

      <section className="grid gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-950">补充解释</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            写明背景、约束、目标用户、业务目标、风险或面试输出要求。技术栈会在 PRD（产品需求文档）生成后再建议。
          </p>
        </div>
        <textarea
          name="ideaExplanation"
          rows={7}
          className="rounded-lg border border-zinc-300 bg-white p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="例如：面试时间 90 分钟，需要输出问题发现、需求定义、核心 3-5 个功能点、PRD、原型说明、路演大纲和可交给 Codex 的实现计划。"
        />
      </section>

      <div className="grid gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-4 text-sm leading-6 text-zinc-700">
        <p className="font-semibold text-zinc-950">创建后的流程</p>
        <p>创建后只生成项目规划建议和汇报展示助手初稿。你确认问题与用户、3-5 个核心功能后，才能运行 Hermes（智能体运行框架）研究。</p>
      </div>

      <div className="flex justify-end border-t border-zinc-200 pt-5">
        <button className="rounded-lg bg-zinc-950 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800">
          创建项目
        </button>
      </div>
    </form>
  );
}
