# Instructions for coding agents (Vocal)

Start here:
1. `docs/design/README.md`
2. `docs/design/SOURCE_OF_TRUTH_2026-09-15.md`
3. Visual source of truth: `docs/design/references-new/` (approved screens 01–09; `/reels` uses screen 09)
4. Current cycle: V01 **accepted**; V02 **not started**. Branch: `feat/v02-from-base`. Canon: `docs/core-loop/PLAN.md` and `docs/core-loop/V01_*.md`.
5. V01_HEAD = `d34e8dee2243ae109f2e535a439784117cef3aff`
6. V02_BASE_SHA = `4223599e6ddb9e6be0d1a09d9c6b433d84912779`. Product code at BASE equals V01_HEAD plus V01 acceptance docs. Do not treat the V01 start SHA as V02 BASE.
7. BASE_SHA (start of V01) = `34abcd78c70b2fa31bd717aeff56acc31577c0d1`
8. AUDITED_APP_SHA = `f971a7fb43c2fdd9df6b1824620491500972736a`

Do **not** use champagne Design System, STAGE_00–09, or Desktop design archives.

Do **not** apply Prisma baseline or `migrate resolve` to live Supabase from this cycle.

After each development stage, user sends results to agent «Создание приложение» for review before the next stage.
