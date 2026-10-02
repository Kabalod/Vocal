# V06 — кандидат (не принят)

Статус: **исправления по замечаниям, на повторную сверку**. Продукт V06 **не принят**.
V06_BASE_SHA: `f741eb8d9e6c5881afcdd43d3f4cff9a8ccbd2fd`.
Опоры (не перепроверять): продукт V04 `e8985243e85c73d181083428f80c8445fed29756`; продукт V05 `5fa13657b38996ba8f3a416a22fb03b7647843b9`.
План: [`V06_PLAN.md`](./V06_PLAN.md). Контракт: [`CONTRACT.md`](./CONTRACT.md).
Полный `test:postgres` в этой итерации **не** гонялся.

## Замечания → исправление → тест → факт

### 1. Автоперевод рабочего дубля ждал предшественника и проигрывал CAS

**Замечание.** T2 и T3, созданные при working=T1, оба ждали T1. Готовность T2 ставила working=T2, после чего T3 проигрывал CAS. Нужен порядок дублей, не порядок STT; ручной PATCH (включая тот же указатель) побеждает; повторы и completed не переключают; согласованный FOR UPDATE; отказать PATCH не должен отменять автоматику.

**Исправление.** Журнал `v06_auto_work`: T3 может сменить working, если текущий указатель — автоматически продвинутый дубль с меньшим `number`. Ручной PATCH после успешного `updateMany` помечает queued как `error` (`working_take_manual`). Lock: `FOR UPDATE` Reel, затем pointer/CAS через `tx`. Отказавший PATCH не вызывает supersede.

**Тест.** `tests/v06-loop.test.ts`: T2 затем T3 → working=T3; T3 затем T2 → остаётся T3; барьер auto до lock → PATCH того же working → auto не переводит; отказ PATCH оставляет queued, STT переводит.

**Факт.** 26/26 адресных postgres, включая оба порядка готовности и барьер «auto до lock → PATCH того же указателя».

### 2. Заморозка итогового текста не была атомарной

**Замечание.** Completion, смена `finalTakeId`, выбор/создание ревизии и `bodyText` расходились. Частичный `bodyText` при отклонённом выборе. Глобальный prisma внутри tx.

**Исправление.** Один `FOR UPDATE` Reel + перечитывание через `tx` для complete/finalTake/revision write. `createEditedRevision` / `selectTranscriptRevision` пишут выбранную ревизию и `bodyText` в той же tx. `updateTake` больше не пишет `bodyText` до ревизии. Проверка completed — в tx, без prisma для проверяемых данных.

**Тест.** Барьер: правка ждала lock → completion выиграл → `NEED_REOPEN`, ревизия и текст прежние. Обратно: правка выиграла → completion завершает выбранную edit.

**Факт.** Барьерные тесты freeze в `v06-loop` прошли: NEED_REOPEN без смены ревизии/`bodyText`; обратный порядок завершает edit.

### 3. `applyThoughtMediaFromTranscript` безусловно выбирал original

**Замечание.** Повтор обработки затирал edit; completed final менял выбранную ревизию.

**Исправление.** Условный `selectOriginalIfUnsetInTx` после lock: keep / frozen / select. Автоперевод — `promoteWorkingTakeInTx` в той же tx.

**Тест.** edit сохраняется при повторном apply; completed final+edit неизменен; первая original выбирается (на completed указатель не прыгает).

**Факт.** Три сценария apply в `v06-loop` прошли; thought-media-create/cleanup без регрессии.

### 4. Источник итогового текста нестрогий

**Замечание.** Экспорт/превью подставляли `bodyText`, первую original или сценарий.

**Исправление.** Завершённая мысль: только `finalTakeId` → `selectedTranscriptId` → ревизия той же Take с непустым text. Иначе отказ экспорта и «Итоговый текст недоступен» в превью. `CompletionSummary` не считает fallback `bodyText`. Явный `scriptId` — отдельный экспорт сценария без смешения.

**Тест.** Экспорт/превью с выбранной ревизией; отказ и пустое превью без выбранной ревизии при наличии bodyText/сценария; `r7-export` явный scriptId vs пустой default.

**Факт.** Строгий экспорт/превью и r7 (явный scriptId vs отказ default без итога) прошли.

## Проверки этой итерации

- `npx tsc --noEmit` — ок
- адресные postgres (чистый env, `VOCAL_SKIP_PRISMA_GENERATE=1`): **26/26**
  - `tests/v06-loop.test.ts`
  - `tests/thought-completion.test.ts`
  - `tests/thought-media-create.test.ts`
  - `tests/thought-media-cleanup.test.ts`
  - `tests/r7-export.test.ts`
  - `tests/p01-5-archive-preview.test.ts`
- полный `test:postgres` — **не запускался** (сначала повторная сверка замечаний)

## Ограничения

Job-analyze, ремонт загрузки, legacy Review, I01, мост памяти, probe, SQL recreate, live-схема, платные модели, V07 — вне объёма. V06 самостоятельно не принимать.
