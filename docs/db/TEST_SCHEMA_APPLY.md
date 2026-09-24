# Isolated test schema apply (timing)

Applies only to local Docker `TEST_DATABASE_URL`. Does not run against live Supabase.

Isolated schemas used to run baseline + migrations 1–5 as **six** `npx prisma db execute` processes each. They now concatenate those files **in order 0–5** (SQL unchanged) and run **one** `prisma db execute` per new schema.

- `npm run test:v01` — `tests/v01-working-take.test.ts` only
- `npm run test:postgres` — full existing suite
- Concurrency stays `1` (shared `DATABASE_URL` + Prisma singleton)

`migrate deploy` on the Docker `public` schema still applies `0`–`5` in that order. Isolated apply uses the same file order in one packet.

## Checks

- `npx tsc --noEmit` — pass
- `test:v01` — 15/15
- `test:postgres` — 102/102
- Composite FK `Reel_workingTakeId_reelId_fkey` and trigger `dialogue_message_bumps_head` still hold (v01 tests: foreign-reel working take rejected; insert waits on thread lock)

## Before (HEAD `15b1d66`, six executes per schema)

| Step | Time |
| --- | --- |
| Docker ready | 5639 ms |
| `prisma generate` | 2886 ms |
| `prisma migrate deploy` (public) | 4013 ms |
| `tests/v01-working-take.test.ts` | ~174 s node / ~190 s wall |
| Full `test:postgres` | 743519 ms `duration_ms` / 760155 ms `elapsed_ms` |
| `prisma db execute` | 6 per isolated schema (13 schemas in v01 → 78; 56 in full suite → 336) |

## After (one execute per schema)

| Step | `test:v01` | `test:postgres` |
| --- | ---: | ---: |
| Docker ready | 2857 ms | 1937 ms |
| `prisma generate` | 2478 ms | 2463 ms |
| `prisma migrate deploy` (public) | 2718 ms | 2542 ms |
| Tests (`vocal-test-time tests_ms`) | 36438 ms | 183207 ms |
| Node `duration_ms` | 35291 ms | 182062 ms |
| Wall (npm script) | 49810 ms | 195808 ms |
| `prisma db execute` | 13 (1×13 schemas) | 56 (1×56 schemas) |

v01 tests: **~174 s → ~36 s** (~4.8×). Full suite node duration: **~744 s → ~182 s** (~4.1×). Execute processes: **336 → 56**.
