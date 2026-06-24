-- Multi-agent review system.

CREATE TABLE "AgentReview" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetArtifactId" TEXT,
  "targetChecksum" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "decision" TEXT,
  "round" INTEGER NOT NULL DEFAULT 1,
  "expectedRunCount" INTEGER NOT NULL DEFAULT 0,
  "completedRunCount" INTEGER NOT NULL DEFAULT 0,
  "synthesizeTaskId" TEXT,
  "synthesizeStartedAt" TIMESTAMP(3),
  "snapshotArtifactId" TEXT,
  "latestConsensusId" TEXT,
  "createdBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRun" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "taskId" TEXT,
  "agentKey" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "inputArtifactId" TEXT,
  "outputJson" JSONB,
  "outputArtifactId" TEXT,
  "traceId" TEXT,
  "promptVersion" TEXT NOT NULL,
  "model" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "maxRetries" INTEGER NOT NULL DEFAULT 5,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "isRetriedRun" BOOLEAN NOT NULL DEFAULT false,
  "supersededByRunId" TEXT,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentFinding" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "agentRunId" TEXT,
  "severity" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "evidenceJson" JSONB,
  "recommendation" TEXT,
  "confidence" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'open',
  "dedupeKey" TEXT NOT NULL,
  "isConsensusFinding" BOOLEAN NOT NULL DEFAULT false,
  "mergedIntoFindingId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AgentFinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentConsensus" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL,
  "taskId" TEXT,
  "decision" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "outputArtifactId" TEXT,
  "ruleResultJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentConsensus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentConsensusFinding" (
  "id" TEXT NOT NULL,
  "consensusId" TEXT NOT NULL,
  "findingId" TEXT NOT NULL,
  "rank" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentConsensusFinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentReview_projectId_targetType_round_key" ON "AgentReview"("projectId", "targetType", "round");
CREATE UNIQUE INDEX "AgentReview_synthesizeTaskId_key" ON "AgentReview"("synthesizeTaskId");
CREATE INDEX "AgentReview_projectId_targetType_createdAt_idx" ON "AgentReview"("projectId", "targetType", "createdAt");
CREATE INDEX "AgentReview_status_createdAt_idx" ON "AgentReview"("status", "createdAt");
CREATE INDEX "AgentReview_decision_createdAt_idx" ON "AgentReview"("decision", "createdAt");

CREATE INDEX "AgentRun_projectId_createdAt_idx" ON "AgentRun"("projectId", "createdAt");
CREATE INDEX "AgentRun_reviewId_agentKey_createdAt_idx" ON "AgentRun"("reviewId", "agentKey", "createdAt");
CREATE UNIQUE INDEX "AgentRun_reviewId_agentKey_active_key" ON "AgentRun"("reviewId", "agentKey") WHERE "supersededByRunId" IS NULL;
CREATE INDEX "AgentRun_taskId_idx" ON "AgentRun"("taskId");
CREATE INDEX "AgentRun_status_createdAt_idx" ON "AgentRun"("status", "createdAt");

CREATE INDEX "AgentFinding_projectId_createdAt_idx" ON "AgentFinding"("projectId", "createdAt");
CREATE INDEX "AgentFinding_reviewId_severity_status_idx" ON "AgentFinding"("reviewId", "severity", "status");
CREATE INDEX "AgentFinding_reviewId_dedupeKey_idx" ON "AgentFinding"("reviewId", "dedupeKey");
CREATE INDEX "AgentFinding_agentRunId_idx" ON "AgentFinding"("agentRunId");
CREATE UNIQUE INDEX "AgentFinding_reviewId_dedupeKey_consensus_key" ON "AgentFinding"("reviewId", "dedupeKey") WHERE "isConsensusFinding" = true AND "status" = 'open';

CREATE INDEX "AgentConsensus_projectId_createdAt_idx" ON "AgentConsensus"("projectId", "createdAt");
CREATE INDEX "AgentConsensus_reviewId_createdAt_idx" ON "AgentConsensus"("reviewId", "createdAt");
CREATE INDEX "AgentConsensus_taskId_idx" ON "AgentConsensus"("taskId");
CREATE INDEX "AgentConsensus_decision_createdAt_idx" ON "AgentConsensus"("decision", "createdAt");

CREATE UNIQUE INDEX "AgentConsensusFinding_consensusId_findingId_key" ON "AgentConsensusFinding"("consensusId", "findingId");
CREATE INDEX "AgentConsensusFinding_findingId_idx" ON "AgentConsensusFinding"("findingId");

ALTER TABLE "AgentReview" ADD CONSTRAINT "AgentReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AgentReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AsyncTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentFinding" ADD CONSTRAINT "AgentFinding_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AgentReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentFinding" ADD CONSTRAINT "AgentFinding_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentConsensus" ADD CONSTRAINT "AgentConsensus_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AgentReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentConsensus" ADD CONSTRAINT "AgentConsensus_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AsyncTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentConsensusFinding" ADD CONSTRAINT "AgentConsensusFinding_consensusId_fkey" FOREIGN KEY ("consensusId") REFERENCES "AgentConsensus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentConsensusFinding" ADD CONSTRAINT "AgentConsensusFinding_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AgentFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
