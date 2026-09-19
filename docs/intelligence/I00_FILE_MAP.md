# I00 — карта файлов и будущих изменений

I00 принят (`9b6d2014cef681cbd61d5def51c987411e234e29`). Карта описывает схему **на момент аудита** (SQLite, автор `local`). После принятых P01.6-2 и Auth карту обновить и только тогда назначить BASE_SHA I01. До I01 код интеллекта не менять; визуальный цикл и Auth — отдельные этапы.

## Существующие ядра (читать, расширять)

| Область | Файлы | I-этап |
|---|---|---|
| Профиль / confirm | `src/lib/profile.ts`, `profile-dialogue.ts`, `profile-portrait.ts`, `ai/profile.ts`, `components/ProfileConversation.tsx`, `app/api/profile/**` | I05 снимает confirm; `healStoredPortrait` в `profile-dialogue.ts` — restore+write на GET; I01 миграция payload |
| Диалог мысли | `src/lib/dialogue.ts`, `app/api/thoughts/[id]/dialogue/**` | I02 handler; budget+inflight есть |
| Сценарий | `src/lib/ai/script.ts`, `src/lib/scripts.ts`, `.../scripts/generate` | I02/I03; `AiCall` без budget/inflight |
| Разбор / вопросы / compare | `src/lib/ai/review.ts`, `questions.ts`, `compare.ts` | I02 защита; `AiCall` без budget/inflight; compare также из pipeline |
| Контекст | `src/lib/reel-context.ts`, `ai-runtime-context.ts` | I05 snapshot |
| Вызов A (`complete.ts`) | `src/lib/ai/complete.ts`, `usage-guard.ts`, `groq.ts` | I07 operationId; budget только диалоги |
| Загрузка / Job Groq | `src/app/api/uploads/route.ts` → `src/lib/pipeline.ts` → `src/lib/analyze.ts` → прямой Groq (`completeJson`, не `complete.ts`) | нет `AiCall`; Job retry ≠ token budget; STT: `stt.ts` |
| STT | `src/lib/stt.ts` | Whisper; `withRetry`; не `AiCall` |
| Legacy playbook | `src/lib/playbook.ts` (ещё `analyze.ts`, `ai/review.ts`, `scoring.ts`) | **не** целевая библиотека I06; в I06 решить: интеграция или отключение |
| Скоринг Job | `src/lib/scoring.ts` | баллы критериев видео; не memory scoring-v1 |
| Схема | `prisma/schema.prisma` | I01 сущности памяти |
| Типы 8 полей | `src/types/profile.ts` | сохранить как проекцию |
| Корпус | `Analyz/_research/` | I06 файл библиотеки, не рантайм БД |

## Новые модули (не создавать до I01+)

Логические имена плана, не обязательно 8 процессов:

- `operation handler`, `answer analyzer`, `memory policy`, `thought state reducer`
- `context builder`, `craft selector`, `response generator`, `result validator`

Начальный бюджет: анализ + формулировка, не восемь LLM.

## Тесты, которые придётся переписать (не отключать suite)

`tests/p10-p12-profile.test.ts`, `profile-dialogue.test.ts`, `r2-idempotency.test.ts` (профиль), `mvp-release.test.ts`, `p17-e2e-matrix.test.ts`.

Оставить зелёными без ослабления: `package.json` `test:reels`, lint, typecheck, build.

## Не трогать в интеллекте

Визуальный канон `docs/design/references-new/`, архив P01.6, champagne/STAGE архивы. Диалог не появляется на экране дублей.
