CREATE TABLE "CompareResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reelId" TEXT NOT NULL,
    "leftTakeId" TEXT NOT NULL,
    "rightTakeId" TEXT NOT NULL,
    "leftTranscriptId" TEXT NOT NULL,
    "rightTranscriptId" TEXT NOT NULL,
    "intent" TEXT NOT NULL DEFAULT '',
    "textDiffJson" TEXT NOT NULL,
    "resultJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'done',
    "errorMessage" TEXT,
    "contextSnapshotId" TEXT,
    "aiCallId" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompareResult_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CompareResult_reelId_createdAt_idx" ON "CompareResult"("reelId", "createdAt");
