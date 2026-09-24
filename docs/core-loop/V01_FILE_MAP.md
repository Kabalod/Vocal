# V01 — карта файлов

BASE: `34abcd78c70b2fa31bd717aeff56acc31577c0d1`. Код аудита: `f971a7f`.

| Зона | Файлы |
|---|---|
| Схема | `prisma/schema.prisma` (`workingTakeId`, FK `ReelWorkingTake`, `@@index`) |
| Миграции (не на live) | `2_v01_working_take`, `3_v01_working_take_fk`, `4_v01_working_take_same_reel`, `5_v01_dialogue_head_lock` |
| Резолв и снимок | `src/lib/working-take.ts` |
| Диалог | `src/lib/dialogue.ts`, `src/app/api/thoughts/[id]/dialogue/route.ts` |
| Указатель при создании | `src/lib/thought-create.ts`, `src/lib/reels.ts` |
| API карточки | `src/app/api/reels/[id]/route.ts` |
| DTO | `src/types/reel.ts`, `src/lib/serialize.ts` |
| Inflight | `src/lib/ai/usage-guard.ts`, `src/lib/profile-dialogue.ts` |
| Тесты | `tests/v01-working-take.test.ts`, `tests/helpers/postgres-test-db.ts` |
| Документы | `V01_*.md`, правки статуса в `V00_*.md`, `PLAN.md`, `AGENTS.md` |

Не входят: ThoughtState, `dialogue-reply.ts`, четыре action, portrait confirm, completion gate, UI записи.
