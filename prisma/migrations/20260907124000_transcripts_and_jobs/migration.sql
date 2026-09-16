-- AlterTable
ALTER TABLE "Take" ADD COLUMN "selectedTranscriptId" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "stage" TEXT NOT NULL DEFAULT 'convert';
ALTER TABLE "Job" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Job" ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Job" ADD COLUMN "leaseUntil" DATETIME;
ALTER TABLE "Job" ADD COLUMN "leaseOwner" TEXT;

-- CreateTable
CREATE TABLE "TranscriptRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "takeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "segmentsJson" TEXT,
    "language" TEXT,
    "sttModel" TEXT,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TranscriptRevision_takeId_fkey" FOREIGN KEY ("takeId") REFERENCES "Take" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "TranscriptRevision_takeId_createdAt_idx" ON "TranscriptRevision"("takeId", "createdAt");
