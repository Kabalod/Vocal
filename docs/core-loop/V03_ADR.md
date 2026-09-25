# V03 — решения

V03_BASE_SHA: `66cbcc0c3fc68a5b0786a4e9036a13d523ac3083`.
V03_HEAD: `b5278f468666330bc30bb6cd9378f2f02f858264`.
V02_HEAD остаётся `1c9a4b9d4fda8df91b2e650e217883c8e02ccc62`.
V03: **accepted**. V04: **not started**. BASE для V04: **not assigned**. Live migrate на Supabase не применять.

## Действия не статусы

`ask_question`, `suggest_take`, `content_sufficient`, `redirect_to_task` не пишут `Reel.status`.

## Развилка

`content_sufficient` только если рабочий дубль — audio/video с `selectedTranscriptId`. Текстовый исходник мысли — не обработанный дубль; достаточный исходник → `suggest_take`.

`ask_question` требует `gapId` открытого пробела **или** `clarificationReason`, плюс `whyUnknown`.

`suggest_take.evidenceRefs` — id фактов `ThoughtState` этой мысли.

`redirect_to_task` с фактом или `closeGapIds` отклоняется. `answeredGapId`, `closeGapIds[0]` и `pendingGapId` предыдущего вопроса должны совпадать; несколько `closeGapIds` запрещены. Короткие реплики «не знаю» / «повтори» / команды (нормализация + ограниченный набор шаблонов, не классификатор модели) не принимаются как факт и не закрывают gap. Произвольный смысл сервер не устанавливает: при сомнении gap остаётся открытым.

`AiCall.turnKey` уникален. Право вызвать модель — CAS-lease `execOwnerId` + `execLeaseUntil` + `execGeneration`: пишет `responseText` только владелец текущего поколения. Срок lease 30 с; ожидающий исполнитель опрашивает ответ или истечение. После истечения возможен второй внешний вызов: провайдер не идемпотентен, «ровно один HTTP к модели» не обещаем. Повтор с тем же ключом и другим текстом — `IDEMPOTENCY_CONFLICT`, ход не переиспользуется.

Проигрыш гонки `commitDialogueReply` не затирает уже `done` processing: перечитывается тройка хода, готовый результат возвращается, `error` пишется только в `updateMany` по незавершённому сообщению.

Снимок `AiCall` и CAS перед записью включают `thoughtStateRevision`. Схемы действий — `.strict()`.

Проверка схемы не доказывает смысловое качество.
