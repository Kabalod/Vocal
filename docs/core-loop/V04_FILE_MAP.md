# V04 — карта файлов и зависимостей

V04_BASE_SHA: `564c9cf8534392501e125dda7ecc747c235a5c0d`.
V03: **accepted** на `b5278f468666330bc30bb6cd9378f2f02f858264`.
Продукт V04: **not started**. Документы V04-00: этот набор.

## Ядро портрета (менять в V04)

| Зона | Файлы | Зависимость |
|---|---|---|
| Типы | `src/types/profile.ts` | поля, `pending.readyToConfirm`; сюда же кандидат обновления |
| Ревизии и persist | `src/lib/profile.ts` | `CreatorProfile` / `ProfileRevision`; `saveProfile` |
| Сборка и complete | `src/lib/profile-portrait.ts` | плоский patch; целевые пороги прямого vs производного здесь или рядом |
| Диалог и confirm | `src/lib/profile-dialogue.ts` | `confirmProfilePortrait`, `applyPortraitReply` |
| Промпт модели | `src/lib/ai/profile.ts` | сейчас `complete` = черновик; цель — кандидат, не confirm |
| Runtime для цикла | `src/lib/ai-runtime-context.ts` | пусто, пока нет `portrait.completed` |
| Контекст ролика | `src/lib/reel-context.ts` | `publicForScript` / `understandingOnly` |
| API | `src/app/api/profile/dialogue/route.ts`, `src/app/api/profile/route.ts` | `action=confirm`, PUT полей |
| UI | `src/components/ProfileConversation.tsx`, `src/components/Portrait.tsx` | кнопка confirm, черновик |

## Стык с принятым циклом (узко, без переписывания V01–V03)

| Зона | Файлы | Правило V04 |
|---|---|---|
| Диалог мысли | `src/lib/dialogue.ts` | портрет только как предположение для вопроса/помощи |
| ThoughtState | `src/lib/thought-state.ts` | факты мысли не из портрета |
| Действия агента | `src/lib/agent-action.ts` | не менять схему действий |
| Сценарий / разбор | `src/lib/ai/script.ts`, `src/lib/ai/review.ts`, `src/lib/ai/compare.ts` | не источник событий; V05 не начинать |
| Контракт продукта | `src/lib/product-contracts.ts` | `unfinishedAmendPublishesPortrait` завязан на confirm-логику |

## Данные (не мигрировать в V04-00)

| Модель | Назначение |
|---|---|
| `CreatorProfile` | якорь автора, `currentRevisionId` |
| `ProfileRevision` | JSON payload: fields, pending, portrait.completed, skipped |
| `DialogueThread` scope `profile` | лента анкеты |
| `AiCall` kind `profile_dialogue` | ответы модели профиля |
| `ReelContextSnapshot` | снимок цели ролика + выбранных ключей профиля |

Новых таблиц в V04-00 нет. Кандидат, наблюдения и веса в продукте V04 допустимо держать в `payloadJson` ревизии, без live migrate. Новая `ProfileRevision` — только при значимом изменении действующего среза; журнал оснований может жить внутри payload без новой ревизии на каждое наблюдение. Live migrate запрещён.

## Тесты, которые ждут confirm

`tests/profile-dialogue.test.ts`, `tests/p10-p12-profile.test.ts`, `tests/r2-idempotency.test.ts`, `tests/mvp-release.test.ts`, `tests/p17-e2e-matrix.test.ts`.

Новый набор сценариев: [`V04_SCENARIOS.md`](./V04_SCENARIOS.md).

## Не входят

Prisma baseline, миграции 8–9, `migrate resolve`, UI вкладки «Сценарий», completion gate, playbook, champagne/STAGE/Desktop.
