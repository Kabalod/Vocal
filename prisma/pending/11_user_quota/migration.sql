-- J1: thought quota per paid period. PREPARED ONLY: do not apply to live Supabase without the owner's explicit "да".
-- One row per author (auth user id). The period is [periodStart, periodEnd), tied to the payment date, not to a calendar month.

CREATE TABLE "UserQuota" (
    "ownerUserId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "thoughtsLimit" INTEGER NOT NULL DEFAULT 100,
    "thoughtsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserQuota_pkey" PRIMARY KEY ("ownerUserId"),
    CONSTRAINT "UserQuota_period_check" CHECK ("periodEnd" > "periodStart"),
    CONSTRAINT "UserQuota_counts_check" CHECK ("thoughtsLimit" >= 0 AND "thoughtsUsed" >= 0)
);

-- Same access model as the other app tables (migration 1): the table is reached only through the server connection.
ALTER TABLE "UserQuota" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "UserQuota" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "UserQuota" FROM authenticated';
  END IF;
END $$;
