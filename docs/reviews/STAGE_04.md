# Отчёт этапа

## Идентификация

- Этап: Stage 04 — создание мысли текстом
- BASE_SHA: `cc3e2961fe1aa0d0b8fb7826dfd92313a09203e7`
- Коммит(ы) кода: `ffde3d1ec9cc54224d72669c3ec1ece07be39c9b`
- Коммит исправления: `754b041112c74aaa413ac979541e0f4f414aa214`
- HEAD_SHA: `754b041112c74aaa413ac979541e0f4f414aa214`
- Ветка: `feat/vocal-v2-04-text-creation`
- Ссылка GitHub: https://github.com/Kabalod/Vocal/tree/feat/vocal-v2-04-text-creation

Stage 03 принят на SHA `cc3e2961fe1aa0d0b8fb7826dfd92313a09203e7` (код исправления `29ff92b5e4f87a8c61ea7ad5a8c3a805de969a1f`). Это BASE Stage 04. Ветка создана от этой вершины. Stage 05 не начинался.

## Что реализовано

- «Новая мысль» открывает Sheet (`VocalModal` `placement="sheet"`) с вкладками Текст / Голос / Видео.
- Текстовый путь: название и свободное поле мысли, без отдельной кнопки «выбрать текст». Пустое название на сервере становится «Новая мысль».
- Черновик пишется в `localStorage` (`vocal-thought-draft-v1`) сразу при вводе, без кнопки «Сохранить». После успешного создания ключ очищается; при ошибке текст остаётся.
- `POST /api/thoughts` `{ title, body, idempotencyKey }` одной транзакцией создаёт `Reel` (`idea`), Take №1 (`inputType: text`), исходную `TranscriptRevision` (`original` / `manual`) и `ScriptVersion` v1 (`kind: manual`) с тем же текстом после trim. Выставляются `selectedTranscriptId`, `scriptVersionId` дубля и `selectedScriptId` мысли. Финальный сценарий и финальный дубль не назначаются.
- Успех: 201 и переход в существующую студию `/reels/:id`. Повтор того же `idempotencyKey`: 200, тот же reel, второй Take №1 не создаётся. Кнопка disabled / «Создаём мысль…» на время запроса.
- Длинный текст: `initialNote` копируется только если тело ≤ лимита заметки; иначе заметка пустая, источник истины — дубль и сценарий, без молчаливого обрезания.

## Что намеренно не реализовано

- Запись голоса и upload видео: только поясняющий текст; микрофон не запрашивается.
- `ScriptDraft`; AI на этом шаге; перестройка студии и единого диалога.
- Stage 05 (голос).
- Компактный DTO списка версий сценария для desktop-превью (замечание к Stage 03 / follow-up Stage 07): полный bundle через существующий `GET /api/reels/:id/scripts` для одной выбранной мысли на MVP допустим.

## Изменённые файлы

- `src/components/NewThoughtSheet.tsx`, `src/components/ReelList.tsx`
- `src/lib/thought-create.ts`, `src/lib/thought-draft.ts`
- `src/app/api/thoughts/route.ts`
- `tests/thought-text-create.test.ts`, `package.json`
- после ревью: `prisma/schema.prisma`, `prisma/migrations/20260912001000_thought_create_idempotency/migration.sql`, `src/lib/thought-create.ts`

## Миграции и данные

- Новая миграция: да, `20260912001000_thought_create_idempotency` (таблица `ThoughtCreateKey`)
- Проверка существующей SQLite: таблица пустая; старые мысли без ключа не трогаются. Ограничение Take `@@unique([reelId, idempotencyKey])` не менялось
- Проверка чистой SQLite: `thought-text-create` и `reels-migration` на временной БД (`migrate deploy`, 9 миграций)
- Backfill: нет
- Возможность отката: git revert коммита исправления + откат миграции
- Искусственный сбой `VOCAL_FAIL_THOUGHT_CREATE=after-reel` откатывает транзакцию: строк Reel/Take/Script/Transcript и ключа не остаётся

## Проверки

| Проверка | Результат | Ограничения |
|---|---|---|
| `npm run test:reels` | 54/54 | mock Groq; пустое тело 400; rollback; sequential + concurrent idempotency; reload reel/takes/scripts/transcript; untitled → «Новая мысль» |
| `npm run lint` | exit 0 | предупреждение exhaustive-deps в `VocalAppShell` с Stage 01, не трогалось |
| `npm run typecheck` | exit 0 | `scripts` в exclude; `analyze.ts` с `@ts-nocheck` |
| `npm run build` | успех | перед сборкой остановлен `next dev`; в маршрутах есть `/api/thoughts` |
| Browser 390×844 | Sheet «Новая мысль»; вкладка Голос без mic/capture; `scrollWidth=390`; карточка «Stage04 текст», дублей 1, превью исходного текста | smoke на :3002 |
| Browser 1280×800 | Sheet Текст / Голос / Видео, aside «Дальше — с Vocal»; создание → студия с текстом v1 «Это исходная мысль для проверки создания.» | React-controlled fill через native value setter |

## AI и внешние сервисы

- Какие AI-вызовы добавлены или изменены: нет
- Проверено mock: да
- Проверено live: нет
- Что не проверено: живой Groq, запись медиа

## Совместимость с будущим обучением

Создание пишет исходный текст пользователя в дубль, original transcript и manual script v1. Retry с тем же ключом не создаёт второй дубль. Модель не вызывается.

- Какие исторические данные затронуты: только новые объекты успешного создания
- Может ли что-либо перезаписаться/удалиться при завершении, retry или возврате в работу: retry того же ключа возвращает уже созданную мысль
- Сохраняются ли source metadata, порядок, итоговые ссылки и snapshots: sources JSON ссылается на исходную расшифровку; порядок дубля №1
- Не создана ли новая рубрика в обход `playbook.ts`/`framework.ts`: нет
- Можно ли позднее добавить read-only learning job без изменения смысла текущих моделей: да

## Подтверждения

- Force push не использовался.
- Следующий этап не начинался.
- Этап не объявляется принятым до внешнего ревью.

## После замечаний

- Замечание: `@@unique([reelId, idempotencyKey])` не защищает создание мысли: у конкурентных запросов разные `reelId`, два `findFirst` не заменяют уникальность; тест был только последовательный.
- Исправление: таблица `ThoughtCreateKey` с уникальным `key`; запись в той же транзакции; при P2002 возвращается уже созданная мысль (не 500). Клиентский disabled без изменений.
- Новый commit SHA: `754b041112c74aaa413ac979541e0f4f414aa214`
- Повторная проверка: `test:reels` 54/54; lint; typecheck; build. Браузер не гонялся — правка серверная. Stage 05 не начинался.
