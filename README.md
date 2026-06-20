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

系统架构图和端到端流程图见 [`docs/architecture-and-flow.md`](docs/architecture-and-flow.md)。

## 技术栈

- Next.js App Router
- React 19（使用 `useActionState` 处理客户端表单状态）
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL（默认业务数据库）
- Redis（缓存、限流、幂等键和 worker 唤醒信号；不保存核心任务状态）
- Hermes adapter，支持 `mock`、`real`、`local` 三种模式
- `project-flow` 共享服务层，复用 Server Actions 和 API routes 的业务流程
- Zod JSON schema 校验
- Vitest 单元测试

## 生产化能力

当前实现采用“PostgreSQL 做持久化事实源，Redis 做缓存与协调加速”的架构。

- AsyncTask：`AsyncTask`、`AsyncTaskAttempt`、`WorkerHeartbeat` 负责 durable queue、重试、租约恢复和 worker 心跳。任务状态以 PostgreSQL 为准，Redis 只负责唤醒信号和短期幂等键。
- Redis Cache：缓存项目列表、项目详情、Skills inventory 和 GitHub Skill search 结果；同时用于 GitHub Skill search 限流和 `research:start:{projectId}` 防连点。
- Observability：`OperationalEvent`、`MetricSample`、`TraceSpan`、`ModelInvocation` 记录结构化日志、指标、链路片段和模型调用 token/成本信息。`/ops` 页面展示最近任务、dead/failed 任务、worker 心跳、错误日志、模型调用和 Artifact 占用。
- Artifact Storage：小文本继续写入数据库，大文件写入 `ARTIFACT_STORAGE_DIR`。数据库只保存 metadata、checksum、版本和下载信息；删除项目时会同步清理本地 artifact 目录。

## 本地运行

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

复制 `.env.example` 后，至少需要保留数据库、Redis/缓存、AsyncTask 租约、Artifact Storage 和 Hermes 模式相关配置。`REDIS_URL` 缺失时系统会跳过缓存、限流和 worker pub/sub 唤醒；`ARTIFACT_STORAGE_DIR` 缺失时大文件 artifact 会落到默认 `.data/artifacts`；`ASYNC_TASK_LOCK_TTL_MS` 缺失时 worker 租约默认 120000 毫秒。

启动后打开 <http://localhost:3000>。页面支持中英文切换；中文模式下，主体内容使用中文，专业名词在首次出现时补充中文解释。

Hermes 研究任务使用 PostgreSQL durable queue。点击“运行 Hermes 研究”会创建或复用 `ResearchRun`，并创建或复用 `AsyncTask(type=research.run)`；当前 `POST` 请求会在拿到幂等键时推进一次任务。状态读取接口只返回数据库中的当前记录，不会在页面轮询时隐式启动或重复推进任务。

长期运行或批量处理时，也可以另开一个终端启动研究 worker，让它持续领取队列和刷新远程结果：

```bash
npm run worker:research
```

如果只想处理一轮队列任务，可执行：

```bash
npm run worker:research:once
```

没有运行 worker 时，页面点击仍会推进当前项目一次；如果远程 Hermes 任务进入异步 `queued` 或 `running` 状态，需要再次点击或启动 worker 才会继续刷新远程结果。生产、长任务和批量处理场景应运行 worker。

## Hermes 接入

默认使用 `HERMES_MODE=real`，面向真实 Hermes HTTP API。未配置 `HERMES_API_BASE_URL` 时，真实调用会直接失败并暴露配置错误，不会自动回退到 mock。

### 研究任务队列与 worker

`POST /api/projects/:id/research` 会创建或复用一个持久化 `ResearchRun`，再通过 `AsyncTask` 推进该任务一次：

- 新任务写入 `queued` 状态，并保存研究输入 prompt。
- API 请求会把 `research.run` 任务写入 `AsyncTask`；worker 通过条件更新把 `queued/waiting` 或租约过期的 `running` 任务领取为 `running`，避免重复领取。
- 如果任务已经是 `running` 且尚未拿到 `hermesRunId`，新的 API 请求只返回现有记录，不会重复调用 Hermes。
- `mock` 和 `local` 模式由 API 请求或 worker 同步执行 Hermes，并把结构化输出、竞品矩阵和完成状态写回数据库。
- `real` 模式由 API 请求或 worker 先创建远程 Hermes run 并持久化 `hermesRunId`；后续由 worker 或再次提交研究请求刷新远程结果，拿到结构化输出后完成写入。
- Hermes pending 不计为失败；任务进入 `waiting`，并按 `runAfter` 后续恢复。普通异常按 30 秒、2 分钟、10 分钟退避重试，超过 `maxAttempts` 后进入 `dead`。
- `GET /api/projects/:id/research` 是只读状态接口，只读取当前项目的 `ResearchRun`、Hermes 事件和持久化结果，不启动 Hermes 调用，不领取队列任务。
- `ResearchRun` 中 `running` 且没有 `hermesRunId` 的旧任务如果超过恢复阈值，会被重新置为 `queued`；`AsyncTask` 使用 `lockedBy + lockExpiresAt` 做 worker 租约恢复。
- `local` 模式如果 Hermes CLI 返回不可解析 JSON，会写入 `completed_with_fallback` 状态，并保留 `rawOutput` 供人工复核。

