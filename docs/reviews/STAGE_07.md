# Отчёт этапа

## Идентификация

- Этап: Stage 07 — сценарии и версии
- BASE_SHA: `d4680eb9b48ac96cdea708f6b975afe033015ba5`
- Коммит(ы) кода: `bf7554cc320ab947de946dc6cdeeace914d6d083`
- Коммит исправления: `6d6794e918aa3a32049bdaf1dc3f3d6767f063c1`
- Коммит исправления (saving unlock): `cf234293bf1a1fd1e735b79bacf8065f0dcc305c`
- HEAD_SHA: `cf234293bf1a1fd1e735b79bacf8065f0dcc305c`
- Ветка: `feat/vocal-v2-07-script-drafts`
- Ссылка GitHub: https://github.com/Kabalod/Vocal/tree/feat/vocal-v2-07-script-drafts

Stage 06 принят на SHA `d4680eb9b48ac96cdea708f6b975afe033015ba5` (последний код правки `8590b541920b10d69875028a67a51ac00858ebb4`). Это BASE Stage 07. Ветка создана от этой вершины. Stage 08 не начинался.

## Что реализовано

- Один `ScriptDraft` на мысль: body, sources, sourceKind, baseVersionId, `saveToken`, timestamps. Миграция `20260912030000_script_draft`.
- `PATCH` черновика автосохраняет один объект и не создаёт `ScriptVersion`. Параллельный PATCH с тем же токеном даёт 409/`STALE` без потери текста у проигравшего клиента.
- «Завершить версию» транзакционно создаёт готовую версию (`manual` или `accepted_ai` для переноса из Vocal) и удаляет черновик. Клиент передаёт актуальный `body`; перед выходом к готовым версиям дожидается PATCH. В транзакции `expectedSaveToken` сравнивается с `draft.saveToken`. `replaceScriptDraft` увеличивает `saveToken`, поэтому старый PATCH после переноса получает 409. Сохранение черновика всегда снимает `saving` в `finally`; параллельные PATCH идут очередью. После сетевой ошибки или 500 пользователь остаётся в черновике, кнопки снова доступны, повтор с тем же текстом возможен.
- Готовые версии не имеют route правки body. `GET /api/reels/:id/scripts` отдаёт метаданные всех версий без `body`; полный текст — у выбранной версии и текущего черновика. `GET /scripts/:scriptId` — одно тело. Переключение версии на клиенте идёт через `GenerationGuard`.
- «Перенести в сценарий» создаёт/заменяет черновик, не готовую версию. Повтор и гонка по-прежнему через `claimKey`.
- Старые `ScriptVersion(kind=ai_proposal)` не мигрируются; читаются как метаданные. Предложение Vocal остаётся в `DialogueMessage(kind=script_proposal)`.
- UI: готовая версия read-only; «Создать новую версию» / «Продолжить черновик»; заголовок «Черновик новой версии», «На основе версии N», автосохранение, «Завершить версию», «К готовым версиям», удаление черновика с подтверждением. Навигатор: назад/вперёд, `N из M`, ползунок; при одной версии ползунок неинтерактивен. Источник: «Из дубля №N / Создана вами / Создана с Vocal». «Скачать» — вторичная кнопка. Длинный список v1…v20 убран.
- Выбор другой готовой версии не подменяет тело существующего черновика.

## Что намеренно не реализовано

- История черновиков и undo.
- Смена `finalTakeId` / `selectedTakeId` и автовыбор финала.
- Профильный чат (Stage 10).
- Запись нового дубля со сценария (Stage 08).
- Разрушительная миграция `ai_proposal` → диалог.
- Живой Groq в этом отчёте.

## Изменённые файлы

- `prisma/schema.prisma`, `prisma/migrations/20260912030000_script_draft/migration.sql`
- `src/lib/scripts.ts`, `src/lib/dialogue.ts`, `src/types/script.ts`, `src/types/dialogue.ts`
- `src/app/api/reels/[id]/scripts/route.ts`, `[scriptId]/route.ts`, `draft/route.ts`, `draft/finalize/route.ts`
- `src/components/ScriptEditor.tsx`, `ScriptVersionTimeline.tsx`, `ReelStudio.tsx`
- `tests/thought-script-draft.test.ts`, `thought-dialogue.test.ts`, `scripts.test.ts`, `thought-text-create.test.ts`, `package.json`

## Миграции и данные

- Новая миграция: да, `20260912030000_script_draft`
- Проверка существующей SQLite: `prisma migrate deploy` на `prisma/dev.db` применил ScriptDraft
- Проверка чистой SQLite: `reels-migration` empty deploy, 12 миграций
- Backfill: нет; готовые `ScriptVersion` не трогаются
- Возможность отката: git revert коммита кода + откат миграции (DROP TABLE ScriptDraft)

## Проверки

| Проверка | Результат | Ограничения |
|---|---|---|
| `npm run test:reels` | 69/69 | draft не увеличивает ready; finalize +1; 409/STALE; GET без body; transfer → draft; 20+ метаданных |
| `npm run lint` | exit 0 | предупреждение exhaustive-deps в `VocalAppShell` с Stage 01 |
| `npm run typecheck` | exit 0 | `scripts` в exclude |
| `npm run build` | успех | маршруты `/scripts`, `/scripts/[scriptId]`, `/scripts/draft`, `/scripts/draft/finalize` |
| Browser 390×844 | вкладки Дубли / Сценарий / Диалог; `scrollWidth=390`; ползунок disabled при 1 версии; «Создать новую версию» | живой send/STT не гонялись |
| Browser 1280×800 | read-only версия «Из дубля №1»; открытие черновика; «Завершить версию» | автосохранение в браузере подтверждено тестами; textarea в UI открылась |

## AI и внешние сервисы

- Какие AI-вызовы добавлены или изменены: нет новых; help/transfer без смены Groq
- Проверено mock: да, диалог и generate как раньше
- Проверено live: нет
- Что не проверено: живой Groq, 20+ версий в браузере (есть в тестах и навигатор 1 версии)

## Совместимость с будущим обучением

- Какие исторические данные затронуты: новые строки `ScriptDraft`; готовые версии и `ai_proposal` не переписываются
- Может ли что-либо перезаписаться/удалиться при завершении, retry или возврате в работу: finalize удаляет текущий черновик после создания версии; delete draft не трогает готовые версии; повторный transfer заменяет тело черновика
- Сохраняются ли source metadata, порядок, итоговые ссылки и snapshots: да у `ScriptVersion`; у черновика — sourcesJson / baseVersionId / sourceKind
- Не создана ли новая рубрика в обход `playbook.ts`/`framework.ts`: нет
- Можно ли позднее добавить read-only learning job без изменения смысла текущих моделей: да

## Подтверждения

- Force push не использовался.
- Следующий этап не начинался.
- Этап не объявляется принятым до внешнего ревью.
