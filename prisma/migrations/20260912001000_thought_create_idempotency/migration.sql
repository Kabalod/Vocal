-- CreateTable
CREATE TABLE "ThoughtCreateKey" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "reelId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ThoughtCreateKey_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ThoughtCreateKey_reelId_key" ON "ThoughtCreateKey"("reelId");
