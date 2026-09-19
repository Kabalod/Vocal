-- AlterTable
ALTER TABLE "Reel" ADD COLUMN "ownerUserId" TEXT NOT NULL DEFAULT 'local';
CREATE INDEX "Reel_ownerUserId_createdAt_idx" ON "Reel"("ownerUserId", "createdAt");

ALTER TABLE "CreatorProfile" ADD COLUMN "ownerUserId" TEXT NOT NULL DEFAULT 'local';
CREATE UNIQUE INDEX "CreatorProfile_ownerUserId_key" ON "CreatorProfile"("ownerUserId");

ALTER TABLE "Job" ADD COLUMN "ownerUserId" TEXT NOT NULL DEFAULT 'local';
CREATE INDEX "Job_ownerUserId_createdAt_idx" ON "Job"("ownerUserId", "createdAt");

ALTER TABLE "AiCall" ADD COLUMN "ownerUserId" TEXT NOT NULL DEFAULT 'local';
CREATE INDEX "AiCall_ownerUserId_createdAt_idx" ON "AiCall"("ownerUserId", "createdAt");
