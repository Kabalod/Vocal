# S2 — контракт удаления данных

Решения владельца (`S0_DECISIONS.md`): вариант A (файлы на диске сервера), удаление сразу без периода восстановления, `AiCall` обезличивается, а не удаляется. Реализация: `src/lib/data-deletion.ts`, маршруты `DELETE /api/reels/:id`, `DELETE /api/takes/:id`, `DELETE /api/account`.

## Граф зависимостей (все связи Restrict) и порядок удаления мысли

Одна транзакция, блокировки в порядке публикации медиа: **Job (FOR UPDATE) → Reel → ThoughtState**. Строки Job и Take перечитываются под блокировкой.

1. Tombstone ключа создания: строка `AiCall` `kind = deleted_thought_key`, `turnKey = tck:<ключ>` (без текста). Повтор `POST /api/thoughts` и `/api/thoughts/media` с этим ключом → `410 THOUGHT_DELETED`, а не новая мысль.
2. `AiCall` по `reelId`: незавершённые → `error`; затем стираются `promptText`, `inputSnapshotJson`, `responseText`, `resultJson`, `errorMessage`, ссылки (`reelId`, `takeId`, …), сбрасывается lease и растёт `execGeneration` (запоздавший писатель получает `TURN_FENCE`). **Остаются** `kind`, `model`, `status`, токены, `ownerUserId`, `createdAt`, `turnKey`: суточный бюджет нельзя обнулить удалением.
3. `DialogueMessage` → `DialogueThread` (мысли).
4. `Answer` → `Question` → `Review` → `CompareResult`.
5. `Reel.workingTakeId = null` (составной FK на `Take`), `ThoughtState`.
6. `TranscriptRevision`, `Job` (`AnalysisResult` каскадом), `Take`.
7. `ScriptDraft`, `ScriptVersion`, `ReelContextSnapshot`, `ThoughtCreateKey`, `Reel`.

Файлы (после коммита): `Take.storedPath`, `Job.videoPath`, `Job.audioPath`, `storage/audio/<jobId>.mp3`; только внутри `storage/videos|audio`. Сбой `unlink` не теряет файл: `sweepOrphanMedia()` без состояния удаляет файлы без ссылок из БД старше 1 часа (старт сервера и каждые 6 часов). Так же убирается файл, который запоздавший воркер записал после удаления.

## Удаление дубля

Правила V06: **нельзя** удалить единственный дубль (`409 LAST_TAKE`), рабочий (`409 WORKING_TAKE`) и итоговый (`409 FINAL_TAKE`) — сначала выбрать другой. Иначе: `AiCall` по `takeId` обезличить, `Answer`/`Question`/`Review` этого дубля, `CompareResult` с ним, `TranscriptRevision`, `Job`, `Take`; `selectedTakeId` обнуляется. Номера дублей не пересчитываются.

## Удаление аккаунта

Подтверждение: тело `{"confirm":"УДАЛИТЬ"}`. До удаления проверяется, что сервер умеет удалить вход (`SUPABASE_SERVICE_ROLE_KEY`), иначе `503` и данные не тронуты. Затем: все мысли владельца (как выше), «брошенные» `Job`, портрет (`DialogueThread/Message`, `ProfileRevision`, `CreatorProfile`), оставшиеся `AiCall` теряют текст и получают обезличенный `ownerUserId` (`deleted:<хэш>`), объекты бакета `vocal-private/<userId>/`, `public.profiles`, `auth.users` через service role на сервере. Ключ service role в клиент и логи не попадает (модуль `src/lib/supabase/service.ts` только серверный). Если последний шаг упал, запрос безопасно повторяется.

## Конкуренция

- **Активный Job:** удаление выигрывает. Публикация воркера требует `Job FOR UPDATE` + `leaseOwner`; строки Job уже нет → воркер молча теряет lease, результат не пишется; его файлы собирает sweeper.
- **Идущий ход диалога / генерация сценария:** запись ответа блокируется fence (`execGeneration`) и отсутствием мысли; ответ не сохраняется.
- **Повтор ключей:** ключ создания — tombstone; ключи сообщений и дублей жили внутри удалённой мысли (её id → 404); голосовые ключи (`stt:…`) хранились в обезличенных строках `AiCall`.

## Не покрыто

- Факты в `ThoughtState` других мыслей не ссылаются на удаляемые строки; в удалённой мысли они уходят вместе с ней.
- Резервные копии БД и тома (S4): удалённые данные остаются в них до ротации; срок хранения копий нужно задать в runbook.
