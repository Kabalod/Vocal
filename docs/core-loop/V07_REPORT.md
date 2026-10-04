# V07 — отчёт

Status: **продукт V07 принят** 04.10.2026. Внешний ревьюер принял продукт на SHA `4a066e221193795ef147c9768cb4105621b15772`.
V07_HEAD: `4a066e221193795ef147c9768cb4105621b15772`.
V07_BASE_SHA: `307bc8b9faf42d2ad64a0117c17f3b2ed800ef34`.
Отчёт финальных проверок: `78501ece148bab014a1bceedcf139b6036e8a04e`.
Опоры (не перепроверять): продукт V04 `e8985243e85c73d181083428f80c8445fed29756`; продукт V05 `5fa13657b38996ba8f3a416a22fb03b7647843b9`; продукт V06 `d0bdb89cd36c6e1b6925d6746a6447323d419eb3`.
Ветка: `fix/c00-live-action-shape`.
План: [`V07_PLAN.md`](./V07_PLAN.md). Контракт: [`CONTRACT.md`](./CONTRACT.md).
V00–V07 приняты в своих согласованных объёмах. Это не готовность всего приложения к запуску.

Docs-коммит приёмки тесты не гоняет.

## Доказательства приёмки

- адресный `node scripts/test-postgres.cjs --v07` на `4a066e221193795ef147c9768cb4105621b15772`: **17 pass / 0 fail**
- полный `npm run test:postgres` на том же продуктовом SHA: **251 pass / 0 fail**
- штатный `prisma generate` на worktree: `EPERM` rename `query_engine-windows.dll.node` в общем `D:\Vocal\node_modules\.prisma\client`; повтор один, явный `VOCAL_SKIP_PRISMA_GENERATE=1`, `prisma_generate_skipped=canonical_fingerprint`
- production `src/lib/v07-craft/production-catalog.json`: версия `v07-1`, **0 карточек**

## Что принято

Версионируемый каталог приёмов без новых таблиц; селектор 0–4 карточек по текущему открытому пробелу; freeze нормализованных карточек в `AiCall.inputSnapshotJson`; fixture-каталог только в изолированном test/mock; синтетический цикл уже принятого пути плюс селектор. Карточка не evidence и не C00. Портрет только публичным V04.

## Ограничения

Качество вопросов живой модели не доказано. I06 и I08 не выполнены. Медиа-джоб, мост памяти и остальные задачи ROADMAP сохраняют отдельные статусы. Приёмка V07 их не принимает.
