# Медиа-путь — отчёт кандидата

Status: **кандидат, не принят**. V00–V07 не переоткрыты. I06, I07, I08 и запуск приложения не закрыты.
BASE объёма: `3206fe4ca6849aced92ee5a554cde0f72f284ca3`.
Первый кандидат: `5264ca627e7b09c086adfe47a136ed97959d5267` (объём не принят: публикация после STT без проверки текущего lease).

## Факт → изменение → проверка

1. **На BASE `processJob` после STT вызывал `analyzeSpeech` и `ensureAutomaticTakeComparison`.** После original/selected и title Job завершается. Scoring, coach, Review, Question, CompareResult и ScriptVersion как побочный эффект STT не создаются.
2. **Публикация original / selected / bodyText / workingTake / title шла после `await` STT без блокировки Job.** Короткая транзакция: `Job FOR UPDATE` и сверка `leaseOwner`, затем `Reel FOR UPDATE`, повторное чтение, запись original и допустимые эффекты V06. `claimJob` берёт тот же замок Job. Потерявший lease не вызывает fail/release чужого lease.
3. **`saveOriginalIfAbsent` создавал original до замка Reel.** Создание original только после блокировок. Pipeline не импортирует AnalysisResult вне этой транзакции; legacy-восстановление проходит те же условия.
4. **Title писал результат модели без повторной проверки.** Вызов модели вне транзакции. Перед записью или fallback: исполнитель всё ещё может публиковать Job, заголовок всё ещё допускает автозамену. Ручное переименование сохраняется. Потеря lease не меняет Reel. Ошибка title-модели при своём lease даёт fallback и не роняет успешную расшифровку.
5. **Активные POST создавали новый legacy-разбор.** `POST review` / `POST questions` → 410. `POST compare` `runAi=true` → 410. GET истории сохранены.

## Проверки этого кандидата

- `npx tsc --noEmit` — ok
- `node scripts/test-postgres.cjs --media` — **11/11**
  - `media path: STT without analyze, title fallback, replay, lease, retired POSTs`
  - `media path: lease barriers stop lost-owner publish and keep author title`
  - `pipeline recovery: STT saved, replay skips STT, lease, exhausted, versions`
  - `thought media create validates, is idempotent, and does not mint a script after STT`
  - шесть тестов `tests/v06-loop.test.ts` (в т.ч. late STT, explicit working, completed, edit/frozen selected)

Полный `test:postgres` в этом проходе не запускался. UI smoke desktop/390 на тестовой БД не гонялся. Отдельный дефект upload не воспроизводился и не объявляется исправленным.

## Ограничения

Не принят. Не тронуты probe, live-схема, SQL recreate, Prisma-схема, платные модели, I01/I06/I07/I08, мост памяти. Приёмка не записывается. После закрытия замечаний останутся один UI smoke (mock STT/AI, desktop и 390) и один полный `test:postgres` на итоговом продуктовом SHA.
