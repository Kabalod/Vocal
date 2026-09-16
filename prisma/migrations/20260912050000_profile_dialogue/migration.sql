-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "reelId" TEXT,
    "profileId" TEXT,
    "takeId" TEXT,
    "reviewId" TEXT,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "promptText" TEXT NOT NULL,
    "inputSnapshotJson" TEXT NOT NULL,
    "responseText" TEXT,
    "resultJson" TEXT,
    "errorMessage" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCall_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AiCall_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CreatorProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AiCall" ("id", "kind", "reelId", "profileId", "takeId", "reviewId", "model", "status", "promptText", "inputSnapshotJson", "responseText", "resultJson", "errorMessage", "promptTokens", "completionTokens", "createdAt")
SELECT "id", "kind", "reelId", NULL, "takeId", "reviewId", "model", "status", "promptText", "inputSnapshotJson", "responseText", "resultJson", "errorMessage", "promptTokens", "completionTokens", "createdAt" FROM "AiCall";
DROP TABLE "AiCall";
ALTER TABLE "new_AiCall" RENAME TO "AiCall";
CREATE INDEX "AiCall_reelId_createdAt_idx" ON "AiCall"("reelId", "createdAt");
CREATE INDEX "AiCall_profileId_createdAt_idx" ON "AiCall"("profileId", "createdAt");
CREATE TABLE "new_DialogueThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL DEFAULT 'reel',
    "reelId" TEXT,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DialogueThread_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DialogueThread_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CreatorProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DialogueThread" ("id", "scope", "reelId", "profileId", "createdAt", "updatedAt")
SELECT "id", "scope", "reelId", NULL, "createdAt", "updatedAt" FROM "DialogueThread";
DROP TABLE "DialogueThread";
ALTER TABLE "new_DialogueThread" RENAME TO "DialogueThread";
CREATE UNIQUE INDEX "DialogueThread_reelId_key" ON "DialogueThread"("reelId");
CREATE UNIQUE INDEX "DialogueThread_profileId_key" ON "DialogueThread"("profileId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
