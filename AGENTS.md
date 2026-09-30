# Instructions for coding agents (Vocal)

Start here:
1. `docs/ROADMAP.md` — общая дорожная карта (**принята** 29.09.2026 как порядок работ; не продукт). C00 product **accepted** at `e268c40`. Auth **accepted** at `51d6033`. Live schema **accepted** 29.09.2026 — `docs/db/LIVE_SCHEMA_RECREATE.md`. V04-01 **accepted** at `4411b22c716d44a92a8d7d762c64d1f22184f0e1`. V04-02 **accepted** at `bc413e0df0e09348256319f10af884f8ef6727b4`. V04-03 **accepted** at `5dfa595cc08f938bb9859aca3b1b3a585c6ba565`. V04-04 **accepted** at `c0d8523e41455fef0281b6e8f62f44ae22cd3a58`. V04-05 started; V04-06 started; V04 product not accepted.
2. `docs/design/README.md`
3. `docs/design/SOURCE_OF_TRUTH_2026-09-15.md`
4. Visual source of truth: `docs/design/references-new/` (approved screens 01–09; `/reels` uses screen 09)
5. Current cycle: V03 **accepted**. V03_HEAD = `b5278f468666330bc30bb6cd9378f2f02f858264`. Canon: `docs/core-loop/PLAN.md` and `docs/core-loop/V03_*.md`.
6. V04: **V04-01 accepted** (`4411b22c716d44a92a8d7d762c64d1f22184f0e1`). **V04-02 accepted** (`bc413e0df0e09348256319f10af884f8ef6727b4`). **V04-03 accepted** (`5dfa595cc08f938bb9859aca3b1b3a585c6ba565`). **V04-04 accepted** (`c0d8523e41455fef0281b6e8f62f44ae22cd3a58`). **V04-05 started**, **V04-06 started**, product **not accepted**. V04_BASE_SHA = `564c9cf8534392501e125dda7ecc747c235a5c0d`. Do not start V05. Do not declare V04 accepted.
7. V01_HEAD = `d34e8dee2243ae109f2e535a439784117cef3aff`
8. V02_HEAD = `1c9a4b9d4fda8df91b2e650e217883c8e02ccc62`
9. V03_BASE_SHA = `66cbcc0c3fc68a5b0786a4e9036a13d523ac3083`. Product at BASE equals V02_HEAD plus V02 acceptance docs. Do not treat V02_BASE as V03 BASE.
10. BASE_SHA (start of V01) = `34abcd78c70b2fa31bd717aeff56acc31577c0d1`
11. AUDITED_APP_SHA = `f971a7fb43c2fdd9df6b1824620491500972736a`

Do **not** use champagne Design System, STAGE_00–09, or Desktop design archives.

V03 test policy (accepted stage):
- Every product commit that still touches V03 dialogue: `npm run test:v03`
- Changes to dialogue or CAS: `test:v01` + `test:v02` + `test:v03`
- Docs-only commits: no tests

V04-00 is docs only. V04-01 **accepted**. V04-02 **accepted**. V04-03 **accepted**. V04-04 **accepted**. V04-05 started. V04-06 started: remove confirm from API/UI; profile prompt is the V04 union; thought prompt uses the displayed slice. Do not change Prisma or live Supabase. Do not declare V04 accepted.

C00 docs **accepted** (`8cb7351`). C00-01 **accepted** (`2391217`). C00-02 **accepted** (`548b813`). C00-03 **accepted** (`f1eeb54438d057eedf86c345b2a77c71afa3f214`). C00-04 **accepted** (`ce6a43c386bdab163e531a4670ec8e08d524477e`). C00-05 and C00 product **accepted** (`e268c40a80a5baa9a50699e9b920e01b522edb94`). Auth **accepted** (`51d6033`). Live schema **accepted** 29.09.2026. `docs/ROADMAP.md` **accepted** 29.09.2026 as work order only. V04-01 **accepted** (`4411b22c716d44a92a8d7d762c64d1f22184f0e1`). V04-02 **accepted** (`bc413e0df0e09348256319f10af884f8ef6727b4`). V04-03 **accepted** (`5dfa595cc08f938bb9859aca3b1b3a585c6ba565`). V04-04 **accepted** (`c0d8523e41455fef0281b6e8f62f44ae22cd3a58`). V04-05 **started**. V04-06 **started**; V04 is **not accepted**. Do not start V05 or I01 without an explicit start. See `docs/ROADMAP.md`.

Do **not** apply Prisma baseline, migrations 8–9, or `migrate resolve` to live Supabase from this cycle.

After each development stage, user sends results to agent «Создание приложение» for review before the next stage.
