-- Persist explainable sub-score reasons for evaluation snapshots.
ALTER TABLE "Evaluation" ADD COLUMN "scoreReasonsJson" TEXT NOT NULL DEFAULT '{}';
