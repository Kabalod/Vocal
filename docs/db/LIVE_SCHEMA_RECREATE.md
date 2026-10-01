# Live-схема: пересоздание таблиц приложения

Status: **V04 live recreate применено 01.10.2026**. Живой smoke после recreate **принят 01.10.2026** (вход, мысль, start/skip/supplement профиля). Продукт V04 принят на `e8985243e85c73d181083428f80c8445fed29756`. Предыдущая приёмка live-схемы `0`…`9` была 29.09.2026.

## Пересоздание 01.10.2026 (V04, `sessionJson`)

Цель: пустые таблицы приложения и Prisma-история `0`…`10` на том же проекте `zfbiyyhedhqdgrxxajrj`. Данные приложения не переносились. `DROP SCHEMA public CASCADE` не выполнялся.

Сохранено:

| Объект | После recreate |
|---|---|
| Auth | `auth.users` = 4, триггер `on_auth_user_created` |
| `public.profiles` | 4 строки, RLS + FORCE |
| Storage | бакет `vocal-private` (private) |
| `private.handle_new_user` | на месте |

Удалены только app-таблицы Prisma (включая `_prisma_migrations`) и `public.vocal_bump_dialogue_head`. Затем SQL файлов репозитория в лексикографическом порядке Prisma: `0`, `1`, `10_v04_profile_session`, `2`…`9`.

`prisma migrate deploy` на непустом `public` (**остался `profiles`**) вернул **P3005**. Схема собрана `prisma db execute --file` по тем же migration.sql, затем `INSERT` в `_prisma_migrations` с SHA-256 файлов. После этого `prisma migrate status`: Database schema is up to date (11 finished). Checksums `0`…`9` совпали с live до DROP; `10_v04_profile_session` = `e3a161fe…`.

На `_prisma_migrations` после создания: ENABLE + FORCE RLS, `REVOKE` у `anon`/`authenticated`.

Проверка истории (01.10.2026, чтение): 11 строк `0_postgres_baseline` … `10_v04_profile_session` (все finished); колонка `CreatorProfile.sessionJson` есть. Сразу после recreate: `Reel` / `CreatorProfile` / `ProfileRevision` / `Criterion` = 0 (посев критериев — старт приложения, не миграция).

SQL-сверка схемы **не** заменяет smoke UI (вход, мысль, диалог профиля).

Живое исполнение **01.10.2026**: сессия на приложении с Prisma Client и live-подключением; студия; мысль с `ownerUserId` = `auth.users.id`; start диалога профиля пишет `sessionJson` без `ProfileRevision`; повторная загрузка сохраняет сессию; skip/supplement без ошибок и без лишних ревизий. Вызов модели в этот smoke не входил. Это не старт V05 / I01.

## Запись 28–29.09.2026 (`0`…`9`)

Решение тогда: очистить только таблицы Prisma и накатить `0_postgres_baseline` → `9_v03_dialogue_exec_lease`. Auth (`auth.users`), `public.profiles`, триггер и Storage не трогать. Старое содержимое приложения не переносить.

Карта: [`../ROADMAP.md`](../ROADMAP.md) (порядок работ **принят** 29.09.2026). Приёмка live-схемы не была приёмкой карты и не является приёмкой V04.

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

На 28.09.2026 продукт live-схемы ещё **не** принимался: не было входа и короткого C00 на тестовом пользователе.

## Приёмка 29.09.2026

- Вход под тестовым пользователем, создание мыслей, ответ модели в thought dialogue.
- SQL: миграции Prisma `0`…`9` finished; есть `ThoughtState`, `AiCall.turnKey` / `execLeaseUntil`; FK Prisma → `profiles` нет.
- Auth сохранён: `auth.users` 4 = `profiles` 4, триггер `on_auth_user_created`, bucket `vocal-private`.
- На момент сверки: 2 `Reel` / `ThoughtState`, 1 ход `DialogueMessage` (user `text` + assistant `question`, оба `done`), 1 `AiCall` `dialogue`/`done`.

Live-схема **принята** 29.09.2026. Это не V04 и не принятие [`../ROADMAP.md`](../ROADMAP.md). Не стартовать V04 из этой приёмки.

## Запреты

- Не `migrate deploy` / `migrate resolve` поверх живых таблиц «чтобы догнать» историю.
- Не удалять `profiles` и не чистить `auth.users` «заодно».
- Повторный DROP app-таблиц без новой явной команды запрещён.
- Не стартовать V05 / I01 из этой записи.
