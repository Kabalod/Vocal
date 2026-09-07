-- CreateTable
CREATE TABLE "Reel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "initialNote" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "selectedTakeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Take" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reelId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "inputType" TEXT NOT NULL,
    "authorNote" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Take_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "originalName" TEXT NOT NULL,
    "videoPath" TEXT NOT NULL,
    "audioPath" TEXT,
    "durationSec" REAL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "takeId" TEXT,
    CONSTRAINT "Job_takeId_fkey" FOREIGN KEY ("takeId") REFERENCES "Take" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("audioPath", "createdAt", "durationSec", "errorCode", "errorMessage", "id", "originalName", "status", "updatedAt", "videoPath") SELECT "audioPath", "createdAt", "durationSec", "errorCode", "errorMessage", "id", "originalName", "status", "updatedAt", "videoPath" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Take_reelId_number_key" ON "Take"("reelId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Take_reelId_idempotencyKey_key" ON "Take"("reelId", "idempotencyKey");
