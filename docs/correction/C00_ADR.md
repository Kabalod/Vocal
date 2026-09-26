# C00 — контракт решений и исправлений

C00 **not started**, **не принят**. V04 продукт **not started**, **не принят**.
V03 **accepted**. Исходники и снимки не переписывать.

## Граница с V04

Исправления и сигналы из **thought dialogue** остаются в области **этой мысли** (`scope=thought` или отброс).

C00 **не** переносит такие исправления в авторский портрет: нет `accumulate_preference`, нет `apply_update`, нет записи в `CreatorProfile` / `ProfileRevision` / V04 events из хода мысли.

Перенос «локальная правка → глобальный портрет» потребует **отдельного** изменения контракта V04 (источники только из profile dialogue, проверки id, enum, пороги) и отдельной приёмки. Это не этап C00 и не скрытый V04-01.

Явные общие сведения автор по-прежнему может сказать в **profile dialogue** — это контракт V04-00, не C00.

## Кто решает

Пользователь не подтверждает и не исключает каждое наблюдение. Для хода мысли сервер выбирает одно:

| Решение | Смысл |
|---|---|
| `correct_thought` | Исправить текущую мысль |
| `keep_local` | Сигнал только этой мысли; срез можно не менять |
| `discard` | Отбросить |

Молчание ≠ согласие. Ответ модели ≠ подтверждение её вывода. Текст пользователя не меняет серверные правила.

## Таксономия сигналов (мысль)

| Код | Действие C00 | Портрет |
|---|---|---|
| `wrong_speaker` | `correct_thought` при факте не-автора | нет |
| `author_negation` | `correct_thought` слота этой мысли | нет |
| `quote_not_position` | не писать цитату как позицию | нет |
| `local_correction` | `correct_thought` одного слота | нет |
| `repeated_correction` | снова только эта мысль | нет, даже при повторах |
| `contradictory_correction` | новое decision + `contradictsDecisionId` | нет |
| `mood_or_once` | `discard` или `keep_local` | нет |
| `praise_diagnosis_label` | `discard` | нет |
| `thought_episode` | `keep_local` | нет |
| `prompt_injection` | `discard` | нет |
| `stale_model` | не применять / 409 | нет |
| `foreign_user` | 401/403 | нет |

Один сигнал — одно `decision`. `correct_thought` никогда не публикует портрет.

## Конверт в `AiCall.resultJson`

Один JSON-объект на **тот же** `AiCall`, что завершил ход мысли (V03 уже пишет в эту строку действие).

```json
{
  "schemaVersion": "c00-envelope-1",
  "aiCallId": "<AiCall.id>",
  "turnKey": "<AiCall.turnKey>",
  "ownerUserId": "<AiCall.ownerUserId>",
  "reelId": "<AiCall.reelId>",
  "action": { },
  "decision": null,
  "correction": null
}
```

Связь с `AiCall`:

- `aiCallId` / `turnKey` / `ownerUserId` / `reelId` совпадают с колонками строки. Расхождение — отказ записи.
- `responseText` — сырой ответ модели. Конверт **не** заменяет его и **не** дублирует полный промпт (`promptText` не копировать в конверт).
- `action` — то же действие V03, которое сейчас лежит в `resultJson` целиком (`working-take.ts`). Пока продукта C00 нет, формат не менять.
- `kind` вызова — диалог мысли, не `profile_dialogue`. Конверт C00 и event V04 (`v04-event-1`) **не смешивать** в одной строке.
- `decision` есть, если сервер принял одно из трёх решений. У `discard`/`keep_local` без правки среза `correction` = `null`.
- `correction` только вместе с `decision.action = correct_thought`.
- Строка без `schemaVersion = c00-envelope-1` — не журнал C00 (как старые AiCall не replay V04).

`decision` (минимум): `decisionId`, `action`, `signalType`, `scope` (`thought` \| `none`), `evidenceUserMessageIds`, `thoughtStateRevisionSeen`, `reasonCode`, `supersedesDecisionId?`, `contradictsDecisionId?`, `applyResult` (`applied` \| `not_applied`).

