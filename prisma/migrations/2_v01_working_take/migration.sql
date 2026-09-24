-- V01: explicit working take pointer. Do not apply to live Supabase from this stage.
ALTER TABLE "Reel" ADD COLUMN "workingTakeId" TEXT;

CREATE INDEX "Reel_workingTakeId_idx" ON "Reel"("workingTakeId");