生产或长期运行环境必须同时运行 Web 服务和研究 worker。推荐最少部署两个进程：

```bash
npm run start
npm run worker:research
```

### 本机 Hermes 源码模式

本仓库支持连接本机 Hermes 项目。启用时在本地 `.env` 中配置 `HERMES_MODE=local`，并设置 Hermes 源码目录、Python 解释器、超时时间和模型供应商。具体本机路径不要提交到公开 README。

`local` 模式会通过 Python 直接执行：

```bash
python -m hermes_cli.main --provider "<provider>" -m "<model>" -z "<research prompt>" --ignore-user-config --ignore-rules
```

Hermes 输出必须是符合项目 Zod schema 的 JSON 对象。系统会保存原始输出，并将解析后的竞品、PRD、差异化建议和监控计划写入本地数据库。输出不可解析时，系统不会再伪装成普通完成状态，而是使用 `completed_with_fallback` 标记本地兜底结果。

注意：本机当前没有把 `hermes` 命令加入 PATH。`local` 模式不依赖 `hermes` 命令名，而是直接使用 `HERMES_LOCAL_PYTHON` 指向的虚拟环境 Python。

Hermes 控制面板支持启动、停止、重启本机 dashboard。PID 文件保存在 `.next/hermes/dashboard.pid`，读取时会校验进程是否仍存在；陈旧 PID 会被自动清理。

模型配置可在 Hermes 控制面板保存。保存内容位于 `.next/hermes/model-config.json`，优先级高于环境变量；如果未保存，则回退到 `HERMES_LOCAL_PROVIDER`、`HERMES_LOCAL_MODEL`、`HERMES_INFERENCE_PROVIDER` 和 `HERMES_INFERENCE_MODEL`。保存模型配置只写入配置文件，不会隐式扫描或启动 Hermes dashboard；运行状态由控制面板的状态接口单独读取。

`usageMode=codex-cli` 目前只保存配置，不接入本地 Hermes 运行器。实际执行 local Hermes 时必须切换为 `api`。

### Skills/Tools 安全导入

Hermes 控制面板可以搜索 GitHub Skills（技能）并导入到本机 Hermes。导入前必须满足以下条件：

- 来源已经加入本机白名单，白名单文件位于 `HERMES_LOCAL_ROOT/skills/safety-whitelist.json`。
- 搜索结果安全状态必须为 `passed`；`failed` 来源即使曾经加入白名单也会被拒绝。
- 服务端只使用白名单校验后的规范化来源作为安装目标，忽略请求体中不一致的 `identifier`，防止白名单绕过。
- 导入通过 Hermes CLI 执行 `skills install`，不会使用旧的直接 `git clone` 路径。

白名单只代表本机人工复核或官方内置信任，不代表全网安全认证。导入第三方 Skill 前必须复核来源、许可证、脚本内容、依赖和 Prompt Injection（提示注入）风险。

### 真实 Hermes HTTP 服务模式

远程 Hermes API 是默认模式。在本地 `.env` 中配置 `HERMES_MODE=real`、`HERMES_API_BASE_URL` 和 `HERMES_API_KEY`。真实服务地址和密钥不要写入公开 README。

如果真实 Hermes API 将最终 research output 放在 `/runs/{runId}` 之外，可配置：

```env
HERMES_RESEARCH_OUTPUT_PATH_TEMPLATE="/runs/{runId}/output"
```

未配置该变量时，adapter 会先读取 run detail，再尝试从 `/runs/{runId}/events` 提取 final artifact。

## 环境变量

公开 README 只列变量名和用途，不提供本机路径、账号、密码、API 地址或密钥。完整本地示例写在 `readme_env.md`，该文件已加入 `.gitignore`，不要上传。

