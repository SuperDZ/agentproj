# SpecFlow Agent

SpecFlow Agent 是一个本地优先的 AI Coding 产品决策系统。它在 AI 编写代码之前，先对产品想法做竞品研究、差异化判断、PRD 生成、PDRS（Product Decision Readiness Score，产品决策就绪分）评分和 Codex Pack（实现任务包）导出。

## 核心流程

```text
想法录入
-> Hermes 研究任务
-> 竞品矩阵
-> 差异化评估
-> PRD 生成
-> PDRS 评分门禁
-> Codex Pack 导出
-> 轻量级竞品监控计划
```

## 技术栈

- Next.js App Router
- React 19（使用 `useActionState` 处理客户端表单状态）
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL（默认业务数据库）
- Hermes adapter，支持 `mock`、`real`、`local` 三种模式
- `project-flow` 共享服务层，复用 Server Actions 和 API routes 的业务流程
- Zod JSON schema 校验
- Vitest 单元测试

## 本地运行

```bash
npm install
cp .env.example .env
npx prisma db push
npm run dev
```

启动后打开 <http://localhost:3000>。页面支持中英文切换；中文模式下，主体内容使用中文，专业名词在首次出现时补充中文解释。

Hermes 研究任务使用持久队列，不在 Next.js API route 请求生命周期内直接执行。开发时需要另开一个终端启动研究 worker：

```bash
npm run worker:research
```

如果只想处理一轮队列任务，可执行：

```bash
npm run worker:research:once
```

没有运行 worker 时，点击“运行 Hermes 研究”只会创建 `queued` 状态的 `ResearchRun`，任务不会继续执行。

## Hermes 接入

默认使用 `HERMES_MODE=mock`，不依赖外部服务即可完整演示。

### 研究任务队列与 worker

`POST /api/projects/:id/research` 只负责创建或复用一个持久化 `ResearchRun`：

- 新任务写入 `queued` 状态，并保存研究输入 prompt。
- worker 领取最早的 `queued` 任务，通过条件更新改为 `running`，避免多个 worker 重复领取。
- `mock` 和 `local` 模式由 worker 同步执行 Hermes，并把结构化输出、竞品矩阵和完成状态写回数据库。
- `real` 模式由 worker 先创建远程 Hermes run 并持久化 `hermesRunId`；后续 worker 轮询远程结果，拿到结构化输出后完成写入。
- `running` 且没有 `hermesRunId` 的任务如果超过恢复阈值，会被视为 worker 崩溃遗留任务并重新置为 `queued`。

生产或长期运行环境必须同时运行 Web 服务和研究 worker。推荐最少部署两个进程：

```bash
npm run start
npm run worker:research
```

### 本机 Hermes 源码模式

本仓库支持连接本机 Hermes 项目。启用时在本地 `.env` 中配置 `HERMES_MODE=local`，并设置 Hermes 源码目录、Python 解释器、超时时间和模型供应商。具体本机路径不要提交到公开 README。

`local` 模式会通过 Python 直接执行：

```bash
py -m hermes_cli.main chat -q "<research prompt>" --quiet --source specflow
```

Hermes 输出必须是符合项目 Zod schema 的 JSON 对象。系统会保存原始输出，并将解析后的竞品、PRD、差异化建议和监控计划写入本地数据库。

注意：本机当前没有把 `hermes` 命令加入 PATH。`local` 模式不依赖 `hermes` 命令名，而是直接使用 `HERMES_LOCAL_PYTHON` 指向的虚拟环境 Python。

### 真实 Hermes HTTP 服务模式

如果接入远程 Hermes API，在本地 `.env` 中配置 `HERMES_MODE=real`、`HERMES_API_BASE_URL` 和 `HERMES_API_KEY`。真实服务地址和密钥不要写入公开 README。

如果真实 Hermes API 将最终 research output 放在 `/runs/{runId}` 之外，可配置：

```env
HERMES_RESEARCH_OUTPUT_PATH_TEMPLATE="/runs/{runId}/output"
```

未配置该变量时，adapter 会先读取 run detail，再尝试从 `/runs/{runId}/events` 提取 final artifact。

## 环境变量

公开 README 只列变量名和用途，不提供本机路径、账号、密码、API 地址或密钥。完整本地示例写在 `readme_env.md`，该文件已加入 `.gitignore`，不要上传。

- `DATABASE_URL`：Prisma 连接 PostgreSQL 的完整连接串。
- `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`：本地数据库连接参数。
- `HERMES_MODE`：Hermes 运行模式，可选 `mock`、`local`、`real`。
- `HERMES_API_BASE_URL`、`HERMES_API_KEY`：远程 Hermes API 地址和密钥。
- `HERMES_RESEARCH_OUTPUT_PATH_TEMPLATE`：远程 Hermes 最终 research output 的可选路径模板。
- `HERMES_RESEARCH_WORKER_POLL_MS`：worker 空闲轮询间隔。
- `HERMES_RESEARCH_STALE_RUNNING_MS`：无 `hermesRunId` 的 `running` 任务恢复阈值。
- `HERMES_LOCAL_ROOT`、`HERMES_LOCAL_PYTHON`、`HERMES_LOCAL_TIMEOUT_MS`：本机 Hermes 源码模式配置。
- `HERMES_INFERENCE_PROVIDER`、`HERMES_INFERENCE_MODEL`：Hermes 或模型调用默认供应商与模型名。

数据库默认使用 PostgreSQL。Prisma 运行时直接读取 `DATABASE_URL`。

`HERMES_RESEARCH_WORKER_POLL_MS` 控制 worker 空闲时的轮询间隔，默认 5000 毫秒。`HERMES_RESEARCH_STALE_RUNNING_MS` 控制无 `hermesRunId` 的 `running` 任务多久后恢复为 `queued`，默认 900000 毫秒（15 分钟）。

## 导出内容

Codex Pack 会导出一组面向实现的 Markdown 文件：

- `README.md`
- `PRD.md`
- `competitor_report.md`
- `evaluation_report.md`
- `api_spec.md`
- `tasks.md`
- `codex_prompt.md`
- `monitor_plan.md`

工作区页面支持整体复制导出包，也支持逐文件查看和下载。

## 测试与验收

```bash
npm test
npm run lint
npm run build
npx tsc --noEmit
npx prisma validate
npm audit --audit-level=high
```

React 19 运行时能力可用以下命令验证：

```bash
node -e "const React=require('react'); process.exit(typeof React.useActionState === 'function' ? 0 : 1)"
```

研究 worker 的单轮处理可用以下命令验证：

```bash
npm run worker:research:once
```

注意：该命令会真实领取当前数据库中的 `queued` 或可刷新的 `running` 研究任务。仅在确认当前数据库任务可被处理时执行。

当前 code review 报告见：

- [`docs/reviews/2026-06-01-code-review.md`](docs/reviews/2026-06-01-code-review.md)

## 安全边界

1. 第三方 skills（技能）默认只作为参考文档，不会自动执行。
2. Hermes `real` 和 `local` 模式只通过 `src/lib/hermes/client.ts` 调用。
3. 原始 Hermes output 会被持久化，便于审计。
4. 解析后的 Hermes output 使用 Zod schema 校验。
5. PDRS 评分由本地规则引擎计算。
6. 金融类产品输出不得承诺收益、本金保护、确定性结果或无风险。
7. Hermes terminal、browser、file tools 在未来启用前必须经过审批，并运行在隔离环境中。
