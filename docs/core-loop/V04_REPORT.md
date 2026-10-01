# V04-00 — аудит портрета

Status: документы V04-00. **V04-01 принят** (`4411b22c716d44a92a8d7d762c64d1f22184f0e1`). **V04-02 принят** (`bc413e0df0e09348256319f10af884f8ef6727b4`). **V04-03 принят** (`5dfa595cc08f938bb9859aca3b1b3a585c6ba565`). **V04-04 принят** (`c0d8523e41455fef0281b6e8f62f44ae22cd3a58`). **V04-05 принят** (`3fda3de1d5630f97fe83e46ae5b73c0ad5ce09e0`). **V04-06 принят** (`119ee44`). `PUT /api/profile` / `saveProfile` закрыты (410). Продукт V04 **не принят**. Общий маршрут: [`../ROADMAP.md`](../ROADMAP.md).
V04_BASE_SHA: `564c9cf8534392501e125dda7ecc747c235a5c0d`.
V03_HEAD: `b5278f468666330bc30bb6cd9378f2f02f858264` (accepted).
Ветка: `feat/v04-from-base`.
Код аудита: дерево BASE.

Live Supabase не менялся. Prisma не трогали. V04-06 снимает confirm и переводит промпт профиля на union.

## Аудит текущей реализации

На BASE каждый удачный ход профиля создаёт `ProfileRevision` с полным `payloadJson` (fields, pending, portrait). `confirmProfilePortrait` публикует `completed`. `healStoredPortrait` переигрывает старые `AiCall.responseText` как patch. Журнала events нет. `resultJson` — сырой разбор модели, не принятое основание. Конкурентные apply — retry по `currentRevisionId`, без пересчёта порогов V04. `pending.readyToConfirm` ждёт кнопку.

Целевой V04 этому не равен: ревизия только снимок среза; журнал только в `AiCall` events `v04-event-1`; старые вызовы не replay; pending не автопубликовать.

## Расхождения

| Сейчас | Цель V04 |
|---|---|
| Ревизия на ход + mutate через новую строку с тем же смыслом журнала | Ревизия только при смене отображаемого среза; старый payload не UPDATE |
| Нет event / schemaVersion | `resultJson.event` отделён от сырого ответа |
| Replay любых done AiCall | Только `v04-event-1` |
| Плоский JSON модели | Discriminated union `apply_update` \| `no_change` \| `thought_specific` |
| Уникальность id слабо / по роли | Один id на `(category, value)` навсегда |
| Выбор value при двух слотах неформален | Макс. вес; ничья → текущий; иначе лексикографический `value` |
| Confirm / pending | Не публиковать pending; confirm снять в продукте |
| `saveProfile` / `usage` | `PUT` и `saveProfile` — 410; веса только из журнала |

## План продуктовых коммитов (не V04-00)

Не начинать V05, пока продукт V04 не принят. Без Prisma.

1. **V04-01 (принят, `4411b22c716d44a92a8d7d762c64d1f22184f0e1`):** union + отказ лишних полей + проверки источников/уникальности. Модуль `src/lib/v04-action.ts`.
2. **V04-02 (принят, `bc413e0df0e09348256319f10af884f8ef6727b4`):** event в `resultJson`, атомарный commit, принадлежность хода. Confirm не снят.
3. **V04-03 (принят, `5dfa595cc08f938bb9859aca3b1b3a585c6ba565`):** пересчёт веса из events; гистерезис 3/1; выбор отображаемого слота; ревизия только при смене среза; фактический `applyResult` в той же транзакции.
4. **V04-04 (принят, `c0d8523e41455fef0281b6e8f62f44ae22cd3a58`):** не replay старых AiCall; не публиковать pending.
5. **V04-05 (принят, `3fda3de1d5630f97fe83e46ae5b73c0ad5ce09e0`):** сериализация по профилю + повтор хода без второго event.
6. **V04-06 (принят, `119ee44`):** снять confirm из API/UI; промпт — V04 union; новые ходы не пишут legacy `readyToConfirm`.
7. **PUT / `saveProfile`:** 410 `SAVE_PROFILE_REMOVED`; тело не читается; поля портрета не пишутся. `persistProfilePayload` — сиды тестов; start/skip/supplement — `persistProfileSession`.
8. **Стык отображения и служебных persist:** производные из `v04Slice` в fields/portrait/runtime; служебные действия не создают ревизию без смены среза и не затирают concurrent `apply_update`.

После этого пункта: полный `test:postgres`, затем отдельная приёмка продукта V04. V05 и I01 не начинать.

## Вне объёма

V05, V06, live migrate, I01, визуальный канон.
