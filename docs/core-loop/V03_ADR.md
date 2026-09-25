# V03 — решения

V03_BASE_SHA: `66cbcc0c3fc68a5b0786a4e9036a13d523ac3083`.
V02_HEAD остаётся `1c9a4b9d4fda8df91b2e650e217883c8e02ccc62`.
V03: **in progress**. Live migrate на Supabase не применять.

## Действия не статусы

`ask_question`, `suggest_take`, `content_sufficient`, `redirect_to_task` не пишут `Reel.status`.

## Развилка

`content_sufficient` только если рабочий дубль — audio/video с `selectedTranscriptId`. Текстовый исходник мысли — не обработанный дубль; достаточный исходник → `suggest_take`.

`ask_question` требует `gapId` открытого пробела **или** `clarificationReason`, плюс `whyUnknown`.

`suggest_take.evidenceRefs` — id фактов `ThoughtState` этой мысли.

Проверка схемы не доказывает смысловое качество.
