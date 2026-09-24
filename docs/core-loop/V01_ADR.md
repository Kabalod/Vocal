# V01 — решения

Ветка `feat/v01-from-base` от BASE `34abcd78c70b2fa31bd717aeff56acc31577c0d1`.
AUDITED_APP_SHA: `f971a7fb43c2fdd9df6b1824620491500972736a`.
V01: **не принят**. Live baseline / `migrate resolve` на Supabase не применять.

## Рабочий дубль

**Решение:** единственный источник — `Reel.workingTakeId`. Нет fallback на `selectedTakeId` или `takes[0]`. Пустой указатель → `WORKING_TAKE_REQUIRED` (409). Контекст диалога читает дубль `findFirst({ id: workingTakeId, reelId })`, не загружает все takes.

**Запись:** `createThoughtFromText` и первый `createTake` (если указатель пуст). Смена — только явный PATCH `workingTakeId`. Следующие дубли сами не становятся рабочими. `finalTakeId` не меняется.

**Старые строки:** миграция `3_v01_working_take_fk` один раз проставляет первый дубль той же мысли. После миграции runtime больше не угадывает.

## FK и индекс

**Решение:** FK `Reel.workingTakeId → Take.id` (`ON DELETE RESTRICT`). Без FK база принимала id чужой мысли. Write-time проверка в `updateReel` остаётся. Цикл Reel↔Take допустим: сначала Reel, затем Take, затем указатель.

**Индекс:** `@@index([workingTakeId])` совпадает с `Reel_workingTakeId_idx` из `2_v01_working_take`. Prisma diff не должен снимать индекс.

## Точная ревизия и снимок

**Решение:** в промпт идёт `selectedTranscriptId` рабочего дубля. `AiCall.inputSnapshotJson` хранит `text`, `playbook`, `workingTakeId`, `transcriptRevisionId`, `reelUpdatedAt`, `dialogueVersion` (`threadId`, `messageCount`, `lastMessageId`).

## Версия состояния

**Решение:** клиентский `expectedUpdatedAt` / `expectedWorkingTakeId` проверяется до вызова. После ответа модели снимок сравнивается снова. Если рабочий дубль, ревизия, `Reel.updatedAt` или голова диалога изменились — ответ модели **не** пишется как done, `AiCall` = error `STATE_VERSION`, сообщение processing = error, наружу **409**.

## Inflight

**Решение:** ключ = `ownerUserId` + object type + object id + operation type + `idempotencyKey`. Повтор ключа делит Promise. `finally` снимает ключ и после ошибки модели.

## Вне объёма

ThoughtState, четыре действия, confirm портрета, UI записи, завершение без `finalScriptId`, playbook, live migrate.
