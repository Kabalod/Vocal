# PostgreSQL

Единственный Prisma provider приложения и тестов — `postgresql`. Схема: `prisma/schema.prisma`.

| Переменная | Назначение |
| --- | --- |
| `DATABASE_URL` | runtime / pooler |
| `DIRECT_URL` | direct host для миграций |
| `TEST_DATABASE_URL` | только локальный тестовый Postgres |

`postinstall` и `db:generate` выполняют `prisma generate`.

Тесты: `npm run test:postgres` поднимает `postgres:16-alpine` (`vocal-test-postgres`) и удаляет контейнер в `finally`.

Не применять `migrate deploy` к Supabase без внешней приёмки `docs/db/DB00_DRIFT_REPORT.md`.
