# V04-00 — аудит портрета

Status: документы V04-00. **V04-01 принят** (`4411b22c716d44a92a8d7d762c64d1f22184f0e1`). **V04-02 принят** (`bc413e0df0e09348256319f10af884f8ef6727b4`). **V04-03 принят** (`5dfa595cc08f938bb9859aca3b1b3a585c6ba565`). **V04-04 принят** (`c0d8523e41455fef0281b6e8f62f44ae22cd3a58`). **V04-05 принят** (`3fda3de1d5630f97fe83e46ae5b73c0ad5ce09e0`). **V04-06 принят** (`119ee44`). `PUT /api/profile` / `saveProfile` закрыты (410). Продукт V04 **не принят**. Общий маршрут: [`../ROADMAP.md`](../ROADMAP.md).
V04_BASE_SHA: `564c9cf8534392501e125dda7ecc747c235a5c0d`.
V03_HEAD: `b5278f468666330bc30bb6cd9378f2f02f858264` (accepted).
Ветка: `fix/c00-live-action-shape`.
Код продукта на ветке: `e405b00e4542f47b565f0b2ea19477d249beb858` (до документов итоговой сверки).

Live Supabase не менялся. Миграция `10_v04_profile_session` есть в репо, на live не применена. V05 и I01 не начаты.

## Аудит текущей реализации

На BASE каждый удачный ход профиля создаёт `ProfileRevision` с полным `payloadJson` (fields, pending, portrait). `confirmProfilePortrait` публикует `completed`. `healStoredPortrait` переигрывает старые `AiCall.responseText` как patch. Журнала events нет. `resultJson` — сырой разбор модели, не принятое основание. Конкурентные apply — retry по `currentRevisionId`, без пересчёта порогов V04. `pending.readyToConfirm` ждёт кнопку.

Целевой V04 этому не равен: ревизия только снимок среза (`fields`, `portrait`, `v04Slice`); сессия — `CreatorProfile.sessionJson`; журнал только в `AiCall` events `v04-event-1`; старые вызовы не replay; pending не автопубликовать.

## Расхождения

| Сейчас (BASE) | Цель V04 |
|---|---|
| Ревизия на ход + mutate через новую строку с тем же смыслом журнала | Ревизия только при смене отображаемого среза; старый payload не UPDATE |
| Нет event / schemaVersion | `resultJson.event` отделён от сырого ответа |
| Replay любых done AiCall | Только `v04-event-1` |
| Плоский JSON модели | Discriminated union `apply_update` \| `no_change` \| `thought_specific` |
| Уникальность id слабо / по роли | Один id на `(category, value)` навсегда |
| Выбор value при двух слотах неформален | Макс. вес; ничья → текущий; иначе лексикографический `value` |
| Confirm / pending | Не публиковать pending; confirm снят в продукте |
| `saveProfile` / `usage` | `PUT` и `saveProfile` — 410; веса только из журнала |
| Сессия в payload ревизии | `CreatorProfile.sessionJson`; пустой `{}` читает legacy из ревизии и переносит её атомарно при первой смене среза |
| Технические enum в тексте подачи | В срезе/журнале enum; в портрете и runtime — русские формулировки |

## План продуктовых коммитов (не V04-00)

Не начинать V05, пока продукт V04 не принят.

1. **V04-01 (принят, `4411b22c716d44a92a8d7d762c64d1f22184f0e1`):** union + отказ лишних полей + проверки источников/уникальности. Модуль `src/lib/v04-action.ts`.
2. **V04-02 (принят, `bc413e0df0e09348256319f10af884f8ef6727b4`):** event в `resultJson`, атомарный commit, принадлежность хода. Confirm не снят.
3. **V04-03 (принят, `5dfa595cc08f938bb9859aca3b1b3a585c6ba565`):** пересчёт веса из events; гистерезис 3/1; выбор отображаемого слота; ревизия только при смене среза; фактический `applyResult` в той же транзакции.
4. **V04-04 (принят, `c0d8523e41455fef0281b6e8f62f44ae22cd3a58`):** не replay старых AiCall; не публиковать pending.
5. **V04-05 (принят, `3fda3de1d5630f97fe83e46ae5b73c0ad5ce09e0`):** сериализация по профилю + повтор хода без второго event.
6. **V04-06 (принят, `119ee44`):** снять confirm из API/UI; промпт — V04 union; новые ходы не пишут legacy `readyToConfirm`.
7. **PUT / `saveProfile`:** 410 `SAVE_PROFILE_REMOVED`; тело не читается; поля портрета не пишутся. `persistProfilePayload` — сиды тестов; start/skip/supplement — `persistProfileSession`.
8. **Стык отображения и служебных persist:** производные из `v04Slice` в fields/portrait/runtime русским текстом; служебные действия не создают ревизию без смены среза, не UPDATE payload, не затирают concurrent `apply_update`.
9. **Сессия вне ревизии:** колонка `sessionJson` (миграция 10 в репо); legacy-сессия материализуется в той же транзакции, что первая смена среза.

## Итоговая проверка продукта

Продукт самостоятельно не объявлять принятым. Кандидат отправляется на внешнюю приёмку.

- Код продукта (сессия, отображение, legacy-перенос): `e405b00e4542f47b565f0b2ea19477d249beb858`
- Итоговый кандидат: коммит сверки документов на `fix/c00-live-action-shape` поверх этого SHA (полный SHA — в git HEAD после коммита)
- `npx tsc --noEmit`: успешно, 4093 ms
- полный `test:postgres`: **219/219**, fail 0, skipped 0; `postgres_ms=545285` (~9 мин 5 с, включая Docker); `tests_ms=534838`; `docker_ready_ms=2977`; `prisma_generate_ms=3164`; `prisma_db_execute_count=154`
- Предыдущие 210/210 (до отделения сессии) **не** заменяют этот прогон
- Сценарии [`V04_SCENARIOS.md`](./V04_SCENARIOS.md) 1–31: union/журнал/пороги/ревизии (1–26), PUT 410 (27), русские производные и runtime (28), служебная сессия без лишних ревизий (29), конкурентный skip/apply (30), legacy `sessionJson` при первой смене среза (31)
- Ограничения: live без колонки `sessionJson` до отдельного применения миграции 10; без портрета цикл V03 работает; мысль важнее портрета; портрет не `fact` и не источник сценария; `ai/script.ts` не расширяли; живая модель и xAI в этой проверке не вызывались; V05 и I01 не начаты
- Миграция `10_v04_profile_session`: репо — да; тестовая БД этого прогона — да (0…10); live Supabase — нет (0…9)

## Вне объёма

V05, V06, live migrate, I01, визуальный канон.
