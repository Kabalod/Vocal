# V03 — отчёт

Status: **in progress** (not accepted).
V03_BASE_SHA: `66cbcc0c3fc68a5b0786a4e9036a13d523ac3083`.
V02_HEAD: `1c9a4b9d4fda8df91b2e650e217883c8e02ccc62`.
Ветка: `feat/v03-from-base`.

Live Supabase не менялся. V04 не начинать.

## Политика тестов V03

- Каждый продуктовый коммит: `npm run test:v03`.
- Правки диалога или CAS: `test:v01` + `test:v02` + `test:v03`.
- Полный `test:postgres`: один раз перед финальной приёмкой V03.
- Docs-only: тесты не гонять.

## Что сделано

- Контракт модели диалога: одно из `ask_question` | `suggest_take` | `content_sufficient` | `redirect_to_task`.
- Сервер проверяет схему, ссылки (пробел / факты), допустимость `content_sufficient` (только audio/video с ревизией).
- Действие пишется в сообщение; `Reel.status` не меняется.
- Старый JSON `reply` + `scriptProposal` больше не принимается. UI записи — V05.

## Вне объёма

Portrait confirm (V04), UI переключателя и сценария (V05), completion без `finalScriptId` (V06).
