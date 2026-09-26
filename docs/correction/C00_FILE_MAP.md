# C00 — файлы и риски схемы

Документы C00 **приняты**. Продукт C00 **not started**. Не менять эти файлы до явного продуктового этапа.

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
| `prisma/schema.prisma` | `AiCall.resultJson` / `inputSnapshotJson` / `turnKey`; `ScriptDraft.saveToken`; `Question.roundId`; `Review.transcriptRevisionId` — без колонки stale |
| `tests/v03-agent-actions.test.ts` | эталон «уже правильно» |
| `tests/profile-dialogue.test.ts` | confirm; не ослаблять до V04 |

## Куда ляжет продукт C00 (после явного этапа)

Предпочтительно без live migrate:

1. Единый конверт `c00-envelope-1` в `AiCall.resultJson` хода мысли (сейчас там только action: `working-take.ts`). Не класть C00 в `profile_dialogue` и не в payload `ProfileRevision`.
2. Политика: логический модуль вроде `correction-policy.ts`.
3. Вызов из `commitDialogueReply` — `correct_thought` / `keep_local` / `discard`. Портрет не вызывать.
4. Stale: `correction.acceptedAt` в конверте; revision в снимке, если есть. В `questions.ts` сейчас нет `thoughtStateRevision` — добавить отдельной задачей этапа. Без колонки `stale`.

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
