# SpecFlow Agent 架构图与系统流程图

本文档描述当前代码实现下的系统结构和端到端业务流程。图中 `GET /api/projects/:id/research` 被定义为只读状态接口；任务推进由 `POST /api/projects/:id/research` 或 research worker 执行。

## 系统架构图

```mermaid
flowchart TB
  User["用户 / 产品负责人"]
  Browser["浏览器\nNext.js App Router 页面"]

  subgraph Frontend["前端界面层"]
    Home["首页 / 项目列表"]
    Intake["新建项目表单"]
    Workspace["项目工作台"]
    HermesPanel["Hermes 快速配置与资源管理"]
    StatusPanel["ResearchRun 状态面板"]
    ExportUI["Codex Pack / PPT / Prompt 导出界面"]
    OpsUI["/ops 运维页面"]
  end

  subgraph Web["Next.js 服务端层"]
    ServerActions["Server Actions\ncreateProject / save / evaluate / export"]
    ApiRoutes["API Routes\nprojects / research / hermes / export"]
    ProjectFlow["project-flow 服务层\n编排项目主流程"]
    AsyncTaskStore["AsyncTask store\n领取 / 重试 / 租约恢复"]
    CacheClient["Redis cache client\n缓存 / 限流 / 幂等 / pub-sub"]
    Observability["Observability\nlog / metric / span / model cost"]
    ArtifactStore["Artifact Storage\nDB inline / local file"]
    HermesClient["Hermes Adapter\nmock / local / real"]
    ModelClient["Model Client\nDeepSeek / DashScope / OpenAI-compatible"]
    SkillConfig["Skills / Tools 配置与推荐\nresource-config / project-recommendations"]
  end

  subgraph Worker["后台任务层"]
    ResearchWorker["research worker\n领取 AsyncTask / 刷新 Hermes / 心跳"]
  end

  subgraph Persistence["持久化层"]
    Postgres[("PostgreSQL")]
    Prisma["Prisma Client"]
    Project["Project"]
    ResearchRun["ResearchRun"]
    Competitor["Competitor"]
    Evaluation["Evaluation"]
    Artifact["GeneratedArtifact"]
    StoredArtifact["StoredArtifact"]
    AsyncTask["AsyncTask / AsyncTaskAttempt / WorkerHeartbeat"]
    OpsTables["OperationalEvent / MetricSample / TraceSpan / ModelInvocation"]
    MonitorJob["MonitorJob / MonitorReport"]
  end

  subgraph Coordination["缓存与协调层"]
    Redis[("Redis\n非事实源")]
  end

  subgraph HermesRuntime["Hermes 执行层"]
    RealHermes["Real Hermes HTTP API"]
    LocalHermes["Local Hermes CLI\npython -m hermes_cli.main"]
    MockHermes["Mock Hermes\n测试与演示"]
    HermesDashboard["Local Dashboard\nstart / stop / restart"]
  end

  subgraph LocalState["本机状态文件"]
    Env[".env"]
    ModelConfig[".next/hermes/model-config.json"]
    DashboardPid[".next/hermes/dashboard.pid"]
    SkillWhitelist["HERMES_LOCAL_ROOT/skills/safety-whitelist.json"]
    SkillCache[".cache/hermes/skills-inventory-cache"]
    ArtifactDir[".data/artifacts"]
  end

  User --> Browser
  Browser --> Home
  Browser --> Intake
  Browser --> Workspace
  Workspace --> HermesPanel
  Workspace --> StatusPanel
  Workspace --> ExportUI
  Browser --> OpsUI

  Intake --> ServerActions
  Workspace --> ServerActions
  Workspace --> ApiRoutes
  HermesPanel --> ApiRoutes
  StatusPanel --> ApiRoutes
  ExportUI --> ApiRoutes

  ServerActions --> ProjectFlow
  ApiRoutes --> ProjectFlow
  ApiRoutes --> CacheClient
  ApiRoutes --> ArtifactStore
  ApiRoutes --> Observability
  ProjectFlow --> HermesClient
  ProjectFlow --> ModelClient
  ProjectFlow --> SkillConfig
  ProjectFlow --> AsyncTaskStore
  ProjectFlow --> ArtifactStore
  ProjectFlow --> Observability
  ProjectFlow --> CacheClient
  ResearchWorker --> AsyncTaskStore
  ResearchWorker --> ProjectFlow
  ResearchWorker --> Observability

  ProjectFlow --> Prisma
  AsyncTaskStore --> Prisma
  ArtifactStore --> Prisma
  Observability --> Prisma
  ApiRoutes --> Prisma
  CacheClient --> Redis
  AsyncTaskStore --> Redis
  Prisma --> Postgres
  Postgres --> Project
  Postgres --> ResearchRun
  Postgres --> Competitor
  Postgres --> Evaluation
  Postgres --> Artifact
  Postgres --> StoredArtifact
  Postgres --> AsyncTask
  Postgres --> OpsTables
  Postgres --> MonitorJob

  HermesClient --> RealHermes
  HermesClient --> LocalHermes
  HermesClient --> MockHermes
  ApiRoutes --> HermesDashboard

  Env --> HermesClient
  Env --> ModelClient
  ModelConfig --> HermesClient
  DashboardPid --> HermesDashboard
  SkillWhitelist --> SkillConfig
  SkillCache --> SkillConfig
  ArtifactStore --> ArtifactDir
```

