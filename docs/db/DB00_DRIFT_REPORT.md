# DB00 drift report

Status: **not applied**. No `migrate resolve` / `migrate deploy` against Supabase.

Compared: `prisma/schema.prisma` (commit 2 baseline) vs live public schema of project `zfbiyyhedhqdgrxxajrj`.

`prisma migrate diff --from-url … --to-schema-datamodel` **failed** with P4002: live `public.profiles` references `auth.users`. Prisma refuses the introspection unless `auth` is listed in `datasource.schemas`. This report is from `information_schema` / table metadata instead.

## Live objects outside Prisma

| Object | Action |
| --- | --- |
| `public.profiles` | Supabase Auth mapping. **Do not drop or alter.** |
| `auth.users` and Storage | Out of Prisma scope. Baseline does not mention them. |
| RLS on app tables | Enabled on live Prisma tables. Baseline SQL does not create RLS. |

## Prisma models vs live

All 19 Prisma models exist on live: `Reel`, `CreatorProfile`, `ProfileRevision`, `ReelContextSnapshot`, `ThoughtCreateKey`, `Take`, `TranscriptRevision`, `Job`, `AnalysisResult`, `Criterion`, `AiCall`, `Review`, `Question`, `Answer`, `ScriptVersion`, `ScriptDraft`, `DialogueThread`, `DialogueMessage`, `CompareResult`.

Column names and types match the baseline (TEXT / INTEGER / BOOLEAN / DOUBLE PRECISION / TIMESTAMP(3)).

## Real differences

1. **`_prisma_migrations` is absent** on live. Deploying the new history would need an explicit, separately accepted baseline resolve — not done here.
2. **`ownerUserId` default.** Prisma schema / baseline SQL use `DEFAULT 'local'` on `Reel`, `CreatorProfile`, `Job`, `AiCall`. Live columns have **no default**.
3. **Applying `0_postgres_baseline` as-is to live would fail:** it `CREATE TABLE`s objects that already exist. It is a green-field local/test baseline, not a live ALTER.
4. **RLS / grants** are live-only. Baseline does not encode them.

## Decision required before any live migrate

External acceptance of this report. Until then: do not `migrate deploy` and do not `migrate resolve` on Supabase.
