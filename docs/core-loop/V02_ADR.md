# V02 — решения

V02_BASE_SHA: `4223599e6ddb9e6be0d1a09d9c6b433d84912779`.
V01_HEAD остаётся `d34e8dee2243ae109f2e535a439784117cef3aff`.
V02: **accepted** на `V02_HEAD` `1c9a4b9d4fda8df91b2e650e217883c8e02ccc62`.
V03: **accepted** (`V03_HEAD` `b5278f468666330bc30bb6cd9378f2f02f858264`). V04: **not started**. BASE для V04 не назначен.
Live migrate на Supabase не применять.

## Источник правды

**Решение:** состояние мысли живёт в `ThoughtState`, не в статусе карточки и не в глобальном портрете. Сообщения, исходники и версии текста reducer не заменяет.

## Рабочий дубль

`Reel.workingTakeId` остаётся указателем V01. `ThoughtState.workingTakeId` зеркалится при создании и смене указателя и не может ссылаться на чужую мысль (составной FK в SQL).

## Версия

`revision` растёт на каждый apply и на смену рабочего дубля. Несовпадение `expectedRevision` → 409, запись не применяется.

## Факты и пробелы

Факт — объект `{ id, text, sourceType, sourceId }`. `sourceType`: `dialogue_message` | `transcript_revision` | `initial_note`. Reducer проверяет форму и что источник принадлежит этой мысли. Сообщение ассистента не источник автора.

Пробел — объект `{ id, text, status: open|resolved }` со стабильным id для ссылок V03.

## Владелец

`ThoughtState.ownerUserId` копируется из `Reel`. SQL-инвариант: `(reelId, ownerUserId) → Reel(id, ownerUserId)` в миграции 7. Чтение и apply идут через `reel.ownerUserId` сессии, не через одно только поле состояния.

## Prisma vs SQL

В `schema.prisma` связь `workingTakeId → Take.id` простая, как у Reel: составной relation ломает `cuid()` на `Take`. Инвариант «тот же reel» — миграция 6. Инвариант владельца — миграция 7.
