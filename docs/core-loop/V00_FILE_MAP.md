# V00 — карта файлов ядра мысли

Дерево **`AUDITED_APP_SHA`** `f971a7fb43c2fdd9df6b1824620491500972736a` (кандидат для будущего BASE, не BASE). Матрица: [`PLAN.md`](./PLAN.md).

Не создавать в V00: ThoughtState, четыре действия агента, `workingTakeId`, снятие confirm.

## Матрица этапов

- **V01** — актуальный дубль, точная ревизия, изоляция запросов.
- **V02** — ThoughtState.
- **V03** — четыре действия агента и решение о готовности.
- **V04** — портрет и персонализация вопросов.
- **V05** — UI перехода к записи и роль сценария.
- **V06** — разбор следующего дубля и завершение.
- **V07** — библиотека приёмов и полный цикл.

## Существующие ядра

| Область | Файлы на `f971a7f` | Этап |
|---|---|---|
| Диалог мысли | `src/lib/dialogue.ts`, `src/app/api/thoughts/[id]/dialogue/**` | V01 контекст и ключи; V03 контракт действий |
| Актуальный дубль / ревизия | `Take`, `TranscriptRevision`, `selectedTakeId`, `finalTakeId`, `selectedTranscriptId` | V01 |
| Помощь сценарием | `requestScriptHelp` в `dialogue.ts`; `src/lib/ai/script.ts`, `src/lib/scripts.ts`, generate API | V05 |
| Статус карточки | `src/types/reel.ts`, `src/lib/reels.ts` | читать; пользовательские группы не расширять |
| Завершение | `thoughtCompletionGate` и `backfillFinalTakeIds` в `src/lib/thought-completion.ts`; UI `CompletionSummary.tsx`, `ReelStudio.tsx` | V06; backfill — служебная функция |
| Разбор дубля | `src/lib/ai/review.ts`, `questions.ts`, pipeline STT | V06 согласовать с циклом; не драйвер баллов |
| Портрет | `src/lib/profile.ts`, `profile-dialogue.ts`, `profile-portrait.ts`, `ai/profile.ts`, `ProfileConversation.tsx`, `app/api/profile/**` | **V04** |
| Контекст сборки | `src/lib/reel-context.ts`, `ai-runtime-context.ts` | V01 / V04 не ломать snapshot |
| Вызов A | `src/lib/ai/complete.ts`, `usage-guard.ts`, `groq.ts` | V01 inflight |
| Загрузка / Job | `uploads` → `pipeline.ts` → `analyze.ts` / `stt.ts` | не смешивать транспорт в V01 |
| Схема | `prisma/schema.prisma` (postgresql) | колонки ThoughtState — V02; completion — V06 |
| Auth | `src/lib/auth/**`, `src/lib/supabase/**` | принят; не переписывать в ядре |
| Лендинг | `src/app/page.tsx`, `src/components/landing/**` | принят; не трогать |
| Канон UI | `docs/design/references-new/` экраны 01–09; `/reels` = 09 | визуал не этот цикл |
| Документы цикла | `docs/core-loop/*` | V00 |

## Локальные файлы вне `f971a7f`

На этом SHA отсутствуют и **не канон**:

- `src/lib/dialogue-reply.ts`
- `src/lib/thought-opening.ts`
- `src/lib/thought-completion-gate.ts` (gate живёт в `thought-completion.ts`)

## Новые модули (не создавать в V00)

- ThoughtState / reducer (**V02**)
- действия `ask_question` / `suggest_take` / `content_sufficient` / `redirect_to_task` (**V03**)
- `workingTakeId` (**V01**)
- библиотека приёмов (**V07**)

## Тесты

Ожидаемые переписывания по этапам: диалог и третий дубль (V01), состояние (V02), действия (V03), портрет без confirm (V04), запись/сценарий (V05), разбор и завершение без `finalScriptId` (V06), полный цикл (V07).

Оставить зелёными без ослабления: `test:reels`, lint, typecheck, build. I01 не начинать.

## Не трогать в V00

- визуальный канон, champagne/STAGE/Desktop-архивы
- принятые лендинг и Auth
- I01 память / scoring-v1 как отдельный интеллект-цикл
- Prisma schema / migrations и live Supabase
