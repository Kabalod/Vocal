# V03 — карта файлов

V03_BASE_SHA: `66cbcc0c3fc68a5b0786a4e9036a13d523ac3083`.

| Зона | Файлы |
|---|---|
| Контракт действия | `src/lib/agent-action.ts` |
| Диалог и CAS | `src/lib/dialogue.ts`, `src/lib/working-take.ts` |
| Факт из ответа | `src/lib/thought-state.ts` (`recordAuthorFactFromDialogue` → `applyThoughtState`) |
| Тесты | `tests/v03-agent-actions.test.ts` |
| Документы | `V03_*.md`, `PLAN.md`, `AGENTS.md` |

Не входят: portrait confirm, UI записи, completion gate, playbook, live migrate.
