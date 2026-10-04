# Медиа-путь — отчёт кандидата

Status: **кандидат на приёмку, не принят**. V00–V07 не переоткрыты. I06, I07, I08 и запуск приложения не закрыты.
BASE объёма: `3206fe4ca6849aced92ee5a554cde0f72f284ca3`.
Первый кандидат: `5264ca627e7b09c086adfe47a136ed97959d5267` (объём не принят: публикация после STT без проверки текущего lease).
Продуктовый SHA: `269a389f6bcc31d6d9243a0e50540f24c1078784`.
Документы с SHA продукта: `41fca0166e85fe19077e1cc62fed82437e30866f`.

## Факт → изменение → проверка

1. **На BASE `processJob` после STT вызывал `analyzeSpeech` и `ensureAutomaticTakeComparison`.** После original/selected и title Job завершается. Scoring, coach, Review, Question, CompareResult и ScriptVersion как побочный эффект STT не создаются.
2. **Публикация original / selected / bodyText / workingTake / title шла после `await` STT без блокировки Job.** Короткая транзакция: `Job FOR UPDATE` и сверка `leaseOwner`, затем `Reel FOR UPDATE`. `claimJob` берёт тот же замок Job.
3. **`saveOriginalIfAbsent` создавал original до замка Reel.** Создание original только после блокировок. Pipeline не импортирует AnalysisResult вне этой транзакции.
4. **Title писал результат модели без повторной проверки.** Вызов модели вне транзакции. Перед записью или fallback — lease и «заголовок ещё можно заменить».
5. **Активные POST создавали новый legacy-разбор.** `POST review` / `POST questions` → 410. `POST compare` `runAi=true` → 410. GET истории сохранены.

Внешняя сверка кода по lease/original/title закрыта до этих проверок.

## UI smoke (тестовая Postgres, mock STT/AI)

- SHA продукта: `269a389f6bcc31d6d9243a0e50540f24c1078784`
- БД: локальный `postgres:16-alpine` `127.0.0.1:55433/vocal_test` (`VOCAL_UI_TEST_DB=1`, не live Supabase)
- Режим: `VOCAL_AI_MOCK=1`; STT на smoke-сервере — mock (`мок расшифровка кухни`), без платных вызовов
- Next: `npx next dev -p 3017` (webpack; Turbopack в worktree падает на symlink `node_modules`)
- Размеры: desktop **1280×800**, mobile **390×844**
- Результат: **pass**
- Длительность: около 12 мин (подъём БД/сервера + загрузки + UI)

Проверенные загрузки (тот же API, что UI; системный file picker не открывался):

| Файл | Формат | Результат |
|---|---|---|
| `smoke.wav` | WAV, PCM 16 kHz mono, ~1 с, 31 КБ | `POST /api/thoughts/media` → Job `done`, одна original, выбранная расшифровка, title из fallback, `analysis=null` |
| `smoke.mp4` | MP4 H.264+AAC 320×240, ~1 с, 12 КБ | `POST /api/uploads` `process=1` (как dropzone) → Job `done`, дубль №2 стал рабочим по V06 |

Остальное в том же прогоне:

- после обоих STT: ScriptVersion **0**, Review **0**, Question **0**, CompareResult **0**, AnalysisResult **null**
- вкладка «Сценарий»: «Открытие вкладки ничего не генерирует», версий нет
- сравнение: архив «Новое сравнение само не появляется»; кнопок создания legacy AI-разбора нет
- явный POST `/api/thoughts/:id/dialogue` с текстом «Разбери эту мысль…» → mock-ответ «Что для вас здесь главное своими словами?»; сценарий/Review/Question/Compare не приросли (Review=1 и Compare=1 только после ручного посева архива)
- итоговый дубль №2, завершение без сценария → `status=completed`, итоговый текст из расшифровки
- повтор done-Job → 400 `JOB_DONE`; восстановление `error` `stage=analyze` с сохранённой original: Job `done`, STT не создал вторую original, выбранная edit «кухня, правка автора» сохранилась, дублей по-прежнему 2
- UI: «Новый дубль не заменяет старый и не становится итоговым сам»; dropzone: «Разбор ИИ с загрузки не запускается»

Отдельный upload-дефект (диалог выбора файла Windows) **не воспроизводился** и **не объявляется исправленным**.

## Полный `test:postgres`

- SHA: `269a389f6bcc31d6d9243a0e50540f24c1078784` (продукт не менялся; рабочее дерево = docs `41fca01` + этот отчёт)
- Перед запуском: `VOCAL_UI_TEST_DB` и `VOCAL_AI_MOCK` сняты
- Штатный `prisma generate`: **EPERM** rename `query_engine-windows.dll.node` в общем `D:\Vocal\node_modules\.prisma\client`; чужие процессы не завершались
- Повтор: явный `VOCAL_SKIP_PRISMA_GENERATE=1`, `prisma_generate_skipped=canonical_fingerprint`
- Результат: **253 pass / 0 fail**
- Длительность тестов: `tests_ms=615827` (~10.3 мин); весь скрипт `ELAPSED_MS=623314`

Адресные `--media` ранее: 11/11. `npx tsc --noEmit` на кандидате — ok.

## Ограничения

Не принят. Не готовность приложения к запуску. Не тронуты probe, live-схема, SQL recreate, Prisma-схема, платные модели, I01/I06/I07/I08, мост памяти. Приёмка этим коммитом не записывается.
