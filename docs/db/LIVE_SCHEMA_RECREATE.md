# Live-схема: пересоздание таблиц приложения

Status: **принята 29.09.2026**. Пересоздание **применено** 28.09.2026 (DROP 19 таблиц Prisma + SQL миграций `0`…`9` + `_prisma_migrations`). Шаг 5 закрыт 29.09.2026: вход, тестовые мысли, ответ модели; SQL-сверка таблиц `0`…`9`, Auth/`profiles`/Storage на месте. Это **не** приёмка V04 и не принятие [`../ROADMAP.md`](../ROADMAP.md).

Решение: в том же проекте Supabase очистить только таблицы Prisma и заново применить миграции репозитория `0_postgres_baseline` → `9_v03_dialogue_exec_lease`, чтобы появилась настоящая `_prisma_migrations`. Auth (`auth.users`), `public.profiles`, триггер создания профиля и Storage **не трогать**. Старое содержимое приложения не переносить.

Карта: [`../ROADMAP.md`](../ROADMAP.md). Это не приёмка V04 и не принятие всей карты.

## Сверка до DROP (28.09.2026, только чтение)

Проект live тот же (`zfbiyyhedhqdgrxxajrj`). Старый [`DB00_DRIFT_REPORT.md`](./DB00_DRIFT_REPORT.md) сверял baseline и **не** подтверждает состояние после V02–V03.

| Объект | Факт |
|---|---|
| Таблицы `public` | 20: 19 Prisma из baseline + `profiles`. **`ThoughtState` нет** |
| `_prisma_migrations` | **нет** |
| `AiCall.turnKey` / `execLeaseUntil` | **нет** (миграции 8–9 не на live) |
| История Supabase CLI | `private_media_bucket`, `vocal_app_tables` — не Prisma |
| `auth.users` / `profiles` | 4 / 4 |
| `storage.buckets` | `vocal-private` (private), объектов **0** |
| FK Prisma → `profiles` / `auth` | **нет**. Единственный мост: `profiles.id` → `auth.users.id` |
| Триггер профиля | `auth.users` / `on_auth_user_created` → `handle_new_user` |

Строки приложения (тестовый объём):

| Таблица | Строки |
|---|---|
| Reel | 7 |
| ThoughtCreateKey | 7 |
| Take | 7 |
| TranscriptRevision | 5 |
| ScriptVersion | 5 |
| DialogueThread | 5 |
| DialogueMessage | 19 |
| AiCall | 13 |
| ReelContextSnapshot | 3 |
| Job | 3 |
| Review | 2 |
| Question | 2 |
| CreatorProfile | 2 |
| AnalysisResult | 1 |
| Criterion | 22 |
| ProfileRevision, Answer, ScriptDraft, CompareResult | 0 |

`Criterion` — каталог, не авторский контент. После recreate таблица из baseline будет пустой; посев критериев — отдельная проверка, не импорт старых мыслей.

## Что сделано 28.09.2026

- Дамп счётчиков и списка таблиц (не полный `pg_dump` тел строк). Тестовые строки приложения удалены вместе с таблицами.
- `DROP` 19 таблиц Prisma. `public.profiles` (4), `auth.users` (4), `on_auth_user_created`, bucket `vocal-private` на месте.
- Накаты `0`…`9` текстом миграций репозитория. Появились `ThoughtState`, `AiCall.turnKey`, `execLeaseUntil`.
- `_prisma_migrations`: 10 записей `0_postgres_baseline` … `9_v03_dialogue_exec_lease`. Checksum — SHA-256 файлов в worktree на момент записи. Не `migrate resolve` поверх старых таблиц.
- RLS + FORCE на таблицах приложения, без политик (как раньше: сервер Prisma / service_role). Advisor `rls_enabled_no_policy` — ожидаемо.
- `Criterion` пуст. `Reel` / `ThoughtState` = 0.

Шаг 5 (29.09.2026): вход под тестовым пользователем, создание мыслей, ответ в thought dialogue. SQL: 2 `Reel` / `ThoughtState`, 1 ход `DialogueMessage` user+assistant `done`, 1 `AiCall` `dialogue`/`done`; `auth.users` 4 = `profiles` 4; bucket `vocal-private`. Не стартовать V04 из этой приёмки.

## Запреты

- Не `migrate deploy` / `migrate resolve` поверх нынешних 19 таблиц.
- Не удалять `profiles` и не чистить `auth.users` «заодно».
- Повторный DROP 19 таблиц без новой сверки запрещён.
- Не стартовать V04 из этого документа.
