# V02 — карта файлов

V02: **accepted**. V02_HEAD: `1c9a4b9d4fda8df91b2e650e217883c8e02ccc62`.
V02_BASE_SHA: `4223599e6ddb9e6be0d1a09d9c6b433d84912779`.
V03: **not started**. BASE для V03 не назначен.

| Зона | Файлы |
|---|---|
| Схема | `prisma/schema.prisma` (`ThoughtState`) |
| Миграции (не на live) | `6_v02_thought_state`, `7_v02_thought_state_owner` |
| Reducer | `src/lib/thought-state.ts` |
| Создание / зеркало | `src/lib/thought-create.ts`, `src/lib/reels.ts` |
| Тесты | `tests/v02-thought-state.test.ts`, `tests/helpers/postgres-test-db.ts` |
| Документы | `V02_*.md`, `PLAN.md`, `AGENTS.md` |

Не входят: четыре action, `dialogue-reply.ts`, portrait confirm, completion gate, UI записи.
