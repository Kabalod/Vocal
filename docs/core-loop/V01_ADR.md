# V01 — решения

Ветка `feat/v01-from-base` от BASE `34abcd78c70b2fa31bd717aeff56acc31577c0d1`.
AUDITED_APP_SHA: `f971a7fb43c2fdd9df6b1824620491500972736a`.
V01: **не принят**. Live baseline / `migrate resolve` на Supabase не применять.

## Рабочий дубль

**Решение:** единственный источник — `Reel.workingTakeId`. Нет fallback на `selectedTakeId` или `takes[0]`. Пустой указатель → `WORKING_TAKE_REQUIRED` (409). Контекст диалога читает дубль `findFirst({ id: workingTakeId, reelId })`, не загружает все takes.

**Запись:** `createThoughtFromText` и первый `createTake` (если указатель пуст). Смена — только явный PATCH `workingTakeId`. Следующие дубли сами не становятся рабочими. `finalTakeId` не меняется.

**Старые строки:** миграция `3_v01_working_take_fk` один раз проставляет первый дубль той же мысли. После миграции runtime больше не угадывает.

## FK и индекс

Миграция `3_v01_working_take_fk` даёт только `workingTakeId → Take.id`: несуществующий id нельзя, **дубль другой мысли база ещё пропускала**.

**Решение:** миграция `4_v01_working_take_same_reel` — составной FK `Reel(workingTakeId, id) → Take(id, reelId)` и уникальность `Take(id, reelId)`. Это DB-инвариант принадлежности той же мысли. В `schema.prisma` связь остаётся `workingTakeId → Take.id`: Prisma не умеет включить собственный `Reel.id` в relation без поломки `@default(cuid())`. `prisma migrate diff` не должен откатывать миграцию 4. Write-path `updateReel` остаётся.

**Индекс:** `@@index([workingTakeId])` из `2_v01_working_take` сохраняется.

## Точная ревизия и снимок

**Решение:** один проход `freezeThoughtPrompt`: читает рабочий дубль, затем из этих же значений собирает промпт и `AiCall.inputSnapshotJson` (`text`, `playbook`, `workingTakeId`, `transcriptRevisionId`, `reelUpdatedAt`, `dialogueVersion`). Снимок не читается заново после сборки промпта.

## Версия состояния

**Решение:** клиентский `expectedUpdatedAt` / `expectedWorkingTakeId` до вызова. После модели `commitDialogueReply` в одной транзакции: `FOR UPDATE` на Reel, Take и DialogueThread, сверка снимка, повторная сверка после test-seam, затем запись `AiCall` + processing + optional proposal. Расхождение → 409, stale reply не пишется.

## Inflight

**Решение:** ключ = `ownerUserId` + object type + object id + operation type + `idempotencyKey`. Повтор ключа делит Promise. `finally` снимает ключ и после ошибки модели.

## Вне объёма

ThoughtState, четыре действия, confirm портрета, UI записи, завершение без `finalScriptId`, playbook, live migrate.
