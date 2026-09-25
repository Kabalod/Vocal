# V00 — решения аудита (ADR)

Канон решений вместе с [`CONTRACT.md`](./CONTRACT.md). Матрица этапов: [`PLAN.md`](./PLAN.md).
Факты кода — `AUDITED_APP_SHA` `f971a7fb43c2fdd9df6b1824620491500972736a`.
Исторический снимок: `4ac28630692860a3092cf6c4cbc05ed791eb549d`.
BASE_SHA (старт V01): `34abcd78c70b2fa31bd717aeff56acc31577c0d1`. V01: **accepted** (`V01_HEAD` `d34e8dee2243ae109f2e535a439784117cef3aff`). V02: **in progress** (not accepted). V02_BASE_SHA: `4223599e6ddb9e6be0d1a09d9c6b433d84912779`. V00: accepted.

## Матрица этапов

- **V01** — актуальный дубль, точная ревизия, изоляция запросов.
- **V02** — ThoughtState.
- **V03** — четыре действия агента и решение о готовности.
- **V04** — портрет и персонализация вопросов.
- **V05** — UI перехода к записи и роль сценария.
- **V06** — разбор следующего дубля и завершение.
- **V07** — библиотека приёмов и полный цикл.

## A. Статусы и состояние мысли

**Есть:** `Reel.status` + `normalizeReelStatus` в `src/types/reel.ts`. Внутренние значения: `idea`, `in_progress`, `ready_to_record`, `completed`, `archived`. Aliases: `draft` → `idea`, `active` → `in_progress`. Default колонки Prisma: `"draft"`.

Пользовательские группы: «Не завершена», «В работе», «Успешно завершена». `ready_to_record` схлопывается в «В работе». `archived` не стадия основного цикла.

**Нет:** модели `ThoughtState`, reducer.

**Решение:** ThoughtState на **V02**. Статусы карточки не подменять действиями агента. V00 схему не меняет.

## B. Рабочий дубль vs итоговый

**Есть:** `selectedTakeId`, `finalTakeId`. Завершение требует оба итога (`thoughtCompletionGate` в `src/lib/thought-completion.ts`). `backfillFinalTakeIds` — служебная функция.

**Нет:** `workingTakeId`. Нет handler `suggest_take`.

**Решение:** актуальный / рабочий дубль и точная ревизия — **V01**. `finalTakeId` назначает только пользователь. Предложение записи — действие `suggest_take` на **V03**, UI — **V05**.

## C. Контекст диалога: `take: 2`

В `buildThoughtMaterialContext` (`dialogue.ts`): `takes: { orderBy: { number: "asc" }, take: 2 }`, затем `selectedTakeId` или `takes[0]`. Текст — `selectedId` из `listTranscriptBundle`.

Третий и далее дубли не в выборке. Выбранный дубль вне первых двух по `number` может дать чужой или пустой материал.

**Решение:** **V01** — читать рабочий дубль и точную ревизию по id, не обрезать список до двух.

## D. Inflight и идемпотентность

На `f971a7f`:

- диалог: `dialogue:${reelId}:${key}`
- профиль: `profile-dialogue:${key}`
- `ownerUserId` в ключ не входит
- совпадение ключа → общий Promise
- `AiInflightError` (409) объявлен, функцией не бросается
- 409 по версии состояния нет

**Целевой контракт (V01):** ключ = `ownerUserId` + object type + object id + operation type + `idempotencyKey`. Разные пользователи и разные объекты не делят Promise. Повтор одной операции дедуплицируется и не делает второй вызов модели. Конфликт разных версий состояния → 409.

Дневной бюджет `assertDailyTokenBudget` без `ownerUserId` в агрегате.

## E. Действия агента и сценарий

Сейчас: `reply` + `scriptProposal`, `requestScriptHelp`, отдельный `ai/script.ts`.

**Решение:** четыре действия и готовность — **V03**. Роль сценария и UI записи — **V05**. Не второй чат. `content_sufficient` только после обработанного дубля; достаточный исходник → `suggest_take`.

## F. Портрет

`confirmProfilePortrait` и `pending.readyToConfirm` живут в `profile-dialogue.ts`.

**Решение:** это работа **V04** текущего плана (не «вне цикла»). Пользователь смотрит портрет и продолжает разговор; прошлый портрет + новые ответы = новая ревизия без confirm и без ручных весов. Подробности мыслей в портрет не попадают.

## G. Завершение

На `f971a7f` нельзя завершить мысль без `finalTakeId` **и** `finalScriptId`.

**Политика (код только V06):** `finalTakeId` выбирает пользователь; `finalScriptId` не обязателен; итоговый текст = точная выбранная ревизия расшифровки этого дубля; не называть её сценарием; версии и черновики не затирать.

## H. Два пути Groq

Путь A: `complete.ts` + `AiCall`. Путь B: прямой `getGroq()` в `stt.ts` и `analyze.ts`.

**Решение:** V00/V01 не сливать транспорты «заодно».

## I. База и Auth

Auth принят. Landing принят. DB00-fix принят. Provider — только PostgreSQL. `ownerUserId` без `@default("local")`. Live migrate на Supabase не применялся.

**Решение:** V01 не начинать без принятого V00 и назначенного BASE. Временного общего пользователя не вводить.
