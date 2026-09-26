# V03 — отчёт

Status: **accepted**.
V03_HEAD: `b5278f468666330bc30bb6cd9378f2f02f858264`.
V03_BASE_SHA: `66cbcc0c3fc68a5b0786a4e9036a13d523ac3083`.
V02_HEAD: `1c9a4b9d4fda8df91b2e650e217883c8e02ccc62`.
Ветка: `feat/v03-from-base`.

Live Supabase не менялся. Миграции 8 и 9 на live не применялись. Продукт V04: **not started**. V04_BASE_SHA: `564c9cf8534392501e125dda7ecc747c235a5c0d`.

## Финальная проверка

- `npm run typecheck` — pass
- `npm run test:v01` — 15/15
- `npm run test:v02` — 9/9
- `npm run test:v03` — 31/31
- `npm run test:postgres` — 142/142

## Политика тестов V03

- Каждый продуктовый коммит: `npm run test:v03`.
- Правки диалога или CAS: `test:v01` + `test:v02` + `test:v03`.
- Полный `test:postgres`: один раз перед финальной приёмкой V03 (выполнен).
- Docs-only: тесты не гонять.

## Что сделано

- Контракт модели диалога: одно из `ask_question` | `suggest_take` | `content_sufficient` | `redirect_to_task`.
- Схемы действий строгие: лишние поля (`reply`, `scriptProposal`, неизвестные) отклоняются.
- `thoughtUpdate`: `redirect_to_task` не меняет состояние; `answeredGapId` / `closeGapIds[0]` / вопрос предыдущего хода согласованы; один gap; короткие «не знаю»/«повтори» не факты. Ход: `turnKey` + lease исполнения; повтор после bind-сбоя восстанавливает связь; сохранённый `responseText` не вызывает модель снова. После обрыва внешнего запроса до записи ответа lease истекает и повторный вызов модели возможен. Проигрыш гонки commit не переписывает успешное processing-сообщение в error.
- Снимок запроса включает `thoughtStateRevision`; перед записью `ThoughtState` блокируется и сверяется; устаревшее действие → 409.
- Сервер проверяет схему, ссылки (пробел / факты), допустимость `content_sufficient` (только audio/video с ревизией).
- Действие пишется в сообщение; `Reel.status` не меняется.
- Старый JSON `reply` + `scriptProposal` больше не принимается. UI записи — V05.

## Вне объёма

Portrait confirm (V04), UI переключателя и сценария (V05), completion без `finalScriptId` (V06).
