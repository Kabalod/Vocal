# Database migrations

Текущий контур: PostgreSQL only. Baseline: `prisma/migrations/0_postgres_baseline`.

Скрипты переноса SQLite → Postgres удалены в DB00. Если нужен старый порядок работ, это historical snapshot в `docs/reviews/STAGE_*.md` и `docs/auth/AUTH_STAGE_REPORT.md` — они описывают прошлое, не текущую команду.

Живая Supabase schema не меняется этим этапом. См. `docs/db/DB00_DRIFT_REPORT.md`.
