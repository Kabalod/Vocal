# Медиа-путь — отчёт кандидата

Status: **кандидат, не принят**. V00–V07 не переоткрыты. I06, I07, I08 и запуск приложения не закрыты.
BASE: `3206fe4ca6849aced92ee5a554cde0f72f284ca3`.

## Факт → изменение → проверка

1. **На BASE `processJob` после STT вызывал `analyzeSpeech` и `ensureAutomaticTakeComparison`.** Теперь после original/selected и title Job завершается. Scoring, coach, Review, Question, CompareResult и ScriptVersion как побочный эффект STT не создаются. Проверка: `tests/media-path.test.ts`, обновлённый `pipeline-recovery`.
2. **Повтор и stage=analyze с уже сохранённой original снова шли в LLM.** Повтор использует original, STT не вызывается, legacy-анализ не стартует. Attempts и lease сохранены; `completeJob`/`fail` пишут только со своим `leaseOwner`.
3. **Ошибка title роняла бы смысл готовности.** Title ловится внутри `applyThoughtMediaFromTranscript`; fallback из расшифровки; материал остаётся. Проверка: title model throw + доступный original.
4. **Активные POST создавали новый legacy-разбор.** `POST /api/takes/:id/review` и `POST /api/reels/:id/questions` → 410. `POST compare` с `runAi=true` → 410. GET истории и текстовый diff сохранены. Кнопки создания в UI сняты. `AutoTakeCompare` больше не обещает автосравнение.

## Оставшийся долг

Адресные проверки кандидата: `npx tsc --noEmit` ok; `node scripts/test-postgres.cjs --media` — 10/10. Полный `test:postgres` — после закрытия замечаний на итоговом SHA. UI smoke desktop/390 на локальной тестовой БД в этом коммите не гонялся. Отдельный дефект upload в этом проходе не воспроизводился. I07 (все AI-пути, удаление), I06, I08, мост — отдельные статусы.
