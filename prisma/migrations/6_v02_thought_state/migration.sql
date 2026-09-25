-- V02: ThoughtState for this thought only. Do not apply to live Supabase from this stage.

CREATE TABLE "ThoughtState" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "intent" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT '',
    "takeTask" TEXT NOT NULL DEFAULT '',
    "audienceLocal" TEXT NOT NULL DEFAULT '',
    "factsJson" TEXT NOT NULL DEFAULT '[]',
    "openGapsJson" TEXT NOT NULL DEFAULT '[]',
    "decisionsJson" TEXT NOT NULL DEFAULT '[]',
    "workingTakeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThoughtState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ThoughtState_reelId_key" ON "ThoughtState"("reelId");
CREATE INDEX "ThoughtState_ownerUserId_idx" ON "ThoughtState"("ownerUserId");
CREATE INDEX "ThoughtState_workingTakeId_idx" ON "ThoughtState"("workingTakeId");

ALTER TABLE "ThoughtState"
  ADD CONSTRAINT "ThoughtState_reelId_fkey"
  FOREIGN KEY ("reelId") REFERENCES "Reel"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ThoughtState"
  ADD CONSTRAINT "ThoughtState_workingTakeId_fkey"
  FOREIGN KEY ("workingTakeId") REFERENCES "Take"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ThoughtState"
  ADD CONSTRAINT "ThoughtState_workingTakeId_reelId_fkey"
  FOREIGN KEY ("workingTakeId", "reelId") REFERENCES "Take"("id", "reelId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ThoughtState" (
  "id",
  "reelId",
  "ownerUserId",
  "revision",
  "workingTakeId",
  "createdAt",
  "updatedAt"
)
SELECT
  'ts_' || replace(gen_random_uuid()::text, '-', ''),
  r.id,
  r."ownerUserId",
  0,
  r."workingTakeId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Reel" AS r
WHERE NOT EXISTS (
  SELECT 1 FROM "ThoughtState" AS s WHERE s."reelId" = r.id
);

DO $$
BEGIN
  ALTER TABLE "ThoughtState" ENABLE ROW LEVEL SECURITY;
  ALTER TABLE "ThoughtState" FORCE ROW LEVEL SECURITY;
END $$;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'ThoughtState', role_name);
    END IF;
  END LOOP;
END $$;
