# V00 — отчёт аудита ядра мысли Vocal

Status: ready for external final review, **not accepted**.
V01: not started.
AUDITED_APP_SHA: `f971a7fb43c2fdd9df6b1824620491500972736a`
BASE_SHA: not assigned.

Документы V00 обновлены под принятые Auth, landing и DB00-fix. Принятыми не объявляются. Код приложения не менялся. Тесты suite не критерий приёмки аудита.

Канон в репозитории: [`PLAN.md`](./PLAN.md), [`CONTRACT.md`](./CONTRACT.md), [`V00_ADR.md`](./V00_ADR.md).

## Матрица этапов

- **V01** — актуальный дубль, точная ревизия, изоляция запросов.
- **V02** — ThoughtState.
- **V03** — четыре действия агента и решение о готовности.
- **V04** — портрет и персонализация вопросов.
- **V05** — UI перехода к записи и роль сценария.
- **V06** — разбор следующего дубля и завершение.
- **V07** — библиотека приёмов и полный цикл.

## Фактически проверенное приложение

| Поле | Значение |
|---|---|
| Ветка документов | `docs/v00-final-acceptance` |
| AUDITED_APP_SHA | `f971a7fb43c2fdd9df6b1824620491500972736a` |
| Сообщение приложения | `fix(db): drop owner defaults and isolate Postgres test/migrate` |
| Исторический аудит | `4ac28630692860a3092cf6c4cbc05ed791eb549d` — больше не кандидат |

`f971a7f` содержит принятый Auth (`51d6033`), принятый landing (`51c6582`) и принятый DB00-fix. Рабочее дерево этой ветки чистое.

BASE не назначается этим коммитом.

## Что не входит в этот снимок

На `f971a7f` **нет** незакоммиченных ядерных файлов предыдущего грязного `D:\Vocal`:

| Путь | Статус на `f971a7f` |
|---|---|
| `src/lib/dialogue-reply.ts` | отсутствует |
| `src/lib/thought-opening.ts` | отсутствует |
| `src/lib/thought-completion-gate.ts` | отсутствует; gate в `thought-completion.ts` |

## Связь с I00

I00 принят на `9b6d2014cef681cbd61d5def51c987411e234e29`. Карта I00 описывает SQLite и автора `local`. I00 не отменяется. Для ядра мысли приоритет у документов `docs/core-loop/`. I01 из этого цикла не начинать.

Устаревшее в I00 относительно `f971a7f`: Postgres-only, `ownerUserId` без `@default("local")`, принятый Auth. Портрет в **этом** цикле — этап **V04**.

## Auth, лендинг, DB00

| Тема | Статус |
|---|---|
| Auth как продукт | принят |
| Лендинг | принят |
| DB00-fix | принят (`f971a7f`) |
| Live baseline / `migrate resolve` на Supabase | не применялись; не часть V00 |

## Условия перед V01 (только эти)

1. Внешняя приёмка обновлённых документов V00.
2. Явное назначение BASE_SHA.

## Долги кода (не блокеры приёмки документов)

Факты на `f971a7f`, закрываются этапами:

- **ThoughtState отсутствует** — V02.
- **workingTakeId отсутствует** — V01.
- **Контекст диалога ограничен двумя дублями** (`takes: { take: 2 }`) — V01.
- **suggest_take и остальные три действия отсутствуют** — V03.
- **Профиль требует confirm** — V04.
- **withAiInflight без `ownerUserId` в ключе; 409 по версии состояния нет** — V01.
- **Завершение всегда требует `finalTakeId` и `finalScriptId`** — V06.

## Повторная проверка фактов на `f971a7f`

1. **workingTakeId** — нет в схеме и коде.
2. **Рабочий дубль** — `selectedTakeId`, если он попал в выборку первых двух takes по `number`, иначе `takes[0]`.
3. **Сколько дублей в контексте диалога** — ровно **2** (`buildThoughtMaterialContext`).
4. **Точная ревизия расшифровки** — отдельного поля рабочего id нет. Текст берётся из `listTranscriptBundle(take.id)` по `selectedId` (`selectedTranscriptId`).
5. **withAiInflight**
   - `ownerUserId` в ключ **не входит**;
   - диалог: `dialogue:${reelId}:${key}`; профиль: `profile-dialogue:${key}`;
   - разные пользователи с тем же `reelId`/`key` делят Promise процесса;
   - разные мысли с разными `reelId` не делят ключ диалога;
   - класс `AiInflightError` (HTTP 409) есть, **нигде не бросается**;
   - 409 при конфликте версии состояния **нет**.
6. **Действия** `ask_question`, `suggest_take`, `content_sufficient`, `redirect_to_task` — в коде **нет**. Контракт модели: `reply` + `scriptProposal`.
7. **Подтверждение портрета** — да (`confirmProfilePortrait`, `pending.readyToConfirm`).
8. **Завершение** — `thoughtCompletionGate` **всегда** требует и `finalTakeId`, и `finalScriptId`. `backfillFinalTakeIds` — служебное копирование `selectedTakeId` → пустой `finalTakeId`.
9. **Пути Groq**
   - путь A: `complete.ts` + `AiCall` (диалог, профиль, script, review, questions, compare, thought-title);
   - путь B: прямой `getGroq()` в `stt.ts` и `analyze.ts`.
10. **Выводы относительно `4ac2863`** — **ядро не изменилось**. Сменились приёмка Auth/landing/DB00, чистота дерева и отсутствие `@default("local")` у `ownerUserId`. Поведение диалога, inflight, confirm и completion gate то же.

Дневной бюджет `assertDailyTokenBudget` по-прежнему без фильтра `ownerUserId`. Default колонки `Reel.status` в Prisma всё ещё `"draft"`.

## Вердикт совместимости

Стек (Next 15, Prisma 6, Postgres, Groq, Reel / Take / Dialogue / Script / AiCall) совместим с целевым циклом. Поведение `f971a7f` контракту не равно.

Политика завершения и путь процесса — [`CONTRACT.md`](./CONTRACT.md). Реализация завершения — только V06.

## Расход

Ноль вызовов модели, ноль миграций. На Supabase ничего не применялось.

## Merge

Не объявляется. V01 не начинать, пока V00 не принят и BASE_SHA не назначен.
