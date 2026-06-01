# SpecFlow Agent 代码审查报告（2026-06-01）

> 审查范围：当前最新提交 `374f292 Initial SpecFlow Agent scaffold: Hermes mock, evaluation engine, Prisma models, APIs, UI and tests`。
>
> 审查目标：继续复核上一轮修复后的 MVP 是否满足“可本地演示、可审计、可扩展到 real Hermes”的要求，并记录仍需处理的风险。

## 总体结论

当前版本已经具备较完整的 SpecFlow Agent MVP 骨架：Next.js App Router、Prisma/SQLite、本地 Hermes mock、PDRS 评分、PRD 与 Codex Pack 导出、Skills Catalog 与安全策略都已落地。相比早期版本，以下方面明显改善：

- `project-flow` service 集中承载 research / evaluation / export / monitor 的业务流程，减少了 API routes 与 Server Actions 的分叉风险。
- Hermes real-mode 的 run 状态已经做了 normalize，并新增 `completed_without_output` 语义，避免把“完成但无输出”的 run 当作正常 completed。
- PDRS 页面已经改为展示 live score + live reasons，saved evaluation 仅作为 snapshot badge 展示，避免了旧分数与新解释混用。
- `evaluation_report.md` 已包含子分数与 reasons，导出包离开 UI 后仍具备基本审计性。
- `POST /api/projects` 与 Server Action 共享项目创建 schema，修复了空 idea 与 boolean-like 字段解析问题。

但当前仍不是“完全无问题”的状态。最主要风险集中在：依赖与测试可复现性、real Hermes endpoint 适配深度、workspace 组件复杂度、service 层测试覆盖不足。

## P0 / 高优先级问题

### 1. 测试结果与仓库可复现性仍不匹配

**现状**

`package.json` 使用 semver range，例如 `next: ^14.2.23`、`vitest: ^2.1.8`，但仓库没有 `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`。当前环境执行 `npm test` 会因为 `vitest` 不存在而失败。

**影响**

- PR 描述中的“Vitest suite 已执行并全部通过”无法通过当前仓库复现。
- 不同机器可能解析到不同依赖版本，影响 Next、Prisma、Vitest 的行为。
- 面试或交付验收时，如果对方从干净环境拉仓库，无法确认测试通过状态。

**建议**

1. 在能访问 npm registry 的环境执行 `npm install` 并提交 `package-lock.json`。
2. 在 PR 描述中如实记录当前环境限制，避免写“已通过”但仓库无法复现。
3. 增加 CI：`npm ci`、`npm test`、`npx prisma validate`、`npm run build`。

## P1 / 中优先级问题

### 2. Real Hermes 输出 endpoint 仍是假设型适配

**现状**

Hermes client 会从 `response.output` / `response.result` / `response.rawOutput` 解析 research output。若真实 Hermes 使用单独的 `/runs/:id/output`、事件流、文件 artifact 或其他 endpoint，当前 adapter 仍不能自动完成最终 output 拉取。

**影响**

- Mock demo 稳定，但 real Hermes 接入时仍需要根据真实 API 调整 adapter。
- `completed_without_output` 可以避免错误解析，但无法解决“真实输出在别处”的问题。

**建议**

1. 在 `src/lib/hermes/client.ts` 中明确支持可配置 output endpoint，例如 `HERMES_RESEARCH_OUTPUT_PATH_TEMPLATE=/runs/{runId}/output`。
2. 为 `getRunResult` 增加 endpoint fallback 顺序：run detail → output endpoint → events 中的 final artifact。
3. 在 README real-mode 小节说明当前 endpoint 适配假设。

### 3. Workspace 页面仍是单体大组件

**现状**

`src/app/projects/[id]/page.tsx` 同时包含 Idea、Hermes Research、Competitor Matrix、Differentiation、PRD、PDRS、Codex Pack、Monitor Plan 的全部 JSX 与 helper functions。

**影响**

- 继续扩展 loading、轮询、错误展示、下载/复制状态时，页面会快速变难维护。
- Code review 难度较高，局部改动容易影响其他 step。

