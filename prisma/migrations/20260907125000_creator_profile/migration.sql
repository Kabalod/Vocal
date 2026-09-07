-- AlterTable
ALTER TABLE "Reel" ADD COLUMN "reelGoal" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Reel" ADD COLUMN "reelAudience" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Reel" ADD COLUMN "contextKeysJson" TEXT NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "CreatorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "currentRevisionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProfileRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProfileRevision_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CreatorProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ProfileRevision_profileId_createdAt_idx" ON "ProfileRevision"("profileId", "createdAt");

-- CreateTable
CREATE TABLE "ReelContextSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reelId" TEXT NOT NULL,
    "profileRevisionId" TEXT,
    "reelGoal" TEXT NOT NULL,
    "reelAudience" TEXT NOT NULL,
    "selectedKeysJson" TEXT NOT NULL,
    "assembledJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReelContextSnapshot_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ReelContextSnapshot_reelId_createdAt_idx" ON "ReelContextSnapshot"("reelId", "createdAt");
