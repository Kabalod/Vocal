# I00 — отчёт аудита интеллекта Vocal

Статус: готов к внешнему ревью. I01 не начат. Этот отчёт **не** принимает P01.6-2 и **не** фиксирует BASE_SHA для I01.

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

`6ae0a1d` = предложенный P01.6-2, **не принят**. Документированная база `1f33f12` в README цикла **устарела** относительно принятых P01.6-0/P01.6-1.

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

Один транспорт: `src/lib/ai/complete.ts` → Groq `json_object`. STT — отдельный Groq Whisper в `src/lib/stt.ts` (не всегда как `AiCall`).

| kind / путь | Триггер | Confirm? |
|---|---|---|
| `profile_dialogue` | POST `/api/profile/dialogue` | да: `confirmProfilePortrait`, UI «Подтвердить портрет» |
| `dialogue` | POST `/api/thoughts/[id]/dialogue` | нет |
| `dialogue-help` | POST `.../dialogue/help` | нет |
| `script` | POST `.../scripts/generate` | принятие предложения сценария — да, это не память профиля |
| `review` | POST `/api/takes/[id]/review` | явная кнопка |
| `questions` | POST `.../questions` | явная |
| `compare` | POST `.../compare` `runAi: true` | явная |
| `thought_title` | создание мысли из медиа | внутри явного create |
| STT | голос / дубль | внутри явной отправки |

Просмотр списка, фильтры, `saveProfile` черновика, GET страниц — модели не вызывают.

Лимит: `VOCAL_DAILY_TOKEN_LIMIT` + `assertDailyTokenBudget` по сумме токенов `AiCall.status=done` за день. Inflight-ключ `withAiInflight`. Retry сети: `withRetry` в Groq.

Снимки: `AiCall.inputSnapshotJson` есть, но **нет** версий памяти/ThoughtState/craft. `ReelContextSnapshot.assembledJson` — живой портрет на момент сборки, не полный operation graph.

Ownership: проверок пользователя нет; доступ по id сущности на localhost.

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

## Следующий шаг после ревью I00

1. Принять или отклонить этот аудит.
2. Не начинать I01, пока нет принятого Auth/Supabase **или** явного решения сузить I01 до local-only (план это запрещает).
3. Не смешивать с незакрытым P01.6-2.
