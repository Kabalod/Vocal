# I00 — отчёт аудита интеллекта Vocal

Статус: **аудит принят** на `9b6d2014cef681cbd61d5def51c987411e234e29` (ревью 2026-09-19). Приняты документы I00, **не** работоспособность новой архитектуры. Код и тесты в том ревью не запускались. I01 не начат. **P01.6-2 не принят.** **BASE_SHA для I01 не назначен.**

> 27.09.2026: фактическое состояние приложения (PostgreSQL, код Auth, принятые V01–V03 / ThoughtState, пустая пользовательская база по словам владельца) **не** такое, как в таблицах этого аудита. Аудит не переписывался. Актуальный маршрут: [`../ROADMAP.md`](../ROADMAP.md). Старый I01 с импортом `legacy_profile` не нужен.

## Фактически проверенный HEAD

- Ветка: `feat/p01-6-archive-polish`
- `git rev-parse HEAD` на момент аудита: `6ae0a1dacc399442750f67066a917be95e024c54`
- Сообщение: `P01.6-2: compact the mobile archive chrome and iPhone grid.`
- Remote на тот момент уже содержал этот SHA. **Приёмки P01.6-2 нет.**

Аудит кода интеллекта (Prisma, `src/lib/ai/*`, профиль, диалог, лимиты) читался с этого checkout. Схема и вызовы модели в этих путях не отличались от содержимого HEAD: незакоммиченный архивный polish не менял AI/Auth.

## Локальные изменения, которые участвовали в аудите

Сохранены, **не сбрасывались**, в этот коммит **не входят**.

| Путь | Роль в аудите |
|---|---|
| `docs/design/INTELLIGENCE_ARCHITECTURE_2026-09-19.md` | черновик до плана Cursor; confirm-портрет в нём **отменяется** планом |
| `docs/design/README.md` (unstaged) | ссылка на черновик архитектуры; не канон I00 |
| Незакоммиченный код архива (`ReelList`, polaroid, density, `VocalAppShell`, `globals.css`, тесты P01.6-2) | не входил в выводы об AI; только фон «грязное дерево» |
| Docs-cleanup (`AGENTS.md`, STAGE_*, champagne deletes, `Analyz/` untracked) | не аудировались как продукт интеллекта |
| Canvas-файлы вне git | вспомогательные, не артефакт приёмки |

Review-fix I00 (этот слой документов) дополняет аудит: второй Groq-путь uploads/pipeline/analyze, фактическое покрытие `AiCall`/лимит/retry, legacy `playbook.ts`, `healStoredPortrait`, дефект scoring-v1. Код приложения не менялся.

В коммите I00 только эти шесть файлов:

- `docs/VOCAL_INTELLIGENCE_CURSOR_PLAN.md`
- `docs/intelligence/I00_REPORT.md`
- `docs/intelligence/I00_ADR.md`
- `docs/intelligence/I00_FILE_MAP.md`
- `docs/intelligence/I00_SCENARIOS.md`
- `docs/intelligence/I00_DEPENDENCIES.md`

## Последний принятый SHA и источник приёмки

| SHA | Что принято | Источник |
|---|---|---|
| `1f33f12e1bb6ff4e2b041b3605f41c51fddb4240` | P01.5 / база цикла в `план разработки/README.md` | документированная база `vocal_cursor_plan_2026-09-18` |
| `c1518de` | P01.6-0 visual assets | переписка цикла архива (принято пользователем) |
| `6af1eaa` | P01.6-1 archive core (createdAt / newest-oldest) | переписка цикла архива (принято пользователем) |
| `9b6d2014cef681cbd61d5def51c987411e234e29` | аудит I00 (документы) | внешнее ревью: diff + чтение кода; четыре замечания закрыты в документации |

`6ae0a1d` = предложенный P01.6-2, **не принят**. Документированная база приложения в README цикла (`1f33f12`) **устарела** относительно принятых P01.6-0/P01.6-1. `9b6d201` — принятый снимок аудита, не база приложения и не BASE_SHA I01.

## Зависимости, блокирующие I01

1. Нет принятой базы **Supabase/Auth** в приложении: нет клиента, сессии, `userId` в Prisma. Автор — `local`. Временного общего пользователя план запрещает.
2. **P01.6-2 не принят**; working tree содержит посторонний незавершённый код. Миграции интеллекта с ним не смешивать.
3. I00 **не** назначает BASE_SHA для I01. Кандидат — чистый HEAD после принятия визуального цикла **и** принятый Auth.

