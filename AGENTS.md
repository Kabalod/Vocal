# Instructions for coding agents (Vocal)

Start here:
1. `docs/ROADMAP.md` — общая дорожная карта (**принята** 29.09.2026 как порядок работ; не продукт). C00 product **accepted** at `e268c40`. Auth **accepted** at `51d6033`. Live schema **accepted** 29.09.2026. **продукт V04 принят** at `e8985243e85c73d181083428f80c8445fed29756`. **продукт V05 принят** 02.10.2026 at `5fa13657b38996ba8f3a416a22fb03b7647843b9`. **продукт V06 принят** 04.10.2026 at `d0bdb89cd36c6e1b6925d6746a6447323d419eb3`. **продукт V07 принят** 04.10.2026 at `4a066e221193795ef147c9768cb4105621b15772`. **медиа-путь принят** 04.10.2026 at `269a389f6bcc31d6d9243a0e50540f24c1078784`. V00–V07 и медиа-путь приняты в своих объёмах; это не готовность всего приложения к запуску.
2. `docs/design/README.md`
3. `docs/design/SOURCE_OF_TRUTH_2026-09-15.md`
4. Visual source of truth: `docs/design/references-new/` (approved screens 01–09; `/reels` uses screen 09)
5. Current cycle: V03 **accepted**. V03_HEAD = `b5278f468666330bc30bb6cd9378f2f02f858264`. Canon: `docs/core-loop/PLAN.md` and `docs/core-loop/V03_*.md`.
6. V04: **продукт V04 принят** (`e8985243e85c73d181083428f80c8445fed29756`). V04_BASE_SHA = `564c9cf8534392501e125dda7ecc747c235a5c0d`.
6a. V05: **продукт V05 принят** 02.10.2026. V05_HEAD = `5fa13657b38996ba8f3a416a22fb03b7647843b9`. V05_BASE_SHA = `abd6670f65269b081d20762f49945a3628db52fb`. Canon: `docs/core-loop/V05_SCENARIO_TAB_SPEC.md`, `docs/core-loop/V05_REPORT.md`.
6b. V06: **продукт V06 принят** 04.10.2026. V06_HEAD = `d0bdb89cd36c6e1b6925d6746a6447323d419eb3`. V06_BASE_SHA = `f741eb8d9e6c5881afcdd43d3f4cff9a8ccbd2fd`. Report: `6e958e6ca3ac96d99a6d4fea5686f49e8ab98fd9`. Canon: `docs/core-loop/V06_PLAN.md`, `docs/core-loop/V06_REPORT.md`, `docs/core-loop/CONTRACT.md`.
6c. V07: **продукт V07 принят** 04.10.2026. V07_HEAD = `4a066e221193795ef147c9768cb4105621b15772`. V07_BASE_SHA = `307bc8b9faf42d2ad64a0117c17f3b2ed800ef34`. Report: `78501ece148bab014a1bceedcf139b6036e8a04e`. Canon: `docs/core-loop/V07_PLAN.md`, `docs/core-loop/V07_REPORT.md`, `docs/core-loop/CONTRACT.md`. Do not declare I06/I08 done.
6d. Медиа-путь: **принят** 04.10.2026. MEDIA_PATH_HEAD = `269a389f6bcc31d6d9243a0e50540f24c1078784`. MEDIA_PATH_BASE = `3206fe4ca6849aced92ee5a554cde0f72f284ca3`. Evidence docs: `553ed1d`, `fd7c2e9`. Canon: `docs/core-loop/MEDIA_PATH_PLAN.md`, `docs/core-loop/MEDIA_PATH_REPORT.md`. Do not close upload defect, live-model quality, I06/I07/I08, or memory bridge.
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

V05: **продукт V05 принят** 02.10.2026 at `5fa13657b38996ba8f3a416a22fb03b7647843b9`. **продукт V06 принят** 04.10.2026 at `d0bdb89cd36c6e1b6925d6746a6447323d419eb3`. **продукт V07 принят** 04.10.2026 at `4a066e221193795ef147c9768cb4105621b15772`. **медиа-путь принят** 04.10.2026 at `269a389f6bcc31d6d9243a0e50540f24c1078784`. I06, I07 and I08 remain open.

V04-00 is docs only. V04-01 **accepted**. V04-02 **accepted**. V04-03 **accepted**. V04-04 **accepted**. V04-05 **accepted**. V04-06 **accepted** (`119ee44`). `PUT /api/profile` returns 410. Do not change Prisma or live Supabase. **продукт V04 принят** — не перепроверять.

C00 docs **accepted** (`8cb7351`). C00-01 **accepted** (`2391217`). C00-02 **accepted** (`548b813`). C00-03 **accepted** (`f1eeb54438d057eedf86c345b2a77c71afa3f214`). C00-04 **accepted** (`ce6a43c386bdab163e531a4670ec8e08d524477e`). C00-05 and C00 product **accepted** (`e268c40a80a5baa9a50699e9b920e01b522edb94`). Auth **accepted** (`51d6033`). Live schema **accepted** 29.09.2026. `docs/ROADMAP.md` **accepted** 29.09.2026 as work order only. **продукт V04 принят** (`e8985243e85c73d181083428f80c8445fed29756`). **продукт V05 принят** 02.10.2026 (`5fa13657b38996ba8f3a416a22fb03b7647843b9`). **продукт V06 принят** 04.10.2026 (`d0bdb89cd36c6e1b6925d6746a6447323d419eb3`). **продукт V07 принят** 04.10.2026 (`4a066e221193795ef147c9768cb4105621b15772`). **медиа-путь принят** 04.10.2026 (`269a389f6bcc31d6d9243a0e50540f24c1078784`). Do not start I01 or memory bridge without an explicit start. See `docs/ROADMAP.md`.

Do **not** apply Prisma baseline, migrations 8–9, or `migrate resolve` to live Supabase from this cycle.

After each development stage, user sends results to agent «Создание приложение» for review before the next stage.
