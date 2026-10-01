-- Vocal V04 live recreate — EXECUTED 2026-10-01 on e8985243e85c73d181083428f80c8445fed29756.
-- Do not re-run. DROP SCHEMA public CASCADE was not used.
-- After DROP, prisma migrate deploy failed P3005 (public.profiles remained).
-- Schema rebuilt via prisma db execute of 0,1,10,2…9 then INSERT _prisma_migrations (SHA-256).
-- Observed after: 11 finished migrations; CreatorProfile.sessionJson present;
-- public.profiles + auth trigger kept; Storage bucket vocal-private exists.
-- Forbidden: DROP SCHEMA public CASCADE; DROP public.profiles; DROP auth/storage/private functions.

BEGIN;

-- Preflight: abort if preserved objects are missing.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'public.profiles missing — abort';
  END IF;
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'auth.users missing — abort';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND p.proname = 'handle_new_user'
  ) THEN
    RAISE EXCEPTION 'private.handle_new_user missing — abort';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'auth'
      AND event_object_table = 'users'
      AND trigger_name = 'on_auth_user_created'
  ) THEN
    RAISE EXCEPTION 'auth.on_auth_user_created missing — abort';
  END IF;
END $$;

-- App tables only. Circular Reel/Take FKs are resolved by dropping them together.
DROP TABLE IF EXISTS
  public."Answer",
  public."Question",
  public."Review",
  public."CompareResult",
  public."AnalysisResult",
  public."Job",
  public."TranscriptRevision",
  public."ScriptDraft",
  public."DialogueMessage",
  public."DialogueThread",
  public."ThoughtState",
  public."ThoughtCreateKey",
  public."ReelContextSnapshot",
  public."ProfileRevision",
  public."AiCall",
  public."ScriptVersion",
  public."Take",
  public."Reel",
  public."CreatorProfile",
  public."Criterion",
  public."_prisma_migrations"
CASCADE;

DROP FUNCTION IF EXISTS public.vocal_bump_dialogue_head();

-- Must still exist after DROP:
--   public.profiles, auth.users, private.handle_new_user, storage.*, supabase_migrations.*

COMMIT;

-- Recreate (executed): migrate deploy was not used because of P3005.
-- Applied repo SQL 0…10 in Prisma file order (0, 1, 10_v04_profile_session, 2…9).
-- 10 only adds CreatorProfile.sessionJson; applied before later V01–V03 ALTERs.
-- Empty-table UPDATEs in 3 and 6 were no-ops.
-- _prisma_migrations: 11 finished rows inserted with file SHA-256 checksums.

-- After migrate deploy, match live RLS posture for the Prisma bookkeeping table
-- (migration 1 does not list it; default ACLs would otherwise grant anon/authenticated).
BEGIN;
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._prisma_migrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._prisma_migrations FROM anon, authenticated;
COMMIT;

-- Verification (read-only after recreate):
-- select count(*) from auth.users;                         -- expect 4
-- select count(*) from public.profiles;                    -- expect 4
-- select count(*) from public."Reel";                      -- expect 0
-- select count(*) from public."CreatorProfile";            -- expect 0
-- select count(*) from public."Criterion";                 -- expect 0 until app ensureCriteria
-- select to_jsonb(c) ? 'sessionJson' from public."CreatorProfile" c limit 0;
-- select column_name from information_schema.columns
--   where table_schema='public' and table_name='CreatorProfile' and column_name='sessionJson';
-- select migration_name from public._prisma_migrations order by migration_name;
--   -- 0_postgres_baseline … 10_v04_profile_session (11 rows)
-- select relname, relrowsecurity, relforcerowsecurity from pg_class
--   join pg_namespace n on n.oid=relnamespace
--   where nspname='public' and relkind='r' and relname='CreatorProfile';
-- App checks: login, ownerUserId = auth.users.id, create thought, start profile dialogue.
