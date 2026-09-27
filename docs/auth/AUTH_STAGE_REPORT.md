# Auth / Supabase stage report

> Historical snapshot from the Auth stage. SQLite generate/transfer commands described below are no longer part of the app. Current provider is PostgreSQL only (`docs/auth/POSTGRES.md`).
>
> 27.09.2026: Auth remains **implemented, not accepted**. Do not treat leftover “Prisma generates against SQLite” lines in “What shipped” as current. Product route: `docs/ROADMAP.md`. Legacy owner transfer is not required if user content is empty (owner statement).

Status: **implemented, not accepted**. This is not I01. Automatic memory is not started. P01.6-2 is not declared accepted.

## Entities

- `public.profiles` (Supabase): login account row, `id = auth.users.id`.
- `CreatorProfile` / `ProfileRevision` (Prisma): AI portrait. `CreatorProfile.id` is the same uuid as the auth user. These are not a second competing login profile.

Legacy SQLite rows with owner `local` move only when `VOCAL_LEGACY_OWNER_USER_ID` is set to a **predetermined** auth uuid. First interactive login does not inherit them.

## What shipped

1. Registration, email confirm (`/auth/callback`), login, logout, password recovery in existing Vocal styling (`AuthScreen`, `/login`, `/signup`, `/forgot-password`, `/auth/update-password`).
2. Middleware session refresh + 401 for private APIs, **and** `bindApiUser()` / `getUser()` on each private route, plus Prisma `ownerUserId` filters. `/api/health` stays public.
3. Prisma still generates against SQLite for existing tests. Production target schema: `prisma/schema.postgres.prisma`. Backup + counts: `npm run db:backup-sqlite` and `npm run db:to-postgres` (`POSTGRES_DATABASE_URL`).
4. Reels, takes, scripts, reviews, questions, dialogues, files, `AiCall`, and `Job` are scoped to the owner.
5. `npm run db:assign-legacy-owner` requires `VOCAL_LEGACY_OWNER_USER_ID`.
6. Private bucket `vocal-private` (RLS on first path folder = `auth.uid()`). Bytes and signed URLs require owner check (`src/lib/media-access.ts`).
7. A/B tests in `tests/auth-isolation.test.ts` (read, patch, export, media, job retry, draft delete). Object-path spoofing fails.

## Ops

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and later `POSTGRES_DATABASE_URL` + `VOCAL_LEGACY_OWNER_USER_ID`. Do not commit secrets.

Auth is **not** product-accepted until you review this report.
