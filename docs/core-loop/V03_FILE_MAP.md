# V03 — карта файлов

V03: **accepted**. V03_HEAD: `b5278f468666330bc30bb6cd9378f2f02f858264`.
V03_BASE_SHA: `66cbcc0c3fc68a5b0786a4e9036a13d523ac3083`.
Продукт V04: **not started**. V04_BASE_SHA: `564c9cf8534392501e125dda7ecc747c235a5c0d`.

| Зона | Файлы |
|---|---|
| Контракт действия | `src/lib/agent-action.ts` |
| Диалог и CAS | `src/lib/dialogue.ts`, `src/lib/dialogue-exec.ts`, `src/lib/working-take.ts` |
| Reducer состояния | `src/lib/thought-state.ts` (`buildDialogueThoughtPatch`, `applyThoughtStateInTx`) |
| Тесты | `tests/v03-agent-actions.test.ts` |
| Документы | `V03_*.md`, `PLAN.md`, `AGENTS.md` |

Не входят: portrait confirm, UI записи, completion gate, playbook, live migrate.
