# Отчёт этапа

## Идентификация

- Этап: Stage 05 — голос, видео и обработка материалов
- BASE_SHA: `facb78d03942506b9e9e79fa768fca097ae18b61`
- Коммит(ы) кода: `f887ef08b8a9792d5356eec6acb5509c02007388`
- Коммит исправления: `2af98a2cdd855db4357d62c7bb8082cbdf2c0af1`
- Коммит исправления (unmount abort): `1611f2784b4114d0a17a06e4399365312b76f5ac`
- HEAD_SHA: `1611f2784b4114d0a17a06e4399365312b76f5ac`
- Ветка: `feat/vocal-v2-05-media-processing`
- Ссылка GitHub: https://github.com/Kabalod/Vocal/tree/feat/vocal-v2-05-media-processing

Stage 04 принят на SHA `facb78d03942506b9e9e79fa768fca097ae18b61` (исправление `754b041112c74aaa413ac979541e0f4f414aa214`). Это BASE Stage 05. Ветка создана от этой вершины. Stage 06 не начинался.

## Что реализовано

- Голос: idle «Готовы к записи» / «Начать запись»; микрофон запрашивается только по кнопке; запись, таймер, уровень, «Завершить» / «Отменить»; перед потерей фрагмента confirm с длительностью.
- Видео: только file picker; камера не создаётся. Формат и размер проверяются до успешного дубля (реальные списки и `MAX_UPLOAD_MB` = 80).
- `POST /api/thoughts/media` переиспользует `saveUploadedTake`, `Job`, `ThoughtCreateKey`, ffmpeg/STT/analyze pipeline и `/api/jobs/:id/retry`.
- Состояния: прогресс загрузки, «Файл сохранён», «Расшифровываем», «Анализируем». После STT без подтверждения создаются сценарий v1 из распознанного текста и название (AI + fallback по первой фразе). Затем переход в существующую студию `/reels/:id`.
- Пустая расшифровка не пишется как original (retry STT возможен); файл дубля остаётся. Сбой STT/анализа не удаляет исходник.
- Cleanup: сессия записи помечается отменённой; после `getUserMedia` поздний stream останавливается без MediaRecorder; `stop()` только в `recording`/`paused`; onstop не создаёт preview после отмены; AudioContext, tracks, таймер и RAF закрываются; Object URL не создаётся после размонтирования. Загрузка отдаёт `abort()`; polling — `AbortController`. После `reelId` закрытие не обещает удаление.

## Что намеренно не реализовано

- Второй media pipeline; камера; видео в composer диалога.
- Запись нового дубля со сценарием (Stage 08).
- Перестройка студии и единого диалога (Stage 06).
- Live Groq STT/title/analysis в этом отчёте не гонялись.

## Изменённые файлы

- `src/components/NewThoughtSheet.tsx`, `ThoughtVoiceRecorder.tsx`, `ThoughtVideoUpload.tsx`, `ThoughtMediaProcessing.tsx`
- `src/lib/thought-media.ts`, `thought-title.ts`, `thought-media-upload.ts`, `thought-leave.ts`, `media-session.ts`, `pipeline.ts`, `thought-create.ts`
- `src/app/api/thoughts/media/route.ts`, `src/app/api/thoughts/[id]/processing/route.ts`
- `tests/thought-media-create.test.ts`, `tests/thought-media-cleanup.test.ts`, `package.json`

## Миграции и данные

- Новая миграция: нет (таблица `ThoughtCreateKey` уже из Stage 04)
- Проверка существующей SQLite: новые мысли пишут Reel/Take/Job; старые без ключа создания не получают auto-script/title из pipeline
- Проверка чистой SQLite: `thought-media-create` на временной БД
- Backfill: нет
- Возможность отката: git revert коммита кода

## Проверки

