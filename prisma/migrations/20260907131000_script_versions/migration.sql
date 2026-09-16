-- AlterTable
ALTER TABLE "Reel" ADD COLUMN "selectedScriptId" TEXT;
ALTER TABLE "Reel" ADD COLUMN "finalScriptId" TEXT;

-- AlterTable
ALTER TABLE "Take" ADD COLUMN "scriptVersionId" TEXT;

-- CreateTable
CREATE TABLE "ScriptVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reelId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recordingJson" TEXT NOT NULL DEFAULT '{}',
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "parentId" TEXT,
    "contextSnapshotId" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "inventedIdeasJson" TEXT NOT NULL DEFAULT '[]',
    "inputSnapshotJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScriptVersion_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ScriptVersion_reelId_createdAt_idx" ON "ScriptVersion"("reelId", "createdAt");
