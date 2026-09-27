# C00 — проект слоя исправлений и сигналов

Status: документы C00 **приняты** (`8cb7351`). C00-01 **принят** (`2391217`). C00-02 **принят** (`548b8137e010a6fa1fd063b521696a07fc7fdd1f`). Продукт C00, V04 и [`../ROADMAP.md`](../ROADMAP.md) **не приняты**. Следующий этап — C00-03.

## Сверка предыдущего этапа (факт HEAD)

Проверено на `feat/v04-from-base`:

| Поле | Факт |
|---|---|
| HEAD | `e39d2f9f25e5aa2b7fc05f32543bb1b6b244364e` |
| Сообщение | `docs(v04): store portrait evidence in AiCall events` |
| V03 | **accepted**, `V03_HEAD` = `b5278f468666330bc30bb6cd9378f2f02f858264` |
| V04 продукт | **not started** (`PLAN.md`, `CONTRACT.md`, `AGENTS.md`, `V04_REPORT.md`) |
| V04 | **не принят**. Коммиты `2e8ce85`…`e39d2f9` — только V04-00 |
| V04_BASE_SHA | `564c9cf8534392501e125dda7ecc747c235a5c0d` |
| V04-01 / V05 / I01 | не начаты |
| I00 | аудит документов принят исторически; код интеллекта не реализован; карта I00 устарела (там SQLite/`local`/confirm) |

C00 **не** принимает V04 и **не** является V04-01. Исправления thought dialogue не переносятся в портрет. Документы C00 и C00-01 приняты; продукт C00 не принят.

## Карта путей данных (факт кода + цель V04-00)

```
Автор (Auth ownerUserId)
  ├─ POST /api/profile/dialogue
  │    sendProfileMessage → AiCall kind=profile_dialogue
  │    → (BASE) patch + confirmProfilePortrait → ProfileRevision.payloadJson
  │    → (цель V04) apply_update event в resultJson; ревизия только при смене среза
  │    → runtimePortraitFields / reel-context
  │         publicForScript + understandingOnly
  │
  └─ POST /api/thoughts/:id/dialogue
       user DialogueMessage + processing
       → runDialogueTurn / lease → AiCall (мысль)
       → parseAgentReply: action + thoughtUpdate
       → commitDialogueReply: DialogueMessage + ThoughtState.revision + факты/пробелы
       → промпт следующего хода читает ThoughtState + live reel-context (портрет)
            │
            ├─ ask_question → открытый gap; Question/review — отдельный legacy-путь
            ├─ suggest_take / запись Take + TranscriptRevision (иммутабельны)
            ├─ generate script (V05 не начат): ai/script.ts + ScriptVersion / ScriptDraft
            └─ finalTakeId выбирает пользователь (V06 не менять здесь)
```

Зависимости сейчас:

- Кандидат портрета **не** пишет `ThoughtState`.
- `thoughtUpdate.fact` ссылается только на текущее user-сообщение мысли (`dialogue_message`).
- Портрет в промпте мысли — JSON `publicForScript` / `understandingOnly` (на BASE только после confirm).
- Сценарий и review читают тот же assembled context; V04-00 запрещает портрет как источник событий сценария — в коде ещё не снято.
- Источники (`DialogueMessage`, `TranscriptRevision`, `Take`, `ProfileRevision` после создания, `ReelContextSnapshot`) не переписываются обычным reducer'ом. C00 это сохраняет.

Уже обрабатывается правильно (не ломать):

- `isNonContentUtterance` / `redirect_to_task` не пишут факт;
- факт только с `sourceId` текущего user-сообщения;
- CAS `ThoughtState.revision` → 409;
- повтор хода V03 по `turnKey` не добавляет второй вызов при готовом ответе;
- owner isolation `ownerUserId`;
- `db-target`: тесты — localhost Postgres, не live Supabase.

Чего нет (после C00-02):

- применения correction и предиката stale (C00-03);
- смены фактов мысли маршрутизатором;
- портрета и UI;
- запрета считать молчание согласием как отдельного продукта.

## Риски миграции

- Схема репозитория — `provider = postgresql`. Тесты V01–V03 — `TEST_DATABASE_URL` (Docker Postgres), не SQLite. C00 **не** проектирует SQLite-адаптер и **не** считает, что live уже прогнал миграции 8–9 (`turnKey`, lease).
- Новые таблицы на live без явного migrate запрещены. Конверт живёт в `AiCall.resultJson` хода мысли. Колонка stale не нужна.
- `healStoredPortrait` и replay старых AiCall опасны для ложных глобальных правил.
- I00 scoring-v1 / playbook не использовать как движок C00.
- Дублировать полные промпты в новых логах нельзя: `AiCall.promptText` уже хранит replay; метрики C00 — id и reasonCode, не тело.

## Критерии приёмки документов C00

- Статус V04 в каноне не изменён на accepted.
- Есть таксономия, конверт resultJson, stale-предикат, eval и сценарии. Переноса в портрет нет.
- Реализация продукта C00 не принята. C00-02 принят отдельно. Следующий этап — C00-03, не V04.
