-- V02: ThoughtState.ownerUserId must match Reel.ownerUserId.
-- Do not apply to live Supabase from this stage.

CREATE UNIQUE INDEX "Reel_id_ownerUserId_key" ON "Reel"("id", "ownerUserId");

ALTER TABLE "ThoughtState"
  ADD CONSTRAINT "ThoughtState_reelId_ownerUserId_fkey"
  FOREIGN KEY ("reelId", "ownerUserId") REFERENCES "Reel"("id", "ownerUserId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
