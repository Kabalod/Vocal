-- AlterTable
ALTER TABLE "Reel" ADD COLUMN "finalTakeId" TEXT;

-- Backfill: selectedTakeId was the previous product final.
UPDATE "Reel"
SET "finalTakeId" = "selectedTakeId"
WHERE "selectedTakeId" IS NOT NULL
  AND "finalTakeId" IS NULL;
