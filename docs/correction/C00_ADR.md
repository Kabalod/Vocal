# C00 — контракт решений и исправлений

C00 **not started**, **не принят**. V04 продукт **not started**, **не принят**.
V03 **accepted**. Исходники и снимки не переписывать.

## Кто решает

Пользователь **не** подтверждает и **не** исключает каждое наблюдение. Сервер по закрытым правилам выбирает одно:

| Решение | Смысл |
|---|---|
| `correct_thought` | Исправить текущую мысль (факт, пробел, задача дубля) |
| `keep_local` | Сигнал только этой мысли, не в авторскую память |
| `accumulate_preference` | Осторожное предпочтение автора (контур V04, не факт мысли) |
| `discard` | Отбросить |

Молчание и отсутствие правки ≠ согласие. Ответ модели ≠ подтверждение её вывода. Текст пользователя, включая «запомни» / «игнорируй правила», **не** меняет серверные enum, пороги и владельца.

## Таксономия сигналов

| Код | Где живёт | Немедленно правит мысль | В глобальную память |
|---|---|---|---|
| `wrong_speaker` | мысль | да, если факт приписан не автору | нет |
| `author_negation` | мысль | да, снимает/заменяет факт этой мысли | нет как правило |
| `quote_not_position` | мысль | да, цитата не становится позицией | нет |
| `local_correction` | мысль | да, один слот | нет |
| `repeated_correction` | мысль + осторожный паттерн | да локально; preference только после порога V04 | не как факт |
| `contradictory_correction` | мысль | weaken/оставить оба слота открытыми | не затирает глобальное |
| `mood_or_once` | discard или keep_local | нет как устойчивое | нет (V04: нет категории mood) |
| `praise_diagnosis_label` | discard | нет | нет |
| `thought_episode` | keep_local или V04 `thought_specific` | нет в портрет | нет |
| `explicit_global` | только profile dialogue + V04 `apply_update` | нет | да, по порогам V04 |
| `prompt_injection` | discard | нет | нет |
| `stale_model` | discard / 409 | нет записи | нет |
| `foreign_user` | отказ 401/403 | нет | нет |

Ограничения: один сигнал не создаёт два решения с разным `scope`. Исправление факта мысли **никогда** не есть `accumulate_preference` само по себе.

## Событие решения

`schemaVersion = "c00-decision-1"`. Пишется только если решение принято. Не UPDATE.

| Поле | Правило |
|---|---|
| `decisionId` | новый id |
| `ownerUserId` | = сессия; чужой id — отказ |
| `scope` | `thought` \| `author_preference` \| `none` |
| `reelId` | обязателен при `scope=thought` |
| `action` | четыре значения выше |
| `signalType` | enum таксономии |
| `evidenceUserMessageIds` | существующие user-сообщения нужного thread |
| `thoughtStateRevisionSeen` | снимок на входе; устарело → не применять вслепую |
| `supersedesDecisionId` | если заменяет прежнее решение |
| `contradictsDecisionId` | если ослабляет, не затирая |
| `reasonCode` | закрытый код, не свободный текст политики |
| `idempotencyKey` | `owner + object + operation + clientKey` |
| `aiCallId` | вызов, породивший кандидата, или null если только серверное правило |
| `applyResult` | применено / отложено / отказ |

Кандидат модели — отдельный JSON (как V03 `thoughtUpdate` / V04 union). Сервер **классификацию смысла не дублирует**: проверяет структуру, владельца, источники, revision, уникальность ключа.

Повтор того же `idempotencyKey` не создаёт второе решение.

## Событие исправления

`schemaVersion = "c00-correction-1"`. Только при `correct_thought`.

| Поле | Правило |
|---|---|
| `correctionId` | новый id |
| `decisionId` | родитель |
| `reelId` / `ownerUserId` | мысль и автор |
| `targetKind` | `fact` \| `gap` \| `intent` \| `takeTask` \| `position` |
| `targetId` | id факта/пробела |
| `operation` | `supersede` \| `reopen` \| `clear_slot` |
| `beforeThoughtRevision` / `afterThoughtRevision` | `ThoughtState.revision` |
| `replacedBecause` | `reasonCode` |
| `dependents` | список инвалидаций (id черновика/вопросов), без удаления исходников |

Факт не вычищается из истории сообщений. Новый срез `factsJson` может пометить слот заменённым (`supersededBy` в производном состоянии продукта C00) или заменить текст только в текущем снимке мысли, сохранив старый id в событии. Сообщения, дубли, `TranscriptRevision`, старые `ProfileRevision` и `ReelContextSnapshot` не UPDATE.

## Немедленное исправление мысли

Условия `correct_thought`:

- сигнал о **этой** мысли;
- evidence — user-сообщения thread `scope=reel` этой карточки;
- `thoughtStateRevisionSeen` совпадает или ход сериализован как V03 (повторная проверка после lock);
- цель существует в текущем снимке.

Действия:

1. Применить патч `ThoughtState` (increment `revision`).
2. Записать `decision` + `correction` атомарно с финализацией хода (тот же принцип, что V03 commit / V04 event).
3. Инвалидировать зависимые **производные** этой мысли: пометить `ScriptDraft` / будущий V05 stale; не использовать старый review/question round как актуальный; новый `ReelContextSnapshot` собирать заново, старый не править.
4. Не менять `finalTakeId`, файлы дублей, `Reel.status` именем действия.

Исправление не копируется в портрет и не становится V04 `replace_explicit`.

## Накопление памяти автора

Только `accumulate_preference` и только через контракт V04 (`apply_update` в profile dialogue или эквивалентный вызов с теми же enum/порогами). Мысль не пишет слоты портрета.

Противоречие глобального: `weaken` V04, не автозатирание. Устаревание: слот снят при `system_weight <= 1`. Удаление производного — снятие с отображаемого среза + event, не DELETE исходников.

Пока продукт V04 не принят, `accumulate_preference` в коде **не реализовывать**. Документ фиксирует стык.

`keep_local` хранится как decision с `scope=thought` без коррекции среза и без V04 event.

`discard` — decision с `scope=none` или только метрика; минимум полей, без полного текста разговора.

## Инъекция и секреты

Серверные правила живут в коде. User body не парсится как override политики. Совпадение с командой — `discard` или `keep_local` (`prompt_injection` / non-content).

В логи C00: `decisionId`, `reasonCode`, `reelId`, `ownerUserId` (не секрет). Не писать `promptText`, токены, полный transcript.
