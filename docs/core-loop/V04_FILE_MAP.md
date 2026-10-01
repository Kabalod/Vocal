# V04 — карта файлов и зависимостей

V04_BASE_SHA: `564c9cf8534392501e125dda7ecc747c235a5c0d`.
V03: **accepted** на `b5278f468666330bc30bb6cd9378f2f02f858264`.
Продукт V04: **V04-01–V04-06 приняты**. `PUT /api/profile` закрыт. Документы V04-00: этот набор. Confirm снят в V04-06.

## Ядро портрета (менять в продукте V04)

| Зона | Файлы | Сейчас / цель |
|---|---|---|
| Типы / union | `src/lib/v04-action.ts`, `src/types/profile.ts` | V04-01: strict union |
| Commit | `src/lib/v04-commit.ts`, `src/lib/v04-slice.ts` | V04-03 веса; V04-05: FOR UPDATE профиля, журнал после lock, повтор done AiCall без второго event |
| Ревизии | `src/lib/profile.ts` | `saveProfile` — 410; `persistProfilePayload` — skip/start/сиды; ревизия среза — из commit V04 |
| Сборка | `src/lib/profile-portrait.ts` | плоский patch; цель — вес из events, пороги 3/1 |
| Диалог | `src/lib/profile-dialogue.ts` | новые ходы — только strict V04 union; иначе ошибка хода без смены портрета; confirm снят; GET не replay и не публикует pending |
| Промпт | `src/lib/ai/profile.ts` | discriminated union V04; без confirm/ready |
| Runtime | `src/lib/ai-runtime-context.ts` | пусто без `completed` |
| Контекст ролика | `src/lib/reel-context.ts`, `src/lib/dialogue.ts` | отображаемый срез, не confirm |
| API / UI | `app/api/profile/**`, `ProfileConversation.tsx` | нет `action=confirm`; `PUT /api/profile` — 410 `SAVE_PROFILE_REMOVED` |

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

## Тесты V04 и диалога профиля

`tests/v04-02-commit.test.ts`, `tests/v04-02-envelope.test.ts`, `tests/v04-03-slice.test.ts`, `tests/v04-03-commit.test.ts`, `tests/v04-04-heal.test.ts`, `tests/v04-05-concurrency.test.ts`, `tests/v04-06-confirm.test.ts`, `tests/v04-06-legacy-reject.test.ts`, `tests/v04-save-profile.test.ts`. Confirm снят: `tests/profile-dialogue.test.ts`, `tests/p10-p12-profile.test.ts`, `tests/r2-idempotency.test.ts`, `tests/mvp-release.test.ts`, `tests/p17-e2e-matrix.test.ts`. Сид опубликованного портрета в тестах: `tests/helpers/seed-published-portrait.ts`.

Сценарии: [`V04_SCENARIOS.md`](./V04_SCENARIOS.md).

## Не входят

Prisma baseline, миграции 8–9, `migrate resolve`, вкладка «Сценарий», champagne/STAGE/Desktop.
