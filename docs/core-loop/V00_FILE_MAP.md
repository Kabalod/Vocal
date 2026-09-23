# V00 — карта файлов ядра мысли

Карта описывает дерево **`4ac2863`** (кандидат, не назначенный BASE). После приёмки V00 и назначения BASE обновить эту карту, если SHA другой.

Не создавать до V01+ логические модули плана: `thought-state` reducer, `suggest_take` handler, отдельный `workingTake`.

## Существующие ядра (читать, расширять на V01+)

| Область | Файлы на `4ac2863` | Этап плана |
|---|---|---|
| Диалог мысли | `src/lib/dialogue.ts`, `src/app/api/thoughts/[id]/dialogue/**` | V01 handler / лимиты; V02 сценарий в том же ходе |
| Помощь сценарием | `requestScriptHelp` в `dialogue.ts`; `src/lib/ai/script.ts`, `src/lib/scripts.ts`, `.../scripts/generate` | V02 |
| Статус мысли / завершение | `Reel.status`, `src/lib/reels.ts`, `src/lib/thought-completion.ts` (backfill `finalTakeId`), UI `CompletionSummary.tsx`, `ReelStudio.tsx` | V03 reducer; V05 complete |
| Дубли | `Take`, `selectedTakeId`, `finalTakeId`, `src/lib/thought-media.ts` | V04 `workingTake` / `suggest_take` |
| Профиль / confirm | `src/lib/profile.ts`, `profile-dialogue.ts`, `profile-portrait.ts`, `ai/profile.ts`, `components/ProfileConversation.tsx`, `app/api/profile/**` | **не этот цикл** (I05) |
| Контекст | `src/lib/reel-context.ts`, `ai-runtime-context.ts` | читать; не ломать snapshot |
| Вызов A | `src/lib/ai/complete.ts`, `usage-guard.ts`, `groq.ts` | V01 ключи inflight; не новый транспорт |
| Загрузка / Job | `uploads` → `pipeline.ts` → `analyze.ts` / `stt.ts` | не ядро диалога; не смешивать с V01 |
| Схема | `prisma/schema.postgres.prisma` (+ sqlite-схемы для тестов, если есть в репо) | V03/V04 колонки только по плану |
| Auth | `src/lib/auth/**`, `src/lib/supabase/**` | не переписывать в ядре |
| Лендинг | `src/app/page.tsx`, `src/components/landing/**` | не трогать |
| Канон UI | `docs/design/references-new/` экраны 01–09; `/reels` = 09 | визуал не этот цикл |

## Локальные файлы вне `4ac2863` (не расширять как канон V00)

Появились в грязном дереве после лендинг-коммита. До отдельной приёмки **не** считать существующим ядром:

- `src/lib/dialogue-reply.ts`
- `src/lib/thought-opening.ts`
- `src/lib/thought-completion-gate.ts`

Если пользователь примет их отдельным коммитом до V01, обновить карту.

## Новые модули (не создавать в V00)

Имена плана, не обязательно отдельные процессы:

- `thought-state` / reducer статусов мысли
- `suggest_take`
- колонка `workingTakeId`
- отдельный «второй чат» или экран выбора дубля вне текущего studio

## Тесты, которые затронет ядро (не отключать suite)

Ожидаемые переписывания на V01+: диалог (`tests` вокруг `dialogue`), завершение мысли / `reels` status, e2e матрица мысли.

Оставить зелёными без ослабления: `package.json` `test:reels`, lint, typecheck, build.

Не чинить «заодно» красный `profile-dialogue` и не начинать I01.

## Не трогать в этом цикле

- `docs/design/references-new/`, champagne/STAGE/Desktop-архивы
- лендинг L00–L07 и его приёмка
- I01 память / operation handler / scoring-v1
- подтверждение профиля (снятие confirm — I05)
