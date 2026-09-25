# V02 — карта файлов

V02_BASE_SHA: `4223599e6ddb9e6be0d1a09d9c6b433d84912779`.

| Зона | Файлы |
|---|---|
| Схема | `prisma/schema.prisma` (`ThoughtState`) |
| Миграция (не на live) | `6_v02_thought_state` |
| Reducer | `src/lib/thought-state.ts` |
| Создание / зеркало | `src/lib/thought-create.ts`, `src/lib/reels.ts` |
| Тесты | `tests/v02-thought-state.test.ts`, `tests/helpers/postgres-test-db.ts` |
| Документы | `V02_*.md`, `PLAN.md`, `AGENTS.md` |

Не входят: четыре action, `dialogue-reply.ts`, portrait confirm, completion gate, UI записи.
