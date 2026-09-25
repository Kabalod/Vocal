-- V03: durable execution lease so only one process may call the model for a turn.
-- Do not apply to live Supabase from this stage.

ALTER TABLE "AiCall" ADD COLUMN "execOwnerId" TEXT;
ALTER TABLE "AiCall" ADD COLUMN "execLeaseUntil" TIMESTAMPTZ;
ALTER TABLE "AiCall" ADD COLUMN "execGeneration" INTEGER NOT NULL DEFAULT 0;
