-- Existence-only FK cannot keep workingTakeId on the same reel.
-- Composite FK: Reel(workingTakeId, id) → Take(id, reelId).

CREATE UNIQUE INDEX "Take_id_reelId_key" ON "Take"("id", "reelId");

ALTER TABLE "Reel" DROP CONSTRAINT "Reel_workingTakeId_fkey";

ALTER TABLE "Reel"
  ADD CONSTRAINT "Reel_workingTakeId_reelId_fkey"
  FOREIGN KEY ("workingTakeId", "id") REFERENCES "Take"("id", "reelId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
