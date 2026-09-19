# I00 — карта файлов и будущих изменений

Не менять эти файлы до принятого I00, кроме документов этого аудита.

## Существующие ядра (читать, расширять)

| Область | Файлы | I-этап |
|---|---|---|
| Профиль / confirm | `src/lib/profile.ts`, `profile-dialogue.ts`, `profile-portrait.ts`, `ai/profile.ts`, `components/ProfileConversation.tsx`, `app/api/profile/**` | I05 снимает confirm; I01 миграция payload |
| Диалог мысли | `src/lib/dialogue.ts`, `app/api/thoughts/[id]/dialogue/**` | I02 handler |
| Сценарий | `src/lib/ai/script.ts`, `src/lib/scripts.ts`, `.../scripts/generate` | I02/I03 |
| Разбор / вопросы / compare | `src/lib/ai/review.ts`, `questions.ts`, `compare.ts` | I02 защита |
| Контекст | `src/lib/reel-context.ts`, `ai-runtime-context.ts` | I05 snapshot |
| Вызов / лимит | `src/lib/ai/complete.ts`, `usage-guard.ts`, `groq.ts`, `stt.ts` | I07 operationId |
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