Подробности: `I00_DEPENDENCIES.md`.

Merge не объявляется.

## Вердикт

Целевая архитектура из `docs/VOCAL_INTELLIGENCE_CURSOR_PLAN.md` **совместима со стеком** (Next.js, Prisma SQLite, Groq, существующие Reel/Dialogue/Script/Take/AiCall), но **не совместима с текущим профильным confirm-flow и с отсутствием пользователей**.

Главные решения плана имеют приоритет над:

- `PERSONAL_MVP.md` п.4 («портрет хранится как снимок»; «содержательные действия запускаются явно» — второе сохранить);
- `THOUGHT_JOURNEY` / `INTELLIGENCE_ARCHITECTURE_2026-09-19.md` в части «ревизия только после подтверждения»;
- тестах `Подтвердить портрет` / `confirmProfilePortrait`.

Сохранить: явный триггер модели, usage in_text/understanding, неизменяемые исторические снимки мысли, три статуса мысли, готовый UI-канон экранов 01–09.

## Supabase/Auth

**Не готов.** В приложении нет `@supabase/supabase-js`, middleware auth, `userId` в Prisma. Автор — константа `local`. MCP Supabase в этой среде не авторизован и не доказательство продукта.

I01 с пользовательской изоляцией **заблокирован**, пока не принята отдельная база Auth. Временного общего пользователя не вводить.

## Вызовы модели сейчас

Два независимых пути Groq, не один транспорт.

### Путь A — `complete.ts` + `AiCall`

`src/lib/ai/complete.ts` → Groq chat `json_object` + `withRetry` (по умолчанию 4 попытки). Запись `AiCall` делают вызывающие модули.

| kind / путь | Триггер | `AiCall` | `assertDailyTokenBudget` / `withAiInflight` |
|---|---|---|---|
| `profile_dialogue` | POST `/api/profile/dialogue` | да | да (оба) |
| `dialogue`, `dialogue-help` | POST `.../dialogue`, `.../dialogue/help` | да | да (`help` = тот же `sendDialogueMessage`) |
| `script` | POST `.../scripts/generate` | да | **нет** |
| `review` | POST `/api/takes/[id]/review` | да | **нет** |
| `questions` | POST `.../questions` | да | **нет** |
| `compare` | POST `.../compare` `runAi: true` **и** автосравнение из pipeline после 2+ дублей | да | **нет** |
| `thought_title` | pipeline / create из медиа | да | **нет** |

Confirm портрета: только `profile_dialogue` (`confirmProfilePortrait`). Принятие предложения сценария — не память профиля.

Дневной лимит `VOCAL_DAILY_TOKEN_LIMIT` считает **только** `AiCall.status=done`. Пути без `AiCall` в сумму не входят. Даже среди `AiCall` budget/inflight стоят только на профильном и мыслительном диалоге.

### Путь B — загрузка: `/api/uploads` → `pipeline.ts` → `analyze.ts`

POST `/api/uploads` создаёт `Job` (или take+job) и `enqueueJob`. `src/lib/pipeline.ts` гоняет Job: ffmpeg → `stt.ts` (Groq Whisper, `withRetry` 5) → опционально `thought_title`/`compare` через путь A → `analyzeSpeech` в `src/lib/analyze.ts`.

`analyze.ts` вызывает Groq chat **напрямую** (`completeJson` + `withRetry`), **не** через `complete.ts`. **Нет** строки `AiCall`, **нет** `assertDailyTokenBudget` / `withAiInflight`. Повтор Job — `attempts`/`maxAttempts` в `jobs.ts`, отдельно от Groq retry.

STT в этом пайплайне и голосовой STT диалога — Whisper, не chat JSON. Учёт токенов Whisper в `AiCall` отсутствует.

Просмотр списка, фильтры, `saveProfile` черновика **сами** модель не вызывают. **GET профиля вызывает `healStoredPortrait`** (запись в БД при чтении, без LLM; см. ниже).

Снимки: `AiCall.inputSnapshotJson` есть у пути A, но **нет** версий памяти/ThoughtState/craft. Путь B пишет `AnalysisResult` / транскрипт Job, не operation graph. `ReelContextSnapshot.assembledJson` — живой портрет на момент сборки.

Ownership: проверок пользователя нет; доступ по id сущности на localhost.

## healStoredPortrait

