-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "idea" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "targetUser" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "hermesRunId" TEXT,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "inputPrompt" TEXT NOT NULL,
    "rawOutput" TEXT,
    "parsedOutputJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ResearchRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coreFeaturesJson" TEXT NOT NULL,
    "strengthsJson" TEXT NOT NULL,
    "weaknessesJson" TEXT NOT NULL,
    "reusableIdeasJson" TEXT NOT NULL,
    "threatLevel" INTEGER NOT NULL,
    "reuseStrategy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Competitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "pdrs" DOUBLE PRECISION NOT NULL,
    "opportunityScore" INTEGER NOT NULL,
    "competitiveScore" INTEGER NOT NULL,
    "specificationScore" INTEGER NOT NULL,
    "prototypeScore" INTEGER NOT NULL,
    "promptReadinessScore" INTEGER NOT NULL,
    "redundancyRisk" INTEGER NOT NULL,
    "differentiationScore" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "risksJson" TEXT NOT NULL,
    "nextActionsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evaluation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneratedArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonitorJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "hermesCronJobId" TEXT,
    "schedule" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonitorJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonitorReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "differentiationDriftScore" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "alertsJson" TEXT NOT NULL,
    "recommendedActionsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonitorReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonitorReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MonitorJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ResearchRun_projectId_idx" ON "ResearchRun"("projectId");
CREATE INDEX "Competitor_projectId_idx" ON "Competitor"("projectId");
CREATE INDEX "Evaluation_projectId_idx" ON "Evaluation"("projectId");
CREATE INDEX "GeneratedArtifact_projectId_artifactType_idx" ON "GeneratedArtifact"("projectId", "artifactType");
CREATE INDEX "MonitorJob_projectId_idx" ON "MonitorJob"("projectId");
CREATE INDEX "MonitorReport_projectId_jobId_idx" ON "MonitorReport"("projectId", "jobId");
