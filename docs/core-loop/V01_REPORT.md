# V01 — отчёт

Status: **accepted**.
V01_HEAD: `d34e8dee2243ae109f2e535a439784117cef3aff`.
BASE_SHA (старт V01): `34abcd78c70b2fa31bd717aeff56acc31577c0d1`.
AUDITED_APP_SHA: `f971a7fb43c2fdd9df6b1824620491500972736a`.
Первый коммит этапа: `d8e12c18be3f1b37b49d2d9edf38b0d1b37ce9bb`.

Live Supabase не менялся. V02: **accepted** (`V02_HEAD` `1c9a4b9d4fda8df91b2e650e217883c8e02ccc62`). V03: **not started**.

## Закрытые блокеры ревью `d8e12c1`

| Блокер | Как закрыт |
|---|---|
| Устаревший ответ после AI | Снимок в том же проходе, что промпт; CAS+запись в одной транзакции; 409 |
| Нет фиксации материала | Поля в `AiCall.inputSnapshotJson` |
| Неявный working take | Нет fallback; чтение по id |
| API не принимает указатель | `PATCH /api/reels/[id]` + `workingTakeId` |
| Индекс / FK | `@@index`; `3` — существование Take; `4` — составной FK той же мысли |
| Голова диалога при записи | `FOR UPDATE` на `DialogueThread`; триггер `headEpoch`; миграция 5 |
| Документы V01 | этот файл, ADR, FILE_MAP, SCENARIOS |
| Противоречия V00 | принятость V00 отделена от приёмки V01 |

## Ограничения

- GitHub status checks на ветке могут отсутствовать — это среда репозитория, не критерий логики V01.
- Клиент студии по-прежнему может не слать `expectedUpdatedAt`; сервер всё равно сверяет снимок после модели.
- UI переключателя рабочего дубля — не V01 (V05). API для него готов.

## Проверки агента

Полный `npm run test:postgres` после миграции 5 (`headEpoch` + `FOR UPDATE` на `DialogueThread`): **102/102**, fail 0. Отдельно `tests/v01-working-take.test.ts`: **15/15** (вставка после последней проверки ждёт lock). `tsc --noEmit` ок. Принят пользователем на `V01_HEAD`. GitHub status checks на ветке нет.