`getProfileWorkspace` (чтение профиля / диалога) вызывает `healStoredPortrait`. Если ни одно поле портрета не заполнено (`coveredProfileKeys` пуст), код **переигрывает все** `AiCall` `kind=profile_dialogue`, `status=done` и при изменении **пишет** новую `ProfileRevision`. Это восстановление с записью при GET, не отдельный пользовательский триггер и не LLM.

Следствие: сброс/очистка полей при живых старых `AiCall` **сейчас может вернуть портрет**. Целевой контракт (I05/I07): сброс и удаление не восстанавливаются replay старых вызовов; нужен watermark/tombstone. Код сейчас не менять.

## Legacy playbook vs библиотека ремесла

Существует `src/lib/playbook.ts` (`CONVERSATIONAL_GROWTH_PLAYBOOK` + форматы/критерии). Сейчас:

- `analyze.ts` — полный список паттернов в промпте Job-разбора;
- `ai/review.ts` — до 6 паттернов как необязательная подсказка;
- `scoring.ts` / `scripts/score-analyz.ts` — `normalizeFormat` и id критериев, не каталог I06;
- снимки диалога/профиля помечают `playbook: false`.

Это **legacy playbook разговорного роста**, смешанный со скорингом Job. Целевая библиотека ремесла I06 — отдельный версионируемый каталог карточек (пробел, механизм, source IDs, attribution), не этот объект. **В I06 нужно явное решение: интегрировать playbook как семя/источник или отключить от runtime.** Код и дизайн в этом review-fix не меняются.

## Дефект scoring-v1 (память, не `scoring.ts`)

Формула §5 плана: слабый поведенческий сигнал `E=0.3` **никогда не даёт** `D ≥ 0.70` (`D ≤ 0.545` при `R→1`), то есть **не достигает `active`**. При пороге «ниже 0.45 не хранить» одиночные и даже три независимых слабых сигнала (`M ≈ 0.20…0.42` при `U=S=A=1`) **отбрасываются до накопления**.

Нужен **раздельный контракт**: (1) ограниченное хранение предварительных наблюдений ниже порога active; (2) отдельное накопление уверенности до candidate/active. Прямой путь «явное полезное утверждение сразу active» слабые сигналы не закрывает.

До I04 — численные примеры достижимости порогов; **коэффициенты v1 не объявлять готовыми**. `src/lib/scoring.ts` к этой политике не относится (баллы критериев Job).

При `U=S=A=1`, `C=0` (гипотеза плана, не калибровка):

| E | n | R | D ≈ M | vs 0.45 / 0.70 |
|---|---|---|---|---|
| 0.3 слабый | 1 | 0 | 0.195 | ниже 0.45 → отброс, накопить негде |
| 0.3 | 3 | 0.632 | 0.416 | всё ещё отброс |
| 0.3 | ∞ | 1 | 0.545 | candidate максимум, **active недостижим** |
| 0.6 правка | 1 | 0 | 0.390 | отброс до второго независимого источника |

Прямой путь «явное утверждение сразу active» на эти строки не распространяется.

## Данные vs целевые контракты

Есть: `CreatorProfile`, `ProfileRevision.payloadJson` (8 полей + usage), `ReelContextSnapshot`, `DialogueThread/Message`, `ScriptDraft/Version`, `Take/TranscriptRevision`, `AiCall`, `Job`.

Нет: `userId`, `AuthorMemory`, `MemoryEvidence`, `MemoryUpdate`, `ThoughtState`, budget/significance, sourceWatermark, craft library runtime.

Импорт legacy: одна запись `local` → `evidenceType: legacy_profile` без выдуманных цитат.

## Тесты, которые отменят confirm

Не ослаблять `test:reels`. В I05 заменить контракт, не `--grep invert`.

- `tests/p10-p12-profile.test.ts` — UI и `confirmProfilePortrait`
- `tests/profile-dialogue.test.ts` — известный техдолг + confirm
- `tests/r2-idempotency.test.ts`
- `tests/mvp-release.test.ts`
- `tests/p17-e2e-matrix.test.ts`

Промпт `PROFILE_DIALOGUE_SYSTEM`: `complete=true` = черновик к подтверждению. Это отменяется политикой автоматической ревизии.

## Очередь после принятого I00

Порядок фиксирован ревью. I01 не начинать раньше пункта 3.

1. **Закрыть приёмку P01.6-2** и зафиксировать базу приложения (включая незакоммиченный архивный polish — отдельно от интеллекта).
2. **Реализовать и принять Supabase/Auth** с изоляцией данных. Временного общего пользователя нет.
3. **Актуализировать карту I00** под принятую схему и **назначить BASE_SHA для I01**.
