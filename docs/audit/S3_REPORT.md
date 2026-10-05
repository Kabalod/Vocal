# S3 — вход в цикл и чистка старого UI: отчёт

Статус: **кандидат**, не приёмка. Ветка `feat/s3-entry-cleanup` от `feat/s1-ai-gateway` (BASE = `c11118f`). Закрывает п. 1, 11, 12, 13 аудита; п. 15 — не воспроизведён (см. ниже).

## Что сделано

1. **Новая мысль голосом и видео (п. 1, решение S0.2).** `NewThoughtSheet` — одна карточка без вкладок: кнопки «Голос» и «Видео», «Название», «Мысль». Запись и выбор файла начинаются только по явному действию. Использованы существующие `ThoughtVoiceRecorder`, `ThoughtVideoUpload`, `ThoughtMediaProcessing`, `uploadThoughtMedia`, `POST /api/thoughts/media`; нового API нет. Отмена/закрытие листа во время записи или загрузки показывает подтверждение и останавливает микрофон/загрузку (логика `thought-leave`, как в 2af98a2/1611f27). Кнопка текстового создания блокируется во время записи.
2. **Найден и исправлен дефект навигации.** После создания мысли `openThought` вызывал `router.push` и сразу `router.refresh()`; в настоящем браузере примерно в половине прогонов навигация проигрывала и автор оставался на списке (A/B: с `refresh` 2 из 4 провалов, без — 5 из 5 успехов). `router.refresh()` убран. Затрагивает и текстовый путь.
3. **Чистка.** `/settings` → редирект на `/reels`; `PUT`/`POST /api/criteria` → 410 (`GET` и таблица `Criterion` не тронуты); `POST /api/uploads` без `reelId` → 410; `/jobs/[id]` фильтрует по `ownerUserId` (чужой Job → 404, новый `src/lib/job-deeplink.ts`); строки «Цель/Аудитория ролика» убраны из промпта диалога (S0.6; аудит ошибочно называл `v05-script.ts` — там их не было, они были в `dialogue.ts`).
4. **Удалено** (потребителей в `src/app`, `tests`, `scripts` нет): компоненты `JobView`, `AnalysisExtras`, `PipelineProgress`, `RecommendationList`, `ScoreCard`, `TranscriptView`, `RecordingCard`, `ScriptVersionList`, `SetupBanner`, `ReelWorkspace`, `ReelContextForm`, `UploadDropzone`; модули `lib/analyze.ts`, `lib/metrics.ts`, `lib/scoring.ts`, `lib/reel-editor-session.ts`; скрипты `score-analyz.ts`, `analyze-sirdenisov.ts`. **Исчезла проверка:** `tests/reels-editor-session.test.ts` (тестировала только удалённый модуль).
5. **Намеренно оставлено** (на них ссылаются тесты, чтение файла или проверки контрактов): `ReelCard`, `ReelStatusIcon`, `TakeComparison`, `lib/format`, `product-contracts`, `a11y-contracts`, `thought-completion-db`, `ai/script`, `lib/criteria`, `lib/backup` + `scripts/backup.ts` (заменить в S4), `thought-leave` (теперь используется). Их удаление требует переписывать тесты — отдельное решение.
6. **Вспомогательное:** флаг `VOCAL_STT_MOCK=1` в `stt.ts` (как `VOCAL_AI_MOCK`, только для тестов и локального UI); `middleware` пропускает запрос без Supabase-окружения также при `VOCAL_UI_TEST_DB=1` (тот же флаг уже включает пользователя `local` в `resolveRequestUser`); тесты: `tests/s3-entry-cleanup.test.ts`, обновлены `legacy-routes`, `criteria-write`, `new-thought-ui`.

## Проверки (Node 22, встроенный Postgres, Chromium 153 через Playwright, Linux)

- `tsc --noEmit` — ок; `next build --no-lint` с локальной БД — ок.
- Все 90 тестовых файлов runner (кроме live-тестов): **380 pass / 0 fail**, ~7 мин 36 с.
- **Браузерный E2E на production-сборке** (мок STT/AI, реальный ffmpeg, фейковый микрофон Chromium, реальный видеофайл), 1280×800 и 390×844: текст, голос и видео → мысль создана → открывается страница мысли. По БД: каждая мысль имеет рабочий дубль с ревизией расшифровки, `Job` в статусе `done`, название взято из расшифровки, строки учёта `stt` и `thought_title`. 6/6 успешно.
- Отмена во время записи: подтверждение показано, живых дорожек микрофона 0, новых мыслей 0.
- Загрузка нового дубля через `TakeUploadDropzone` на странице мысли — работает (`takeCount` 1 → 2).
- A/B: `ownedJobReelId` для чужого Job → «не найден».

## Что не проверялось

- **Upload-дефект (п. 15) не воспроизведён и не исправлен.** Среда — Linux; Chrome/Edge на Windows недоступны. Выбор файла работает в Chromium на Linux для `TakeUploadDropzone` и нового выбора видео. Гипотеза для проверки на Windows (не подтверждена): `accept="video/*,…"` / `audio/*,…` у `<input type=file>` в Chrome/Edge на Windows может замедлять или задерживать открытие диалога; шаги: открыть мысль → «Дубли» → нажать выбор файла в Chrome и Edge, замерить время до диалога, повторить с `accept` только по расширениям. Исправлять только после воспроизведения.
- Режим `next dev` при большом числе мыслей в тестовой схеме медленнее и давал таймауты скриптов; финальный E2E шёл на production-сборке.
- Реальный микрофон, камера и качество живой STT не проверялись (фейковое устройство, мок STT).
- `next build` с lint по-прежнему падает на `VocalAppShell.tsx` (см. S1_REPORT); S3 этот файл не менял.
