-- Point empty workingTakeId at the first take of the same reel (one-time backfill).
UPDATE "Reel" AS r
SET "workingTakeId" = (
  SELECT t.id
  FROM "Take" AS t
  WHERE t."reelId" = r.id
  ORDER BY t.number ASC
  LIMIT 1
)
WHERE r."workingTakeId" IS NULL;

-- Drop pointers that do not belong to the reel before adding the FK.
UPDATE "Reel" AS r
SET "workingTakeId" = NULL
WHERE r."workingTakeId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Take" AS t
    WHERE t.id = r."workingTakeId"
      AND t."reelId" = r.id
  );

ALTER TABLE "Reel"
  ADD CONSTRAINT "Reel_workingTakeId_fkey"
  FOREIGN KEY ("workingTakeId") REFERENCES "Take"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
