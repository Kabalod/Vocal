# V04 — контракт

V04_BASE_SHA: `564c9cf8534392501e125dda7ecc747c235a5c0d`.
V03_HEAD: `b5278f468666330bc30bb6cd9378f2f02f858264`.
V03: **accepted**. V04-01: **принят** (`4411b22c716d44a92a8d7d762c64d1f22184f0e1`). V04-02: **принят** (`bc413e0df0e09348256319f10af884f8ef6727b4`). V04-03: **принят** (`5dfa595cc08f938bb9859aca3b1b3a585c6ba565`). V04-04: **начат**. V04 принят: нет.
V04-00 — документы. Prisma, миграции и live Supabase не менять. V05 не начинать. Общий маршрут: [`../ROADMAP.md`](../ROADMAP.md). Thought-исправления C00 не являются источниками этого контракта. Пороги `support − oppose` (3/1) считаются только по `profile_dialogue` и не закрывают остаток I04 / мост по разным мыслям.

## Граница ответственности

1. Модель классифицирует смысл и возвращает **один** вариант строгого discriminated union.
2. Сервер не анализирует произвольный текст `value`. Он проверяет структуру, enum, источники, уникальность id, совместимость переходов и детерминированные пороги.
3. Похвала, диагноз, настроение и деталь мысли не попадают в портрет, потому что для них нет категории в enum: модель обязана вернуть `no_change` или `thought_specific`. Сервер не ищет эти смыслы в строке `value`.

## Ответ модели (discriminated union)

Дискриминатор `kind`. Лишние поля — отказ (`.strict()`). Поля чужого варианта — отказ.

### `apply_update`

Полный кандидат. Обязательно: `category`, `value`, `scope=global`, `evidenceType`, `evidenceMessageIds`, `confidence`, `operation`.

`operation`: `replace_explicit` | `add_observation` | `strengthen` | `weaken`.

`confidence` — конечное число, **[0, 1]**.

### `no_change`

Обязательно: `reasonCode` из enum ниже. **Нет** `category`, `value`, `evidenceMessageIds`, `operation` обновления. События основания нет. Журнал, вес и `ProfileRevision` не меняются.

`reasonCode`: `insufficient_signal` | `already_known` | `refusal` | `praise_or_support` | `diagnosis_or_label` | `mood` | `invented_event` | `off_topic`.

### `thought_specific`

Обязательно: `reasonCode`. Необязательно: `auditUserMessageId` (сообщение пользователя profile dialogue, только аудит). Если поле указано — те же проверки источника, что у `evidenceMessageIds`: существование, роль `user`, владелец, профильный thread. **Нет** фиктивной категории глобального портрета. Журнал и `ProfileRevision` не меняются.

`reasonCode`: `thought_detail` | `thought_dialogue` | `reel_episode`.

## Закрытые enum категорий

Прямые: `blog_goal` | `general_audience` | `standing_topic` | `explicit_boundary`.

`value` прямой категории — непустая строка после `trim`, 1…4000. Равенство отображаемого: `trim` + NFC.

Производные:

| `category` | `value` |
|---|---|
| `explanation_style` | `stepwise` \| `analogy` \| `contrast` |
| `concreteness` | `high` \| `low` |
| `lead_style` | `example_first` \| `conclusion_first` |
| `preferred_question_form` | `open` \| `closed` \| `short_choice` |

«Тип автора» — не поле, а набор допущенных производных слотов.

`evidenceType`: `explicit_statement` | `behavioral_observation`.

## Совместимость `apply_update`

| operation | category | evidenceType | Мин. новых id |
|---|---|---|---|
| `replace_explicit` | прямая | `explicit_statement` | 1 |
| `add_observation` | производная | `behavioral_observation` | 1; слот может быть новым |
| `strengthen` | производная | `behavioral_observation` | 1; слот уже есть |
| `weaken` | производная | `behavioral_observation` | 1; слот уже есть |

Иная комбинация — отказ.

## Хранение

`ProfileRevision` — неизменяемый снимок **только отображаемого** портрета. Уже созданный `payloadJson` не обновлять. Не создавать ревизию ради журнала или смены внутреннего веса.

Журнал принятых оснований — версионированные события в `resultJson` успешно завершённых `AiCall` (`kind=profile_dialogue`, `status=done`). Сырой ответ модели (`responseText` или эквивалент) отделён от принятого `event`.

Принятый `event` (`schemaVersion = "v04-event-1"`):

- `userMessageId`
- `kind = apply_update`
- `operation`, `category`, `value`
- `evidenceMessageIds`
- `confidence`
- `evidenceRole`: `support` (`replace_explicit` / `add_observation` / `strengthen`) или `oppose` (`weaken`)
- `applyResult`: допущенность слотов, `system_weight` затронутого слота, изменился ли отображаемый срез, `newRevisionId` или `null`

