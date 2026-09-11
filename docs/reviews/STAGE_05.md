# Отчёт этапа

## Идентификация

- Этап: Stage 05 — голос, видео и обработка материалов
- BASE_SHA: `facb78d03942506b9e9e79fa768fca097ae18b61`
- Коммит(ы) кода: `f887ef08b8a9792d5356eec6acb5509c02007388`
- HEAD_SHA: `f887ef08b8a9792d5356eec6acb5509c02007388`
- Ветка: `feat/vocal-v2-05-media-processing`
- Ссылка GitHub: https://github.com/Kabalod/Vocal/tree/feat/vocal-v2-05-media-processing

Stage 04 принят на SHA `facb78d03942506b9e9e79fa768fca097ae18b61` (исправление `754b041112c74aaa413ac979541e0f4f414aa214`). Это BASE Stage 05. Ветка создана от этой вершины. Stage 06 не начинался.

## Что реализовано

- Голос: idle «Готовы к записи» / «Начать запись»; микрофон запрашивается только по кнопке; запись, таймер, уровень, «Завершить» / «Отменить»; перед потерей фрагмента confirm с длительностью.
- Видео: только file picker; камера не создаётся. Формат и размер проверяются до успешного дубля (реальные списки и `MAX_UPLOAD_MB` = 80).
- `POST /api/thoughts/media` переиспользует `saveUploadedTake`, `Job`, `ThoughtCreateKey`, ffmpeg/STT/analyze pipeline и `/api/jobs/:id/retry`.
- Состояния: прогресс загрузки, «Файл сохранён», «Расшифровываем», «Анализируем». После STT без подтверждения создаются сценарий v1 из распознанного текста и название (AI + fallback по первой фразе). Затем переход в существующую студию `/reels/:id`.
- Пустая расшифровка не пишется как original (retry STT возможен); файл дубля остаётся. Сбой STT/анализа не удаляет исходник.
- Cleanup: stop tracks, revoke object URL, сброс recorder при размонтировании / смене способа / закрытии sheet.

## Что намеренно не реализовано

- Второй media pipeline; камера; видео в composer диалога.
- Запись нового дубля со сценарием (Stage 08).
- Перестройка студии и единого диалога (Stage 06).
- Live Groq STT/title/analysis в этом отчёте не гонялись.

## Изменённые файлы

- `src/components/NewThoughtSheet.tsx`, `ThoughtVoiceRecorder.tsx`, `ThoughtVideoUpload.tsx`, `ThoughtMediaProcessing.tsx`
- `src/lib/thought-media.ts`, `thought-title.ts`, `thought-media-upload.ts`, `media-session.ts`, `pipeline.ts`, `thought-create.ts`
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
| `npm run test:reels` | 56/56 | mock STT/AI; формат/размер без строк; idempotency + гонка; пустой STT не пишет transcript; retry создаёт v1; cleanup helpers |
| `npm run lint` | exit 0 | предупреждение exhaustive-deps в `VocalAppShell` с Stage 01 |
| `npm run typecheck` | exit 0 | `scripts` в exclude |
| `npm run build` | успех | маршруты `/api/thoughts/media` и `/api/thoughts/[id]/processing` |
| Browser 390×844 | Sheet, Голос idle «Готовы к записи», `scrollWidth=390`, микрофон не стартовал | live запись не проверялась |
| Browser 1280×800 | вкладка Видео: «Выбрать файл», текст про отсутствие камеры | живой upload/STT не проверялись |

## AI и внешние сервисы

- Какие AI-вызовы добавлены или изменены: `thought_title` через `AiCall` после STT; существующие STT и Job-анализ без нового pipeline
- Проверено mock: да
- Проверено live: нет
- Что не проверено: живой Groq STT, живое название, живой анализ, настоящая запись с микрофона

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
