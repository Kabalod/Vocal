# Отчёт после этапа для проверки через GitHub

## Идентификация

- Этап: 1 — карточки роликов и дубли в базе
- Репозиторий: Kabalod/Vocal
- Ветка: feat/personal-mvp-01-reels-and-takes
- BASE_SHA (до изменений): 89c52c52160f4ac2ce8155f6ece178bc259c7092
- HEAD_SHA (после изменений): `3659cd15edf207c458a7fd3d70bb746108881cfc` (коммит реализации этапа 1); итоговый HEAD — вершина ветки после исправления ревью
- Ссылка на ветку: https://github.com/Kabalod/Vocal/tree/feat/personal-mvp-01-reels-and-takes
- Ветка отправлена в GitHub: да (после `git push -u origin HEAD`, без force)
- Предыдущий этап принят: да, этап 0 на `89c52c52160f4ac2ce8155f6ece178bc259c7092`

## Реализовано

- Карточка Reel и дубль Take в SQLite; Job опционально связан с Take (несколько Job на один Take позже).
- Старые загрузки перенесены: по одной карточке и Take №1 на каждую Job, без склейки идей.
- Повтор backfill не создаёт дубликаты.
- Текстовый дубль без видео и без Job.
- Явный выбор финального дубля с проверкой принадлежности карточке.
- Архивация меняет статус, не удаляет takes/jobs/медиа.
- Ключ идемпотентности отличает повтор запроса от новой загрузки того же файла.
- Новая загрузка видео создаёт Reel + Take и связывает Job (без вызова модели). Повтор Job по-прежнему тот же Job.

Экран «Мои ролики» не делался (этап 2).

## Файлы

| Путь | Изменение и причина |
|---|---|
| prisma/schema.prisma | Reel, Take, Job.takeId |
| prisma/migrations/20260907120000_init | baseline схемы db push |
| prisma/migrations/20260907121000_reels_and_takes | таблицы Reel/Take и колонка Job.takeId |
| prisma/migrations/migration_lock.toml | sqlite |
| scripts/migrate-existing-sqlite.ts | baseline --applied для старых БД |
| scripts/backfill-reels.ts | перенос Job → Reel+Take |
| scripts/db-counts.ts | сверка counts на копии |
| src/types/reel.ts | DTO и статусы, отдельно от JobStatus |
| src/lib/reels.ts | создание/обновление/архив/дубли |
| src/lib/serialize.ts | Reel/Take DTO без путей к медиа; JobDto без изменений |
| src/app/api/uploads/route.ts | новая загрузка сразу получает карточку и дубль |
| tests/reels-migration.test.ts | временная БД |
| package.json | migrate, backfill, test:reels |
| README.md | migrate deploy; существующая БД |
| docs/IMPLEMENTATION_STATUS.md | этап 0 принят, этап 1 на ревью |
| docs/reviews/STAGE_01.md | этот отчёт |

## Данные и миграции

- Требуемые команды для новой БД: `npx prisma migrate deploy`, затем seed.
- Для БД после db push: `npm run db:migrate:existing`, затем `npm run db:backfill-reels`.
- Как сохранены старые данные: Job/AnalysisResult не удалялись; INSERT в new_Job копирует прежние колонки; payload не менялся.
- Где находится локальная резервная копия (без содержимого): `%USERPROFILE%\Vocal-backups\stage01-2026-09-07-171257`
- Проверялось ли восстановление: да, копия совпала с живой БД до миграции (2/2/22).
- Проверялся ли повтор миграционного переноса: миграция на копии, затем на рабочей; backfill дважды на копии и на рабочей (второй проход created=0).

## Проверки

| Команда или ручной сценарий | Выполнено? | Результат | Ограничения |
|---|---|---|---|
| бэкап + restore counts | да | совпало | не git |
| migrate+backfill на копии | да | 2 reel / 2 take, payload те же | временный файл |
| migrate+backfill на рабочей БД | да | то же | localhost |
| npm run test:reels | да | pass | временная БД, без Groq |
| npm run lint | да | ok | next lint deprecated |
| npm run typecheck | да | исходные ошибки | не этап 1 |
| npm run build | да | падает на score-analyz.ts:93 | исходная |
| UI «Мои ролики» | нет | этап 2 | |
| STT / Groq | нет | не вызывались | |

- Исходные ошибки проекта: TS1501 `scripts/score-analyz.ts:93`; strict-ошибки `src/lib/analyze.ts`.
- Новые ошибки этапа: нет (после правки импортов в тесте без `.ts`).
- Платные вызовы использовались: нет
- Какие проверки требуют компьютера пользователя: экран списка роликов (этап 2), живая загрузка файла

## ИИ

- Какие действия реально вызывают модель: по-прежнему STT и LLM у Job; создание Reel/Take/архив/backfill — нет.
- Какие действия проверены без ключа: миграция, backfill, test:reels, lint, typecheck, build.
- Какие версии входов сохраняются: AnalysisResult.payload как был; Job id те же.
- Что происходит при ошибке или повторе: retry Job не создаёт Take; повтор backfill пустой; одинаковый idempotencyKey возвращает тот же Take.

## Осталось

- Невыполненные условия готовности: внешнее ревью этапа 1.
- Известные проблемы: typecheck/build красные из‑за исходных ошибок; нет UI карточек.
- Отклонения: затронут `uploads/route.ts` (не было в списке файлов этапа), чтобы новые Job не оставались без Take. Тесты на `node:test` + tsx, без новой зависимости test-раннера.

## Запрос ревьюеру

Проверь BASE_SHA..HEAD_SHA: схему, baseline, транзакции backfill, уникальность номеров, сохранность Job/AnalysisResult/медиа.
Не считай этап принятым только на основании этого отчёта.

## После замечаний

- Замечание: повтор запроса с jobId отклонялся JOB_HAS_TAKE до поиска по ключу.
- Исправление: сначала idempotencyKey; уже привязанная к этому Take Job возвращается. Тест: два запроса с jobId+ключом — один Take.
- Замечание: гонка могла перепривязать Job через connect вне атомарного условия.
- Исправление: `updateMany` только при `takeId = null`; при count ≠ 1 транзакция откатывает дубль. Тест: одна Job, две карточки.
- Замечание: baseline по отсутствию `_prisma_migrations` для любой SQLite.
- Исправление: сверка старой схемы; пустая БД — `migrate deploy`; иное — стоп без resolve.
- Замечание: нет теста переноса заполненной старой БД; payloadHashes только длина.
- Исправление: сценарий db-push SQL → данные → baseline+migrate → backfill×2, точный payload, sha256, `PRAGMA foreign_key_check`. В `db-counts.ts` — sha256.
- SQL уже применённых миграций не менялся.
- Новый commit SHA: вершина ветки после push
- Повторная проверка: `npm run test:reels` 4/4; lint ок; typecheck/build — только исходные ошибки