| Проверка | Результат | Ограничения |
|---|---|---|
| `npm run test:reels` | 60/60 | mock STT/AI; формат/размер без строк; idempotency + гонка; пустой STT не пишет transcript; retry создаёт v1; late mic; inactive stop; upload abort; hide/unmount abort; leave kinds |
| `npm run lint` | exit 0 | предупреждение exhaustive-deps в `VocalAppShell` с Stage 01 |
| `npm run typecheck` | exit 0 | `scripts` в exclude |
| `npm run build` | успех | маршруты `/api/thoughts/media` и `/api/thoughts/[id]/processing`; перед сборкой остановлен `next dev` |
| Browser 390×844 | Sheet, Голос idle; запись с разрешённым микрофоном; закрытие во время записи — «Удалить эту запись?» про локальный фрагмент | late-permission после закрытия покрыт тестом; XHR abort — mock |
| Browser 1280×800 | вкладка Видео: «Выбрать файл», текст про отсутствие камеры | живой upload/STT не проверялись |

## AI и внешние сервисы

- Какие AI-вызовы добавлены или изменены: `thought_title` через `AiCall` после STT; существующие STT и Job-анализ без нового pipeline
- Проверено mock: да
- Проверено live: нет
- Что не проверено: живой Groq STT, живое название, живой анализ. Микрофон: smoke записи и discard при закрытии Sheet; отмена уже идущего XHR — только mock.

## Совместимость с будущим обучением

Исходное медиа и Job сохраняются при сбое STT/анализа. Сценарий v1 неизменяем. Title AI пишет snapshot. Старые Job без `ThoughtCreateKey` не получают новое название/скрипт.

- Какие исторические данные затронуты: только новые media-мысли
- Может ли что-либо перезаписаться/удалиться при завершении, retry или возврате в работу: retry того же ключа не создаёт второй дубль; empty STT не затирает файл
- Сохраняются ли source metadata, порядок, итоговые ссылки и snapshots: sources JSON на original transcript; `AiCall` для названия
- Не создана ли новая рубрика в обход `playbook.ts`/`framework.ts`: нет; Job-анализ прежний
- Можно ли позднее добавить read-only learning job без изменения смысла текущих моделей: да

## Подтверждения

- Force push не использовался.
- Следующий этап не начинался.
- Этап не объявляется принятым до внешнего ревью.

## После замечаний

- Замечание: `getUserMedia` после закрытия Sheet всё равно создавал MediaRecorder; cleanup вызывал `stop()` на inactive recorder (`InvalidStateError`) и мог создать Object URL из `onstop` после `releaseAll()`; `uploadThoughtMedia` не отдавал `abort()`, а после `reelId` UI обещал удаление, которого нет.
- Исправление: сессия записи + `adoptGrantedMicrophone`; `stopRecorderIfActive` / отсоединённые handlers / `previewUrlIfSessionActive`; upload `{ promise, abort }` и `ThoughtUploadAbortedError`; `thoughtLeaveKind` разделяет discard-local / abort-upload / saved-continue; polling через `AbortController`.
- Новый commit SHA: `2af98a2cdd855db4357d62c7bb8082cbdf2c0af1`
- Повторная проверка: `test:reels` 59/59; lint; typecheck; build. Smoke микрофона: запись стартовала, закрытие Sheet спросило про локальный фрагмент, не про серверное удаление. Stage 06 не начинался.

- Замечание: XHR отменялся только после confirm закрытия/смены способа; при `open → false` и unmount (назад, уход со страницы) загрузка могла создать мысль. Текст обещал, что мысль не создастся.
- Исправление: эффект вызывает `syncThoughtUploadToSheetVisibility` при скрытии и в cleanup unmount; формулировка предупреждает, что сервер мог успеть принять запрос.
- Новый commit SHA: `1611f2784b4114d0a17a06e4399365312b76f5ac`
- Повторная проверка: `test:reels` 60/60; lint; typecheck; build. Живой unmount во время XHR не гонялся — сценарий в тесте. Stage 06 не начинался.
