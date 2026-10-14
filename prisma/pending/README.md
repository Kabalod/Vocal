# prisma/pending — prepared migrations that are NOT applied

Everything here is outside `prisma/migrations`, so `prisma migrate deploy` (`npm run db:migrate`) does not see it.
Live Supabase has migrations 0…10 only.

| Migration | What | Applied | When |
|---|---|---|---|
| `11_user_quota` | `UserQuota` table (paid period, thought quota) | no | once, together with the "resource" stage (cost budget instead of a thought count); needs a separate owner decision |

To apply (only after the owner's explicit "yes"): `git mv prisma/pending/11_user_quota prisma/migrations/11_user_quota`
in a commit of its own, then `npm run db:migrate`. Tests apply this file from here (`tests/helpers/postgres-test-db.ts`), so the
test schema stays complete. `schema.prisma` already has the `UserQuota` model; the code does not read the table while `VOCAL_QUOTA`
is not `on`.