`correction` (минимум): `correctionId`, `decisionId`, `targetKind`, `targetId`, `operation` (`supersede` \| `reopen` \| `clear_slot`), `beforeThoughtRevision`, `afterThoughtRevision`, `replacedBecause`.

Журнал мысли = `AiCall` этой карточки со `status=done` и конвертом `c00-envelope-1`, порядок `createdAt` ASC, `id` ASC.

## Идемпотентность и конкурентные ходы

Ключ хода — существующий `AiCall.turnKey` (уникален). Один ход → не больше одного конверта и одного `decision`.

Повтор того же `turnKey`: вернуть уже записанный конверт. Второго `decisionId` нет.

Запись конверта — только владелец текущего exec-lease (`execOwnerId` + `execGeneration`), в одной транзакции с `status=done`, финалом processing и (если нужно) CAS `ThoughtState.revision`, как V03 `commitDialogueReply`.

Два разных ключа на одну мысль: сериализация через CAS `expectedRevision`. Проигравший не пишет конверт «поверх» и не применяет correction; 409 / повторная проверка после ожидания: заново читать `ThoughtState`, конверты `c00-envelope-1` и источники, затем применить или отказать.

Частичной записи нет: нет `done` без согласованного конверта; нет increment revision без `correction`; нет `correction` без `decision`.

## Stale без новых колонок

В схеме нет `stale` у `ScriptDraft` и нет статуса `stale` у `Question` (`open` \| `answered` \| `skipped` \| `not_relevant`). C00 **не** добавляет колонки и **не** пишет вымышленный status. Stale — **предикат чтения**.

### ScriptDraft

Не UPDATE `body` / `sourcesJson` ради пометки. Исторические `ScriptVersion` не затирать.

**Привязанный** черновик: есть `baseVersionId` → `ScriptVersion`, и у версии или породившего `AiCall` той же мысли (`reelId`, generate/script) в `inputSnapshotJson` есть `thoughtStateRevision` (и при наличии `workingTakeId`, `selectedTranscriptId`).  
`stale` ⇔ текущий `ThoughtState.revision` ≠ снимку **или** рабочий дубль / выбранная ревизия расшифровки не совпадают со снимком.

Связь version→AiCall проверяема: `AiCall.reelId` + `resultJson` с id версии (как сейчас `{ proposalId }`) или тот же `inputSnapshotJson`.

**Непривязанный** (ручной, снимка revision нет): `stale` ⇔ существует конверт C00 этой мысли с `correction` и `AiCall.createdAt` **строго позже** `ScriptDraft.updatedAt`. Одна правка мысли после последнего сохранения черновика делает его stale. Правка черновика пользователем (`saveToken` / `updatedAt`) не сбрасывает мысль.

`saveToken` — конфликт редакторов, не признак актуальности к `ThoughtState`.

### Вопросы

`Question.roundId` = `AiCall.id` раунда (`questions.ts`). `Review.transcriptRevisionId` задаёт расшифровку разбора.

`Question` со `status=open` **stale для UI/генерации** ⇔ у `AiCall` раунда в `inputSnapshotJson` есть `thoughtStateRevision` и она ≠ текущей **или** (если есть `reviewId`) `Review.transcriptRevisionId` ≠ `selectedTranscriptId` текущего рабочего дубля **или** после `Question.createdAt` есть C00 `correction` этой мысли.

Строку `Question` не UPDATE в `not_relevant` только из-за stale. Исходный текст вопроса остаётся историей.

`ReelContextSnapshot` не UPDATE; новый вызов собирает новый снимок.

## Немедленное исправление мысли

Evidence — user-сообщения thread `scope=reel` этой карточки. После lock revision перепроверяется.

1. Патч `ThoughtState` (+1 revision).
2. Конверт + `done` + processing в той же транзакции.
3. Зависимые производные **считаются** stale по предикатам выше. Не менять `finalTakeId`, медиа дублей, `Reel.status`.

## Инъекция и секреты

Политика только в коде. В логи: id и `reasonCode`, не `promptText` и не полный разговор.
