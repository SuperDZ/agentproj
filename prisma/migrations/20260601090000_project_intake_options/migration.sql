-- Add intake options captured by the new-project form.
ALTER TABLE "Project" ADD COLUMN "needFinancialSuitabilityCheck" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "needContinuousCompetitorMonitoring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "preferredTechStack" TEXT;
