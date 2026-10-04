# Медиа-путь — отчёт

Status: **медиа-путь принят** 04.10.2026. Внешний ревьюер принял продукт на SHA `269a389f6bcc31d6d9243a0e50540f24c1078784`.
MEDIA_PATH_HEAD: `269a389f6bcc31d6d9243a0e50540f24c1078784`.
MEDIA_PATH_BASE: `3206fe4ca6849aced92ee5a554cde0f72f284ca3`.
Отчёт проверок: `553ed1d`, статус плана: `fd7c2e9`.
Первый кандидат: `5264ca627e7b09c086adfe47a136ed97959d5267` (объём не принят: публикация после STT без проверки текущего lease).
Опоры (не перепроверять): продукт V06 `d0bdb89cd36c6e1b6925d6746a6447323d419eb3`; продукт V07 `4a066e221193795ef147c9768cb4105621b15772`.
Ветка: `fix/c00-live-action-shape`.
План: [`MEDIA_PATH_PLAN.md`](./MEDIA_PATH_PLAN.md).
V00–V07 не переоткрыты. Это не готовность всего приложения к запуску.

Docs-коммит приёмки тесты не гоняет.

## Доказательства приёмки

- адресный `node scripts/test-postgres.cjs --media` на `269a389`: **11 pass / 0 fail**
- полный `npm run test:postgres` на том же продуктовом SHA: **253 pass / 0 fail** (`tests_ms=615827`)
- UI smoke на тестовой Postgres с mock STT/AI: desktop **1280×800** и mobile **390×844** — **pass**
- штатный `prisma generate` на worktree: `EPERM` rename `query_engine-windows.dll.node` в общем `D:\Vocal\node_modules\.prisma\client`; повтор один, явный `VOCAL_SKIP_PRISMA_GENERATE=1`, `prisma_generate_skipped=canonical_fingerprint`

## Что принято

Запись → сохранённая выбранная расшифровка → рабочий дубль по V06. Job после STT и title завершается без `analyzeSpeech`, scoring, coach, Review, Question и автоматического AI-сравнения. Публикация original/V06/title только при действующем `leaseOwner` (Job FOR UPDATE, затем Reel). Legacy POST review/questions и compare `runAi=true` — 410. История GET и текстовое сравнение сохранены. Разбор смысла — явным ходом в основном Диалоге.

## Ограничения

Отдельный upload-дефект (диалог выбора файла Windows) не воспроизводился и не объявлен исправленным. Качество живых моделей не доказано. I06, I07, I08 и мост памяти не закрыты. Приёмка медиа-пути не принимает запуск приложения.
