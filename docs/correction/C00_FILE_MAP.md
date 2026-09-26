# C00 — файлы и риски схемы

C00 **not started**. Не менять эти файлы в C00-документах.

## Читать как есть (принятый V03 + BASE портрета)

| Путь | Роль |
|---|---|
| `src/lib/dialogue.ts`, `dialogue-exec.ts`, `working-take.ts` | ход мысли, lease, commit |
| `src/lib/thought-state.ts`, `agent-action.ts` | факты, пробелы, non-content |
| `src/lib/profile-dialogue.ts`, `profile-portrait.ts`, `ai/profile.ts` | портрет BASE / цель V04-00 |
| `src/lib/reel-context.ts`, `ai-runtime-context.ts` | портрет → промпт / сценарий |
| `src/lib/ai/script.ts`, `scripts.ts` | сценарий (V05 не начат) |
| `src/lib/ai/questions.ts`, `review.ts` | вопросы/разбор |
| `src/lib/thought-completion.ts` | `finalTakeId` (V06) |
| `src/lib/auth/session.ts`, `auth/request.ts` | `ownerUserId` |
| `src/lib/db-target.ts`, `src/lib/db.ts` | Postgres URL; тесты ≠ live |
| `prisma/schema.prisma` | `ThoughtState`, `AiCall`, `DialogueMessage`, `ProfileRevision`, `ScriptDraft` |
| `tests/v03-agent-actions.test.ts` | эталон «уже правильно» |
| `tests/profile-dialogue.test.ts` | confirm; не ослаблять до V04 |

## Куда ляжет продукт C00 (после явного этапа)

Предпочтительно без live migrate:

1. `decision` / `correction` в `AiCall.resultJson` с `schemaVersion` (как V04 event), либо отдельный append-only JSON у мысли, **если** появится колонка на test Postgres.
2. Политика: новый модуль `src/lib/correction-policy.ts` (имя логическое).
3. Вызов из `commitDialogueReply` / `buildDialogueThoughtPatch` — только `correct_thought` / `discard` / `keep_local`.
4. `accumulate_preference` — только стык `profile-dialogue` после принятого V04.

Не создавать в C00: векторную БД, scoring-v1, таблицы I00.

## Миграции

| Риск | Правило |
|---|---|
| Live Supabase без миграций 8–9 | не `migrate resolve`, не baseline |
| Новая таблица | сначала test `TEST_DATABASE_URL`; live — отдельное решение пользователя |
| SQLite | в текущем цикле тесты уже Postgres; не возвращать SQLite |
| Auth | уже есть `ownerUserId`; не вводить `local` в prod |

## I00

`docs/intelligence/I00_*` — исторический аудит. C00 не стартует I01 и не переписывает I00. Стык: оба запрещают confirm каждой памяти; C00 конкретнее про исправление мысли после V03.
