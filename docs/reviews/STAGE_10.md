# Отчёт этапа

## Идентификация

- Этап: Stage 10 — разговорная анкета и портрет автора
- BASE_SHA: `7032d7fc7083dd921504c16cf9ca2d843a3e1aff`
- Коммит(ы) кода: `d6255e2bc763dff0ef4a9ea69ff2f0f20f78ee78`
- Коммит исправления: `476d2bb2cf2c1467a158b128dc19a0a0484213b3`
- HEAD_SHA: коммит этой документации
- Ветка: `feat/vocal-v2-10-profile-dialogue`
- Ссылка GitHub: https://github.com/Kabalod/Vocal/tree/feat/vocal-v2-10-profile-dialogue

Stage 09 принят стартом Stage 10 на SHA `7032d7fc7083dd921504c16cf9ca2d843a3e1aff` (последний код правки `35bf599a299e980beeafb14fadf81e3889e822a0`; docs-принятие `5c9b317` не является базой). Ветка создана от `7032d7f`. Stage 11 не начинался.

## Что реализовано

- Статическая форма профиля заменена разговором с Vocal. Восемь полей остаются внутренним checklist, не UI-формой.
- `DialogueThread.profileId` (unique) и `AiCall.reelId` nullable + `AiCall.profileId`. Профильные вызовы пишутся без фиктивного Reel, проходят `assertDailyTokenBudget` / `withAiInflight`, токены учитываются дневным guard.
- Валидируемый AI-контракт: `reply`, `coveredKeys`, `missingKeys`, `patch`, `complete`. Merge не стирает подтверждённые смыслы пустым текстом и не заполняет пустые разделы демо-данными.
- Текст и голос: голос идёт audio → STT → сразу AI, без экрана подтверждения транскрипта. Composer как в диалоге мысли («Напишите ответ…», микрофон, отправка), без «Перейти к записи».
- Один актуальный портрет для UI (цели, опыт, темы, подача, границы). `ProfileRevision` — внутренний снимок; history/undo/restore endpoints нет. Изменения применяются автоматически.
- Параллельные ответы: модель вызывается вне транзакции; после ответа заново читается актуальная ревизия, патч накладывается на свежие поля. В одной транзакции: новая `ProfileRevision`, условный `updateMany` `currentRevisionId`, завершение `AiCall` и замена pending-сообщения. При гонке — повторное слияние; после 5 неудач — 409 `STALE` без записи поверх чужого портрета.
- Текущая реплика автора не дублируется в `recentStoredText` и в «Ответ автора».
- Первый вход: объяснение, «Начать разговор», «Позже». Прерванный: «Продолжить разговор». «Дополнить анкету» — тот же контур. При ошибке AI разговор и прежний портрет сохраняются.
- `GET/PUT /api/profile` и `assembleReelContext` / snapshots не ломаются: старый снимок не переписывается новым портретом.

## Что намеренно не реализовано

- Пользовательская история ревизий, undo и восстановление портрета.
- Отдельный consent-flow: публичность факта уточняется обычным вопросом в чате.
- Обязательное заполнение всех восьми полей.
- Живой Groq для портрета.
- Stage 11.

## Изменённые файлы

- `prisma/schema.prisma`, `prisma/migrations/20260912050000_profile_dialogue/migration.sql`
- `src/lib/profile.ts`, `profile-portrait.ts`, `profile-dialogue.ts`, `src/lib/ai/profile.ts`
- `src/types/profile.ts`
- `src/app/api/profile/dialogue/route.ts`, `src/app/profile/page.tsx`
- `src/components/ProfileConversation.tsx`, `Portrait.tsx`; удалён `ProfileForm.tsx`
- `tests/profile-dialogue.test.ts`, `package.json`

## Миграции и данные

- Новая миграция: да, `20260912050000_profile_dialogue`
- Проверка существующей SQLite: backup `D:\Vocal\backups\stage-10-pre-migrate\dev.db`, затем `prisma migrate deploy` — `AiCall.reelId` стал nullable, добавлены `AiCall.profileId` и `DialogueThread.profileId`
- Проверка чистой SQLite: `reels-migration` / `migrate deploy` — 14 миграций, включая `profile_dialogue`
- Backfill: существующие `AiCall` сохраняют свой `reelId`; `profileId` = NULL. Существующие reel-треды без `profileId`
- Возможность отката: git revert коммита кода; колонки аддитивные / redefine с копированием строк

## Проверки

| Проверка | Результат | Ограничения |
|---|---|---|
| `npm run test:reels` | 92/92 | плюс гонка: два ключа, ответы модели в обратном порядке, в портрете и whyRecord, и boundaries; user/AiCall по одному; промпт без дубля текущей реплики |
| `npm run lint` | exit 0 | предупреждение exhaustive-deps в `VocalAppShell` с Stage 01 |
| `npm run typecheck` | exit 0 | |
| `npm run build` | успех | |
| Browser 390×844 | `scrollWidth=390`; нет формы и «Сохранить»; «Начать разговор» / «Позже»; после start — чат, composer «Напишите ответ…», микрофон, без «Перейти к записи»; reload сохраняет тред; «Продолжить позже» → «Продолжить разговор» | живой микрофон/Groq не запускались |
| Browser 1280×800 | список мыслей без регрессии (`sw=1265` при `w=1280`); профиль: «Продолжить разговор», без полей формы и кнопки сохранения (`sw=1280`) | горизонтальный скролл не шире вьюпорта |

## AI и внешние сервисы

- Какие AI-вызовы добавлены или изменены: `kind: profile_dialogue` (`reelId: null`, `profileId: local`)
- Проверено mock: да, полный контур в `tests/profile-dialogue.test.ts`
- Проверено live: нет
- Что не проверено: живой Groq и настоящий микрофон в браузере

## Совместимость с будущим обучением

- Какие исторические данные затронуты: новые nullable связи; старые `AiCall` и reel-треды не переписываются
- Может ли что-либо перезаписаться/удалиться при завершении, retry или возврате в работу: ошибка портрета не пишет новую ревизию полей; параллельный apply перечитывает текущую ревизию и не затирает чужой патч; успешный merge создаёт внутреннюю ревизию, не undo
- Сохраняются ли source metadata, порядок, итоговые ссылки и snapshots: да; `ReelContextSnapshot` по-прежнему замораживает `profileRevisionId`
- Не создана ли новая рубрика в обход `playbook.ts`/`framework.ts`: нет
- Можно ли позднее добавить read-only learning job без изменения смысла текущих моделей: да

## Подтверждения

- Force push не использовался.
- Следующий этап не начинался.
- Этап не объявляется принятым до внешнего ревью.