**建议**

拆分为：

```text
src/components/workspace/
├── idea-step.tsx
├── hermes-research-step.tsx
├── competitor-matrix-step.tsx
├── differentiation-step.tsx
├── prd-step.tsx
├── pdrs-step.tsx
├── codex-pack-step.tsx
└── monitor-plan-step.tsx
```

### 4. Service 层关键路径测试仍不足

**现状**

测试覆盖了纯函数：evaluation engine、Hermes mock/parser、Codex Pack generator、project schema。但当前最复杂、最容易出错的逻辑在 `src/lib/services/project-flow.ts`，例如：

- latest run 无 parsed output 时不 fallback 到旧 research。
- repeated export 不产生重复 artifacts。
- export 使用 final evaluation 写入 `evaluation_report.md`。
- `completed_without_output` 不覆盖 competitors。

这些路径目前没有直接单元测试。

**建议**

1. 为 service 层抽出更多纯函数，减少 Prisma mock 成本。
2. 或使用测试数据库覆盖关键路径。
3. 至少增加针对 `getLatestResearch`、Codex Pack final evaluation、artifact 去重的单元测试。

## P2 / 低优先级与可维护性问题

### 5. API 错误分类还可以更细

当前已统一 `handleApiError`，但普通 `Error` 都返回 500。Hermes API 调用失败、外部服务不可用、schema parse 失败可以进一步区分为 502/503/422，以便前端和调用方采取不同策略。

### 6. Evaluation snapshot 的 UI 展示仍较弱

数据库已持久化 `scoreReasonsJson`，但 UI 仅显示 saved snapshot 的 decision/PDRS badge。后续可以提供展开面板，展示 saved snapshot 的每个子分数及 reasons，形成完整审计链路。

### 7. README 可补充更多 real-mode 限制

README 已覆盖基本运行、安全边界和 mock/real mode，但建议补充：

- real Hermes endpoint 当前是 adapter 假设，需要按实际 Hermes API 调整。
- Mock mode 是默认演示路径。
- 当前仓库需要 lockfile 才能保证测试可复现。

## 已完成且值得保留的改进

- Hermes run 状态标准化与 `completed_without_output` 终态，避免无 output 的 completed run 误导后续流程。
- `getLatestResearch` 不再在 latest run 无 parsed output 时 fallback 到历史 research，降低 stale 展示风险。
- PDRS UI 展示 live score/live reasons，saved evaluation 仅作 snapshot 标识。
- `evaluation_report.md` 包含子分数与 reasons，Codex Pack 审计性更强。
- Project 创建 schema 已共享到 API route 与 Server Action。
- Clipboard fallback 已实现，非安全上下文下用户仍可手动复制完整 Codex Pack。

## 建议下一步修复顺序

1. **提交 lockfile 并跑通测试/构建/Prisma validate。**
2. **为 `project-flow` service 增加关键路径测试。**
3. **拆分 workspace step 组件。**
4. **为 real Hermes output endpoint 做可配置适配。**
5. **在 UI 中展示 saved evaluation snapshot 的 reasons。**

## 本次审查使用的命令

```bash
pwd && find .. -name AGENTS.md -print && git status --short && git log --oneline -5
nl -ba src/lib/services/project-flow.ts | sed -n '1,270p'
nl -ba src/lib/hermes/client.ts | sed -n '1,140p'
nl -ba src/app/projects/[id]/page.tsx | sed -n '1,180p'
nl -ba src/app/api/projects/route.ts | sed -n '1,80p'
nl -ba src/app/api/projects/[id]/research/route.ts | sed -n '1,80p'
nl -ba src/lib/export/codex-pack.ts | sed -n '94,130p'
nl -ba package.json | sed -n '1,50p'
rg --files -g 'package-lock.json' -g 'pnpm-lock.yaml' -g 'yarn.lock'
npm test
```

> 注：`npm test` 在当前环境失败，原因是依赖未安装，`vitest` 不存在；这与当前环境无法从 registry 安装依赖有关，也进一步说明需要提交 lockfile 并在可联网环境中验证。