## 整体系统流程图

```mermaid
flowchart TD
  Start([开始])
  Input["录入项目命题\nidea / explanation / industry / targetUser / model config"]
  Validate["Zod 校验项目输入"]
  CreateProject["创建 Project"]
  SaveInitialArtifacts["保存初始 Artifact\nidea_explanation / model_config / monitor_preferences"]
  RecommendResources["基于全局 Skills / Tools 缓存\n生成项目级推荐"]
  InitialPlanning["调用 Hermes 或模型兜底\n生成项目规划建议"]
  ConfirmPlanning{"用户是否确认\n问题、用户、3-5 个核心功能？"}

  SavePlanning["保存 report_assistant_context"]
  ConfigureHermes["配置 Hermes\n模式、模型、Skills、Tools、白名单"]
  StartResearch["POST /api/projects/:id/research\n创建或复用 ResearchRun 并推进一次"]
  Idempotency["Redis 幂等键\nresearch:start:{projectId}"]
  ExistingRun{"是否已有 queued / running\nResearchRun？"}
  CreateRun["创建 queued ResearchRun\n保存 inputPrompt"]
  EnqueueAsyncTask["创建或复用 AsyncTask\nresearch.run"]
  ClaimRun["条件更新领取 AsyncTask\nqueued/waiting 或租约过期 running -> running"]
  RunningWithoutId{"running 且 hermesRunId 为空？"}
  ReturnExisting["返回现有记录\n不重复调用 Hermes"]

  HermesMode{"Hermes 模式"}
  MockRun["mock 模式\n生成模拟结构化研究结果"]
  LocalRun["local 模式\n执行本机 Hermes CLI"]
  RealRun["real 模式\n创建远程 Hermes run"]

  ParseLocal{"输出是否可解析？"}
  Fallback["写入 completed_with_fallback\n保留 rawOutput 供人工复核"]
  PersistRemoteId["持久化 hermesRunId\n状态 queued / running"]
  TaskWaiting["AsyncTask 进入 waiting\n设置 runAfter"]
  TaskRetry["普通异常退避重试\n30 秒 / 2 分钟 / 10 分钟"]
  TaskDead["超过 maxAttempts\n进入 dead"]

  WorkerLoop["research worker 循环"]
  WorkerHeartbeat["写入 WorkerHeartbeat"]
  ResetStale["恢复旧 ResearchRun\n长时间无 hermesRunId 的 running"]
  RefreshRemote["刷新已有 hermesRunId 的远程结果"]
  RemoteReady{"远程结果是否完成\n且有结构化输出？"}

  PersistResearch["持久化研究结果\nResearchRun / Competitor / resource log"]
  StatusRead["GET /api/projects/:id/research\n只读状态、事件和持久化结果"]
  CompetitorMatrix["展示竞品矩阵"]
  Differentiation["展示差异化判断"]

  GeneratePrd["生成或保存 PRD"]
  GenerateTechStack["生成技术栈建议"]
  SelectTechStack["选择技术栈"]
  Evaluate["运行 PDRS 评估"]
  ExportPack["导出 Codex Pack"]
  PrototypePrompt["生成原型设计 prompt"]
  Monitor["创建竞品监控任务"]
  End([进入实现或持续监控])

  Start --> Input --> Validate --> CreateProject --> SaveInitialArtifacts
  SaveInitialArtifacts --> RecommendResources --> InitialPlanning --> ConfirmPlanning
  ConfirmPlanning -- 否 --> SavePlanning
  SavePlanning --> ConfirmPlanning
  ConfirmPlanning -- 是 --> ConfigureHermes --> StartResearch --> Idempotency

  Idempotency --> ExistingRun
  ExistingRun -- 否 --> CreateRun --> EnqueueAsyncTask --> ClaimRun
  ExistingRun -- queued --> EnqueueAsyncTask
  ExistingRun -- running --> RunningWithoutId
  RunningWithoutId -- 是 --> ReturnExisting --> StatusRead
  RunningWithoutId -- 否 --> RefreshRemote

  ClaimRun --> HermesMode
  HermesMode -- mock --> MockRun --> PersistResearch
  HermesMode -- local --> LocalRun --> ParseLocal
  ParseLocal -- 是 --> PersistResearch
  ParseLocal -- 否 --> Fallback --> PersistResearch
  HermesMode -- real --> RealRun --> PersistRemoteId --> TaskWaiting --> StatusRead
  ClaimRun -- 执行异常 --> TaskRetry --> TaskWaiting
  TaskRetry -- 超过次数 --> TaskDead --> StatusRead

  WorkerLoop --> WorkerHeartbeat --> ResetStale --> ClaimRun
  WorkerLoop --> ClaimRun
  WorkerLoop --> RefreshRemote --> RemoteReady
  RemoteReady -- 否 --> TaskWaiting --> StatusRead
  RemoteReady -- 是 --> PersistResearch

  PersistResearch --> StatusRead --> CompetitorMatrix --> Differentiation
  Differentiation --> GeneratePrd --> GenerateTechStack --> SelectTechStack
  SelectTechStack --> Evaluate --> ExportPack --> PrototypePrompt --> Monitor --> End
```

## 关键边界

- 状态读取：`GET /api/projects/:id/research` 只读，不领取队列，不启动 Hermes。
- 任务推进：`POST /api/projects/:id/research` 推进一次；research worker 负责长期领取、刷新、重试和恢复。
- 并发控制：`AsyncTask` 使用条件更新和 `lockedBy + lockExpiresAt` 租约；`running && hermesRunId=null` 的 `ResearchRun` 不重复执行。
- Redis 边界：Redis 只用于缓存、限流、短期幂等键和 worker 唤醒信号，不保存核心任务状态。
- 可观测性：worker 生命周期、Hermes 调用、模型调用、Artifact 写入/下载/删除均写入 PostgreSQL 可观测性表，并由 `/ops` 展示。
- 产物存储：小文本可内联到数据库，大文件写入 `.data/artifacts`；数据库保存 metadata、checksum、版本和下载信息。
- 审计数据：原始 Hermes output、解析结果、竞品矩阵、资源使用日志和导出产物 metadata 均写入数据库。
- 本地配置：模型配置保存在 `.next/hermes/model-config.json`；保存配置不扫描或启动 dashboard。
