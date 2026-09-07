-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
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
    CONSTRAINT "AiCall_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AiCall_reelId_createdAt_idx" ON "AiCall"("reelId", "createdAt");

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reelId" TEXT NOT NULL,
    "takeId" TEXT NOT NULL,
    "transcriptRevisionId" TEXT NOT NULL,
    "contextSnapshotId" TEXT,
    "previousReviewId" TEXT,
    "aiCallId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "resultJson" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Review_takeId_fkey" FOREIGN KEY ("takeId") REFERENCES "Take" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Review_aiCallId_fkey" FOREIGN KEY ("aiCallId") REFERENCES "AiCall" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Review_takeId_createdAt_idx" ON "Review"("takeId", "createdAt");
CREATE INDEX "Review_reelId_createdAt_idx" ON "Review"("reelId", "createdAt");

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reelId" TEXT NOT NULL,
    "reviewId" TEXT,
    "roundId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Question_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Question_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Question_reelId_createdAt_idx" ON "Question"("reelId", "createdAt");

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Answer_questionId_createdAt_idx" ON "Answer"("questionId", "createdAt");
