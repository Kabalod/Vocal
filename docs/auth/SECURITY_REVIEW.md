# Local Security Review (Auth)

Source: local Cursor security-review subagent on `cf34ac3` → `cafe7ae`, plus follow-up `fcf7090`. No secrets, URLs with keys, or service-role material.

Auth is **not accepted**. I01 was not in scope.

## Findings at review time

| Severity | Location | Finding | Status |
|---|---|---|---|
| High | `src/lib/thought-create.ts`, `src/lib/thought-media.ts` | Thought create omitted `ownerUserId`; rows stayed `local` and would merge on legacy assign | Fixed in `fcf7090` |
| Medium | `src/app/api/criteria/route.ts` | Any signed-in user could change shared scoring criteria | Open at review; closed in later review-fix (`CRITERIA_READONLY` unless `VOCAL_CRITERIA_ADMIN_USER_IDS`) |
| Medium | `src/app/auth/callback/route.ts` | `next` could open-redirect | Fixed in `fcf7090` |
| Medium | `src/lib/media-access.ts` | Prefix-only object path allowed `..` | Fixed in `fcf7090` |
| Medium | `src/lib/supabase/middleware.ts` | Missing env failed open | Production fail-closed in `fcf7090` |

## What the review treated as sound

- Private APIs (except `/api/health`) call `bindApiUser()` / `getUser()`
- Owner filters on reel/take/job/export/retry; isolation tests
- Legacy owner requires `VOCAL_LEGACY_OWNER_USER_ID`
- Account vs AI portrait split (`public.profiles` vs `CreatorProfile`)
- Storage bucket `vocal-private` RLS on first folder = `auth.uid()`
- `public.profiles` RLS; `handle_new_user` in `private`
