-- Async task productionization
CREATE TABLE "AsyncTask" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "projectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "resultJson" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT,
    "lockExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AsyncTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AsyncTaskAttempt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "error" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "AsyncTaskAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "pid" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- Observability
CREATE TABLE "OperationalEvent" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "traceId" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MetricSample" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "tagsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSample_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TraceSpan" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "spanId" TEXT NOT NULL,
    "parentSpanId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "projectId" TEXT,
    "taskId" TEXT,
    "attributesJson" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "TraceSpan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModelInvocation" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "latencyMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "projectId" TEXT,
    "traceId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelInvocation_pkey" PRIMARY KEY ("id")
);

-- Artifact metadata with local file storage support
CREATE TABLE "StoredArtifact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "generatedArtifactId" TEXT,
    "artifactType" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "textPreview" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerHeartbeat_workerId_key" ON "WorkerHeartbeat"("workerId");
CREATE UNIQUE INDEX "TraceSpan_spanId_key" ON "TraceSpan"("spanId");
CREATE UNIQUE INDEX "StoredArtifact_projectId_storageKey_key" ON "StoredArtifact"("projectId", "storageKey");

CREATE INDEX "AsyncTask_status_runAfter_priority_createdAt_idx" ON "AsyncTask"("status", "runAfter", "priority", "createdAt");
CREATE INDEX "AsyncTask_projectId_type_status_idx" ON "AsyncTask"("projectId", "type", "status");
CREATE INDEX "AsyncTask_lockedBy_lockExpiresAt_idx" ON "AsyncTask"("lockedBy", "lockExpiresAt");
CREATE INDEX "AsyncTaskAttempt_taskId_startedAt_idx" ON "AsyncTaskAttempt"("taskId", "startedAt");
CREATE INDEX "AsyncTaskAttempt_workerId_startedAt_idx" ON "AsyncTaskAttempt"("workerId", "startedAt");
CREATE INDEX "WorkerHeartbeat_status_lastSeenAt_idx" ON "WorkerHeartbeat"("status", "lastSeenAt");
CREATE INDEX "OperationalEvent_createdAt_idx" ON "OperationalEvent"("createdAt");
CREATE INDEX "OperationalEvent_level_createdAt_idx" ON "OperationalEvent"("level", "createdAt");
CREATE INDEX "OperationalEvent_projectId_createdAt_idx" ON "OperationalEvent"("projectId", "createdAt");
CREATE INDEX "OperationalEvent_taskId_createdAt_idx" ON "OperationalEvent"("taskId", "createdAt");
CREATE INDEX "OperationalEvent_traceId_idx" ON "OperationalEvent"("traceId");
CREATE INDEX "MetricSample_name_createdAt_idx" ON "MetricSample"("name", "createdAt");
CREATE INDEX "TraceSpan_traceId_startedAt_idx" ON "TraceSpan"("traceId", "startedAt");
CREATE INDEX "TraceSpan_projectId_startedAt_idx" ON "TraceSpan"("projectId", "startedAt");
CREATE INDEX "TraceSpan_taskId_startedAt_idx" ON "TraceSpan"("taskId", "startedAt");
CREATE INDEX "TraceSpan_status_startedAt_idx" ON "TraceSpan"("status", "startedAt");
CREATE INDEX "ModelInvocation_provider_model_createdAt_idx" ON "ModelInvocation"("provider", "model", "createdAt");
CREATE INDEX "ModelInvocation_projectId_createdAt_idx" ON "ModelInvocation"("projectId", "createdAt");
CREATE INDEX "ModelInvocation_traceId_idx" ON "ModelInvocation"("traceId");
CREATE INDEX "ModelInvocation_status_createdAt_idx" ON "ModelInvocation"("status", "createdAt");
CREATE INDEX "StoredArtifact_projectId_artifactType_createdAt_idx" ON "StoredArtifact"("projectId", "artifactType", "createdAt");
CREATE INDEX "StoredArtifact_generatedArtifactId_idx" ON "StoredArtifact"("generatedArtifactId");

ALTER TABLE "AsyncTask" ADD CONSTRAINT "AsyncTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AsyncTaskAttempt" ADD CONSTRAINT "AsyncTaskAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AsyncTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AsyncTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TraceSpan" ADD CONSTRAINT "TraceSpan_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AsyncTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModelInvocation" ADD CONSTRAINT "ModelInvocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoredArtifact" ADD CONSTRAINT "StoredArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoredArtifact" ADD CONSTRAINT "StoredArtifact_generatedArtifactId_fkey" FOREIGN KEY ("generatedArtifactId") REFERENCES "GeneratedArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
