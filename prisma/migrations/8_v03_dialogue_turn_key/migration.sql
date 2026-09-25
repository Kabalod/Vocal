-- V03: durable unique key for one dialogue turn's AiCall.
-- Do not apply to live Supabase from this stage.

ALTER TABLE "AiCall" ADD COLUMN "turnKey" TEXT;

CREATE UNIQUE INDEX "AiCall_turnKey_key" ON "AiCall"("turnKey");
