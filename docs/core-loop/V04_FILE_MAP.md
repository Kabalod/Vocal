# V04 — карта файлов и зависимостей

V04_BASE_SHA: `564c9cf8534392501e125dda7ecc747c235a5c0d`.
V03: **accepted** на `b5278f468666330bc30bb6cd9378f2f02f858264`.
Продукт V04: **V04-01 и V04-02 приняты**. **V04-03 начат**. Документы V04-00: этот набор. Confirm ещё на BASE.

## Ядро портрета (менять в продукте V04)

| Зона | Файлы | Сейчас / цель |
|---|---|---|
| Типы / union | `src/lib/v04-action.ts`, `src/types/profile.ts` | V04-01: strict union |
| Commit | `src/lib/v04-commit.ts`, `src/lib/v04-slice.ts` | V04-03: journal replay 3/1, slice, revision + `applyResult` в той же транзакции |
| Ревизии | `src/lib/profile.ts` | пишет ревизию на persist / legacy apply; цель — create только при смене среза |
| Сборка | `src/lib/profile-portrait.ts` | плоский patch; цель — вес из events, пороги 3/1 |
| Диалог | `src/lib/profile-dialogue.ts` | V04 JSON → `commitV04ProfileTurn` (проверки источников на записи); legacy JSON → confirm-путь BASE |
| Промпт | `src/lib/ai/profile.ts` | `complete` = черновик; цель — discriminated union |
| Runtime | `src/lib/ai-runtime-context.ts` | пусто без `completed` |
| Контекст ролика | `src/lib/reel-context.ts` | `publicForScript` |
| API / UI | `app/api/profile/**`, `ProfileConversation.tsx` | `action=confirm` |

## Данные (без новых таблиц, без live migrate)

| Модель | Роль в V04 |
|---|---|
| `ProfileRevision` | неизменяемый снимок отображаемого среза |
| `CreatorProfile.currentRevisionId` | указатель на этот снимок |
| `AiCall` kind `profile_dialogue` | сырой ответ + принятый `event` в `resultJson` |
| `DialogueMessage` | лента; processing финализируется в той же транзакции, что event |

Журнал **не** хранить в `ProfileRevision.payloadJson`. Вес = replay только `schemaVersion = "v04-event-1"` в порядке `createdAt`, `id`.

## Стык V01–V03 (узко)

`dialogue.ts` — портрет как предположение. `thought-state.ts` / `agent-action.ts` — не менять контракт. `ai/script.ts` — не источник событий; V05 не начинать.

## Тесты, которые ждут confirm

`tests/v04-02-commit.test.ts`, `tests/v04-02-envelope.test.ts`, `tests/v04-03-slice.test.ts`, `tests/v04-03-commit.test.ts`. Confirm-тесты: `tests/profile-dialogue.test.ts`, `tests/p10-p12-profile.test.ts`, `tests/r2-idempotency.test.ts`, `tests/mvp-release.test.ts`, `tests/p17-e2e-matrix.test.ts`.

Сценарии: [`V04_SCENARIOS.md`](./V04_SCENARIOS.md).

## Не входят

Prisma baseline, миграции 8–9, `migrate resolve`, вкладка «Сценарий», champagne/STAGE/Desktop.
