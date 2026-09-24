# DB00 drift report

Status: **not applied**. No `migrate resolve` / `migrate deploy` against Supabase.

Compared: `prisma/schema.prisma` + `0_postgres_baseline` + `1_postgres_rls_revoke` vs live public schema of project `zfbiyyhedhqdgrxxajrj`.

`prisma migrate diff --from-url … --to-schema-datamodel` **failed** with P4002: live `public.profiles` references `auth.users`. Prisma refuses introspection unless `auth` is listed in `datasource.schemas`. This report uses `information_schema`, `pg_indexes`, `pg_class`, `pg_policies`, and `role_table_grants`.

## Live objects outside Prisma

| Object | Action |
| --- | --- |
| `public.profiles` | Supabase Auth mapping. **Do not drop or alter.** RLS + FORCE RLS on. |
| `auth.users` and Storage | Out of Prisma scope. Baseline does not mention them. |
| `_prisma_migrations` | **Absent** on live. New history is not recorded there. |

## Tables

All 19 Prisma models exist on live: `Reel`, `CreatorProfile`, `ProfileRevision`, `ReelContextSnapshot`, `ThoughtCreateKey`, `Take`, `TranscriptRevision`, `Job`, `AnalysisResult`, `Criterion`, `AiCall`, `Review`, `Question`, `Answer`, `ScriptVersion`, `ScriptDraft`, `DialogueThread`, `DialogueMessage`, `CompareResult`.

No extra Prisma-named tables. Extra public table: `profiles` only.

## Nullability, types, defaults

Column names, nullability, and types match the baseline (TEXT / INTEGER / BOOLEAN / DOUBLE PRECISION / TIMESTAMP(3) vs live `timestamp without time zone`).

Defaults match Prisma/`0_postgres_baseline` (examples: `Reel.status='draft'`, `Job.status='queued'`, `Job.attempts=0`, `Job.maxAttempts=3`, `Criterion.isExtended=false`, `createdAt=CURRENT_TIMESTAMP`).

`ownerUserId` on `Reel`, `CreatorProfile`, `Job`, `AiCall`: **NOT NULL, no default** on live and in the regenerated baseline. The previous `DEFAULT 'local'` drift is closed.

`updatedAt` columns have **no database default** (Prisma `@updatedAt` is application-side), same on live.

## Primary keys

| Table | Live PK |
| --- | --- |
| All models except `ThoughtCreateKey` | `{Table}_pkey` on `id` |
| `ThoughtCreateKey` | `ThoughtCreateKey_pkey` on `key` |

Matches schema.

## Unique constraints

Live unique indexes match Prisma `@@unique` / `@unique`:

- `CreatorProfile_ownerUserId_key`
- `ThoughtCreateKey_reelId_key`
- `Take_reelId_number_key`
- `Take_reelId_idempotencyKey_key`
- `AnalysisResult_jobId_key`
- `ScriptDraft_reelId_key`
- `DialogueThread_reelId_key`
- `DialogueThread_profileId_key`
- `DialogueMessage_claimKey_key`
- `DialogueMessage_threadId_idempotencyKey_key`

## Indexes

Non-unique live indexes match schema `@@index`:

- `Reel_ownerUserId_createdAt_idx`
- `Job_ownerUserId_createdAt_idx`
- `AiCall_reelId_createdAt_idx`
- `AiCall_profileId_createdAt_idx`
- `AiCall_ownerUserId_createdAt_idx`
- `ScriptVersion_reelId_createdAt_idx`
- `DialogueMessage_threadId_createdAt_idx`
- `CompareResult_reelId_createdAt_idx`

## Foreign keys, ON DELETE / ON UPDATE

Live FKs match Prisma relations. All listed FKs use **ON UPDATE CASCADE**.

| Constraint | ON DELETE |
| --- | --- |
| `AnalysisResult_jobId_fkey` | CASCADE |
| `Review_aiCallId_fkey` | SET NULL |
| All other Prisma FKs (`Restrict` in schema) | RESTRICT |

## RLS

| Scope | ENABLE RLS | FORCE RLS | Policies |
| --- | --- | --- | --- |
| Live 19 Prisma tables | true | true | **none** (`pg_policies` empty) |
| Live `profiles` | true | true | Auth mapping (out of Prisma) |
| Repo `1_postgres_rls_revoke` | ENABLE + FORCE on the 19 tables | same | **no policies added** |

No permissive `anon` / `authenticated` policies on app tables. Server Prisma (service role / `postgres`) and user Supabase clients stay different boundaries.

## Grants

Live app tables: grants only to `postgres` and `service_role` (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER). **No** `anon` or `authenticated` table grants.

`1_postgres_rls_revoke` `REVOKE ALL … FROM anon/authenticated` is idempotent and skips missing roles so local Docker without those roles does not fail.

## Real remaining differences

1. **`_prisma_migrations` is absent** on live. Recording the new history needs an explicit, separately accepted baseline resolve — **not done**.
2. **Applying `0_postgres_baseline` as-is to live would fail:** it `CREATE TABLE`s objects that already exist. It is a green-field local/test baseline, not a live ALTER.
3. **`1_postgres_rls_revoke` is not applied to live.** Live already has the same intended outcome (FORCE RLS, no anon/authenticated grants, no app policies). Applying it later is a no-op if roles exist.
4. Extra live object `public.profiles` stays outside Prisma.

## Decision required before any live migrate

External acceptance of this report. Until then: do not `migrate deploy` and do not `migrate resolve` on Supabase.
