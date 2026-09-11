# Отчёт этапа

## Идентификация

- Этап: Stage 06 — рабочая студия и единый диалог
- BASE_SHA: `a38989733bc701b74a9690cc81518c6ce277b836`
- Коммит(ы) кода: `94d8d2487564ed85eeee418494dbd60162fec62c`
- HEAD_SHA: `94d8d2487564ed85eeee418494dbd60162fec62c`
- Ветка: `feat/vocal-v2-06-studio-dialogue`
- Ссылка GitHub: https://github.com/Kabalod/Vocal/tree/feat/vocal-v2-06-studio-dialogue

Stage 05 принят на SHA `a38989733bc701b74a9690cc81518c6ce277b836` (код правки `1611f2784b4114d0a17a06e4399365312b76f5ac`). Это BASE Stage 06. Ветка создана от этой вершины. Stage 07 не начинался.

## Что реализовано

- Миграция `DialogueThread` / `DialogueMessage` (thread только у мысли). Старые `Review` / `Question` / `Answer` не удаляются и читаются как legacy-сообщения.
- Новые реплики пишутся только в `DialogueMessage`. Список — cursor pagination (последние 20, «более ранние» без дублей).
- `POST /api/thoughts/:id/dialogue` — текст; multipart — голос (ffmpeg + STT, затем тот же диалог). `help` — предложение в диалоге. `transfer` — готовая версия `accepted_ai`, повтор не копирует.
- AI `kind: dialogue` через `AiCall`, inflight-ключ и опциональный `VOCAL_DAILY_TOKEN_LIMIT`. Playbook не дублируется отдельной рубрикой.
- Desktop: слева Дубли/Сценарий, справа постоянный «Диалог с Vocal». Mobile: три вкладки. Composer: текст, микрофон, send; Enter/Shift+Enter/IME. Автопрокрутка с «К новым сообщениям». Уход отменяет fetch и останавливает mic.
- «Перенести в сценарий»; на телефоне после переноса открывается Сценарий. «Помочь со сценарием» пишет предложение в диалог. «Перейти к записи» открывает Дубли без микрофона.

## Что намеренно не реализовано

- Профильный чат (Stage 10).
- `ScriptDraft` и новая семантика черновика (Stage 07).
- Запись нового дубля со сценарием (Stage 08); кнопка не запускает микрофон.
- Автосоздание готовой версии без действия пользователя.
- Вкладка «Вопросы» и «Продолжить обсуждение».
- Живой Groq в этом отчёте.

## Изменённые файлы

- `prisma/schema.prisma`, `prisma/migrations/20260912020000_dialogue_thread/migration.sql`
- `src/lib/dialogue.ts`, `dialogue-cursor.ts`, `dialogue-client.ts`, `ai/usage-guard.ts`, `scripts.ts`, `types/dialogue.ts`
- `src/app/api/thoughts/[id]/dialogue/route.ts`, `help/route.ts`, `transfer/route.ts`
- `src/components/ReelStudio.tsx`, `ReelStudioFrame.tsx`, `reel-studio.ts`, `ThoughtDialogue.tsx`, `ScriptEditor.tsx`, `vocal-ui/Composer.tsx`
- `tests/thought-dialogue.test.ts`, `tests/reel-studio.test.ts`, `package.json`

## Миграции и данные

- Новая миграция: да, `20260912020000_dialogue_thread`
- Проверка существующей SQLite: `prisma migrate deploy` на `prisma/dev.db` применил dialogue (и ранее отложенную thought_create_idempotency)
- Проверка чистой SQLite: `reels-migration` empty deploy, 10 миграций
- Backfill: нет; Q&A/review остаются в своих таблицах
- Возможность отката: git revert коммита кода + откат миграции

## Проверки

| Проверка | Результат | Ограничения |
|---|---|---|
| `npm run test:reels` | 63/63 | mock complete; legacy Q&A; idempotent send; transfer once; cursor; abort helper |
| `npm run lint` | exit 0 | предупреждение exhaustive-deps в `VocalAppShell` с Stage 01 |
| `npm run typecheck` | exit 0 | `scripts` в exclude |
| `npm run build` | успех | маршруты `/api/thoughts/[id]/dialogue*` |
| Browser 390×844 | вкладки Дубли / Сценарий / Диалог; composer без видео; `scrollWidth=390` | живой send/STT не гонялись |
| Browser 1280×800 | слева Сценарий, справа Диалог с Vocal; нет вкладки Вопросы | живой Groq не гонялся |

## AI и внешние сервисы

- Какие AI-вызовы добавлены или изменены: `AiCall.kind = dialogue` при ответе и help
- Проверено mock: да
- Проверено live: нет
- Что не проверено: живой Groq диалог, живой STT голоса в composer, длинная история pagination в UI

## Совместимость с будущим обучением

Свободный чат additive. Review/Question/Answer сохранены. Завершение мысли не трогалось.

- Какие исторические данные затронуты: только новые thread/message; legacy читается
- Может ли что-либо перезаписаться/удалиться при завершении, retry или возврате в работу: retry того же idempotencyKey не создаёт второе user/AI
- Сохраняются ли source metadata, порядок, итоговые ссылки и snapshots: порядок по createdAt; transfer пишет `accepted_ai` и payload
- Не создана ли новая рубрика в обход `playbook.ts`/`framework.ts`: нет; диалог не копирует playbook списком
- Можно ли позднее добавить read-only learning job без изменения смысла текущих моделей: да

## Подтверждения

- Force push не использовался.
- Следующий этап не начинался.
- Этап не объявляется принятым до внешнего ревью.