- `DATABASE_URL`：Prisma 连接 PostgreSQL 的完整连接串。
- `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`：本地数据库连接参数。
- `REDIS_URL`、`CACHE_ENABLED`、`CACHE_DEFAULT_TTL_SECONDS`：Redis 缓存、幂等键、限流和 worker 唤醒配置。Redis 不保存核心任务状态；未配置 `REDIS_URL` 时缓存与 pub/sub 协调能力关闭。
- `ASYNC_TASK_LOCK_TTL_MS`：AsyncTask worker 租约时长，租约过期后其他 worker 可恢复任务；默认 120000 毫秒。
- `ARTIFACT_STORAGE_DIR`、`ARTIFACT_INLINE_MAX_BYTES`：Artifact Storage 本地目录和数据库内联阈值；默认分别为 `.data/artifacts` 和 262144 字节。
- `HERMES_MODE`：Hermes 运行模式，可选 `real`、`local`、`mock`；未设置时按 `real` 处理。
- `HERMES_API_BASE_URL`、`HERMES_API_KEY`：远程 Hermes API 地址和密钥。
- `HERMES_RESEARCH_OUTPUT_PATH_TEMPLATE`：远程 Hermes 最终 research output 的可选路径模板。
- `HERMES_RESEARCH_WORKER_POLL_MS`：worker 空闲轮询间隔。
- `HERMES_RESEARCH_STALE_RUNNING_MS`：无 `hermesRunId` 的 `running` 任务恢复阈值。
- `HERMES_LOCAL_ROOT`、`HERMES_LOCAL_PYTHON`、`HERMES_LOCAL_TIMEOUT_MS`：本机 Hermes 源码模式配置。
- `HERMES_LOCAL_PROVIDER`、`HERMES_LOCAL_MODEL`：本机 Hermes 模式的模型供应商与模型名。
- `HERMES_INFERENCE_PROVIDER`、`HERMES_INFERENCE_MODEL`：Hermes 或模型调用默认供应商与模型名。
- `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`：DeepSeek 兼容接口的密钥和可选自定义地址。
- `DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`：通义千问 DashScope 兼容接口的密钥和可选自定义地址。
- `OPENAI_API_KEY`、`OPENAI_BASE_URL`：OpenAI 兼容接口的密钥和可选自定义地址。
- `GITHUB_TOKEN`、`GH_TOKEN`：可选 GitHub API token，用于降低 GitHub 搜索、仓库信息读取和 Skill 导入元数据请求的限流风险。

数据库默认使用 PostgreSQL。Prisma 运行时直接读取 `DATABASE_URL`。

`HERMES_RESEARCH_WORKER_POLL_MS` 控制 worker 空闲时的轮询间隔，默认 5000 毫秒。`HERMES_RESEARCH_STALE_RUNNING_MS` 控制无 `hermesRunId` 的 `running` 任务多久后恢复为 `queued`，默认 900000 毫秒（15 分钟）。`NODE_ENV`、`PATH`、`PATHEXT`、`PYTHONPATH` 属于系统或运行时环境变量，不作为项目 `.env` 必填项；`SPECFLOW_WORKER_ID` 会在 worker 启动时自动生成。

## 运维页面

打开 `/ops` 可以查看生产化运行状态：最近 AsyncTask、dead/failed 任务、worker 心跳、最近错误日志、模型调用次数、token、估算成本以及 Artifact Storage 占用。该页面读取 PostgreSQL 中的可观测性表，不依赖外部 APM 平台。

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
服务端会同时写入 Artifact Storage：Codex Pack 额外生成 `codex-pack.zip`，汇报材料会生成 PPTX、Word 兼容 HTML 和 prompt/package 文件。下载接口为 `GET /api/projects/:id/artifacts/:artifactId/download`，列表接口为 `GET /api/projects/:id/artifacts`。

## 测试与验收

```bash
npm test
npm run lint
npm run build
npx tsc --noEmit
npx prisma validate
npm audit --audit-level=high
```

Windows PowerShell 如果禁止执行 `npm.ps1`，使用以下命令：

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

React 19 运行时能力可用以下命令验证：

```bash
node -e "const React=require('react'); process.exit(typeof React.useActionState === 'function' ? 0 : 1)"
```

研究 worker 的单轮处理可用以下命令验证：

```bash
npm run worker:research:once
```

注意：该命令会真实领取当前数据库中的 `queued` 任务，或刷新已经持久化 `hermesRunId` 的 `running` 任务。仅在确认当前数据库任务可被处理时执行。

当前 code review 报告见：

- [`docs/reviews/2026-06-01-code-review.md`](docs/reviews/2026-06-01-code-review.md)

## 安全边界

1. 第三方 skills（技能）默认只作为参考文档，不会自动执行。
2. 第三方 Skill 导入必须先通过本机白名单和安全状态校验，安装目标以服务端规范化后的可信来源为准。
3. Hermes `real` 和 `local` 模式只通过 `src/lib/hermes/client.ts` 调用。
4. 原始 Hermes output 会被持久化，便于审计。
5. 解析后的 Hermes output 使用 Zod schema 校验。
6. 无法解析的 local Hermes 输出会进入 `completed_with_fallback`，需要人工复核。
7. PDRS 评分由本地规则引擎计算。
8. 金融类产品输出不得承诺收益、本金保护、确定性结果或无风险。
9. Hermes terminal、browser、file tools 在未来启用前必须经过审批，并运行在隔离环境中。