У `no_change` и `thought_specific` события основания нет. В `resultJson` можно сохранить `{ schemaVersion, event: null, kind }`, это не основание.

Вес и допущенность восстанавливаются **только** из принятых V04 events в устойчивом порядке: `createdAt` ASC, `id` ASC. `AiCall` без `schemaVersion = "v04-event-1"` **не** переигрывать как наблюдения (`healStoredPortrait` в целевом пути не восстанавливает поля из старых patch).

Существующий **опубликованный** портрет (`portrait.completed === true` на BASE) — исходный отображаемый снимок. Старый неподтверждённый `pending` автоматически не публиковать.

Новых таблиц нет. Live migrate не применять.

## Атомарность и гонки

В одной транзакции (сериализация по `CreatorProfile.id`):

- записать принятый `event` в `resultJson` и `AiCall.status=done`;
- зафиксировать финальное processing-сообщение;
- при смене отображаемого среза — **создать** новую `ProfileRevision` (не UPDATE старой) и сменить `currentRevisionId`.

При ошибке или проигрыше гонки не остаётся частично принятого основания: нет `event` без согласованного `AiCall=done` и без согласованного сообщения; нет новой ревизии без `event`; нет `event` с `newRevisionId`, которого нет в БД.

Повтор того же хода (тот же idempotency / тот же `AiCall`) не добавляет второй `event`.

Конкурентные ходы одного профиля выполняются строго по очереди. Исполнитель, который ждал, после получения очереди **заново** читает журнал events, проверяет источники, уникальность id и пороги, затем применяет или отказывает.

## Уникальность оснований

Для пары `(category, value)` один `evidenceMessageId` учитывается **один раз за всю историю слота**, независимо от роли support/oppose.

Отказ, если id:

- повторяется внутри `evidenceMessageIds` кандидата;
- уже есть в слоте как support;
- уже есть в слоте как oppose (в том числе «сначала support, потом oppose»).

Одно сообщение пользователя **можно** указать в **разных** слотах (разная пара `(category, value)`), если это отдельные принятые `apply_update` (обычно разные ходы). Один `apply_update` затрагивает ровно один слот. Две классификации одного сообщения в одном ответе модели запрещены (один `kind`).

## Слот, вес, отображение

Слот: `(category, value)`.

- `support_n` / `oppose_n` — уникальные id с ролью support / oppose и `confidence >= 0.5`
- `system_weight = support_n - oppose_n`
- `confidence < 0.5` пишется в event и не меняет вес

Константы: `COUNTING_MIN_CONFIDENCE = 0.5`, `PUBLISH_THRESHOLD = 3`, `REMOVE_THRESHOLD = 1`.

Гистерезис слота: допущен при весе `>= 3`; снят при весе `<= 1`; при `2 <= вес` уже допущенный слот остаётся допущенным.

После каждого принятого `apply_update` выбор отображаемого производного `value` в категории пересчитывается:

1. Допущенные слоты категории.
2. Берётся допущенный слот с наибольшим `system_weight`.
3. При равенстве веса остаётся текущее отображаемое `value`, если этот слот всё ещё допущен.
4. Если текущего допущенного нет — детерминированно меньший лексикографический `value` среди допущенных.
5. Если допущенных нет — категория исчезает из среза.

Пользователь веса не видит и не правит.

## Когда создавать ProfileRevision

Только если отображаемый срез изменился:

- прямое сведение принято или заменено (нормализованный `value` категории другой);
- производная категория появилась, сменила `value` или исчезла.

Не создавать ревизию: слабое основание; `add_observation` / `strengthen` / `weaken` при том же срезе; повтор того же прямого `value`; `no_change`; `thought_specific`; любой отказ.

Исторические ревизии не менять.

Confirm нет.

## Проверки сервера (`apply_update`)

- enum `kind` / полей варианта;
- `scope === global`;
- `category` / `value` / `evidenceType` / `operation` / `confidence`;
- каждый evidence id: существует, `role=user`, владелец = автор профиля, thread `scope=profile` этого профиля, не диалог мысли;
- уникальность id в кандидате и в истории слота;
- совместимость таблицы;
- после пересчёта — пороги и правило отображения.

## Диалог и цикл

Один вопрос за ход. Отказ отвечать → `no_change` / `refusal`. Голос = STT + тот же контракт.

Пользователь смотрит отображаемый снимок и продолжает разговор. `saveProfile` в V04 не используется. `confirmProfilePortrait` снимается на продуктовых коммитах.

Без портрета V03 и запись работают. Мысль важнее портрета. Портрет не `fact` и не источник сценария. `ai/script.ts` в V04 не расширять.

Не применять Prisma baseline, миграции 8–9 и `migrate resolve` на live Supabase.
