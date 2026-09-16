-- CreateTable
CREATE TABLE "ScriptDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reelId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "sourceKind" TEXT NOT NULL DEFAULT 'manual',
    "baseVersionId" TEXT,
    "saveToken" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScriptDraft_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ScriptDraft_reelId_key" ON "ScriptDraft"("reelId");
