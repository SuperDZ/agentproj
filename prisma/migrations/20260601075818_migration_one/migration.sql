-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "idea" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "targetUser" TEXT NOT NULL,
    "needFinancialSuitabilityCheck" BOOLEAN NOT NULL DEFAULT false,
    "needContinuousCompetitorMonitoring" BOOLEAN NOT NULL DEFAULT false,
    "preferredTechStack" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Project" ("createdAt", "id", "idea", "industry", "name", "needContinuousCompetitorMonitoring", "needFinancialSuitabilityCheck", "preferredTechStack", "status", "targetUser", "updatedAt") SELECT "createdAt", "id", "idea", "industry", "name", "needContinuousCompetitorMonitoring", "needFinancialSuitabilityCheck", "preferredTechStack", "status", "targetUser", "updatedAt" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
