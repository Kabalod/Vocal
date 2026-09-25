# V02 — решения

V02_BASE_SHA: `4223599e6ddb9e6be0d1a09d9c6b433d84912779`.
V01_HEAD остаётся `d34e8dee2243ae109f2e535a439784117cef3aff`.
V02: **in progress**. Live migrate на Supabase не применять.

## Источник правды

**Решение:** состояние мысли живёт в `ThoughtState`, не в статусе карточки и не в глобальном портрете. Сообщения, исходники и версии текста reducer не заменяет.

## Рабочий дубль

`Reel.workingTakeId` остаётся указателем V01. `ThoughtState.workingTakeId` зеркалится при создании и смене указателя и не может ссылаться на чужую мысль (составной FK в SQL).

## Версия

`revision` растёт на каждый apply и на смену рабочего дубля. Несовпадение `expectedRevision` → 409, запись не применяется.

## Prisma vs SQL

В `schema.prisma` связь `workingTakeId → Take.id` простая, как у Reel: составной relation ломает `cuid()` на `Take`. Инвариант «тот же reel» — только миграция 6.
