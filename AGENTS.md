# Instructions for coding agents (Vocal)

Start here:
1. `docs/design/README.md`
2. `docs/design/SOURCE_OF_TRUTH_2026-09-15.md`
3. Visual source of truth: `docs/design/references-new/` (approved screens 01–09; `/reels` uses screen 09)
4. Current cycle: V03 **in progress** (not accepted). Branch: `feat/v03-from-base`. Canon: `docs/core-loop/PLAN.md` and `docs/core-loop/V03_*.md`.
5. V01_HEAD = `d34e8dee2243ae109f2e535a439784117cef3aff`
6. V02_HEAD = `1c9a4b9d4fda8df91b2e650e217883c8e02ccc62`
7. V03_BASE_SHA = `66cbcc0c3fc68a5b0786a4e9036a13d523ac3083`. Product at BASE equals V02_HEAD plus V02 acceptance docs. Do not treat V02_BASE as V03 BASE.
8. BASE_SHA (start of V01) = `34abcd78c70b2fa31bd717aeff56acc31577c0d1`
9. AUDITED_APP_SHA = `f971a7fb43c2fdd9df6b1824620491500972736a`

Do **not** use champagne Design System, STAGE_00–09, or Desktop design archives.

V03 test policy:
- Every product commit: `npm run test:v03`
- Changes to dialogue or CAS: `test:v01` + `test:v02` + `test:v03`
- Full `test:postgres`: once before final V03 acceptance
- Docs-only commits: no tests

Do **not** apply Prisma baseline or `migrate resolve` to live Supabase from this cycle.

After each development stage, user sends results to agent «Создание приложение» for review before the next stage.
