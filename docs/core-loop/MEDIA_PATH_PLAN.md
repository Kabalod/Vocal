# Медиа-путь основного цикла

Статус: **кандидат в работе, не принят**. V00–V07 не переоткрывать.
BASE: `3206fe4ca6849aced92ee5a554cde0f72f284ca3`.
Ветка: `fix/c00-live-action-shape`.

Пользовательский результат: запись → сохранённая расшифровка → доступный рабочий дубль. Разбор смысла — только явным ходом в основном «Диалоге».

## Карта вызовов на BASE

| Вход | Модель | Записи | UI |
|---|---|---|---|
| `createThoughtFromMedia` / `ensureJobForTake` → `enqueueJob` → `processJob` | STT (`transcribeAudio`); затем **на BASE** `analyzeSpeech` (баллы, coach) + `ensureAutomaticTakeComparison` (семантика); title через `applyThoughtTitleFromTranscript` | Job, original/selected transcript, AnalysisResult, CompareResult; V06 auto-working | `StudioJobWatch`, `ThoughtMediaProcessing` |
| `POST /api/jobs/:id/retry` | тот же pipeline | тот же Job, без нового Take | кнопка «Повторить» |
| recover / stale lease | тот же pipeline | тот же Job | poll GET `/api/jobs/:id` |
| `POST /api/takes/:id/review` | `createTakeReview` | Review + вопросы | `ReviewPanel` |
| `POST /api/reels/:id/questions` | `continueQuestions` | Question | `QuestionList` |
| `POST /api/reels/:id/compare` `runAi=true` | `createReelComparison` | CompareResult | `TakeComparison` (не в основном Studio) |
| `ensureAutomaticTakeComparison` | то же | CompareResult | `AutoTakeCompare` читает GET |
| GET review / questions / compare, PATCH question, export | нет создания разбора | чтение архива | история, `export-reel` |
| `scripts/score-analyz.ts` | scoring CLI | не Job приложения | нет |

`playbook.ts` / Job-coach на BASE входят в `analyzeSpeech`, не в диалог V03–V07.

## Границы

В объёме: pipeline дублей основного цикла; title + fallback; повтор STT; lease; 410 на создание legacy review/questions и AI-compare; UI-копии без автообещаний.

Вне объёма: Prisma/live-схема, probe, I01, мост, I06/I07/I08, платные модели, удаление архивных таблиц, завершение мысли (итог выбирает автор).
