# V04-00 — аудит портрета

Status: документы V04-00. **V04-01 принят** (`4411b22c716d44a92a8d7d762c64d1f22184f0e1`). **V04-02 начат**. Продукт V04 **не принят**. Общий маршрут: [`../ROADMAP.md`](../ROADMAP.md).
V04_BASE_SHA: `564c9cf8534392501e125dda7ecc747c235a5c0d`.
V03_HEAD: `b5278f468666330bc30bb6cd9378f2f02f858264` (accepted).
Ветка: `feat/v04-from-base`.
Код аудита: дерево BASE.

Live Supabase не менялся. Prisma и миграции в V04-00–V04-02 не трогались. V04-02 пишет `resultJson` event атомарно с processing; confirm и пороги 3/1 ещё не этот этап.

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
| `saveProfile` / `usage` | Нет ручных весов |

## План продуктовых коммитов (не V04-00)

Не начинать пункты 3–6, пока V04-02 не принят отдельно. Без Prisma, без V05.

1. **V04-01 (принят, `4411b22c716d44a92a8d7d762c64d1f22184f0e1`):** union + отказ лишних полей + проверки источников/уникальности. Модуль `src/lib/v04-action.ts`.
2. **V04-02 (начат):** event в `resultJson`, атомарный commit с processing; без новой ревизии, если срез тот же. Проверки источников V04-01 вызываются на пути записи (`commitV04ProfileTurn`). Confirm не снят.
3. Пересчёт веса из events; гистерезис 3/1; выбор отображаемого слота; ревизия только при смене среза.
4. Не replay старых AiCall; не публиковать pending.
5. Сериализация по профилю + повтор хода без второго event.
6. Снять confirm из API/UI; стык промпта мысли.

После продуктового коммита: тесты профиля; `test:v03` если задет диалог мысли. `test:postgres` — перед внешней приёмкой V04.

## Вне объёма

V05, V06, live migrate, I01, визуальный канон.
