# Live-схема: пересоздание таблиц приложения

Status: **стратегия принята** (28.09.2026). Удаление и `migrate deploy` **не выполнены**.

Решение: в том же проекте Supabase очистить только таблицы Prisma и заново применить миграции репозитория `0_postgres_baseline` → `9_v03_dialogue_exec_lease`, чтобы появилась настоящая `_prisma_migrations`. Auth (`auth.users`), `public.profiles`, триггер создания профиля и Storage **не трогать**. Старое содержимое приложения не переносить.

Карта: [`../ROADMAP.md`](../ROADMAP.md). Это не приёмка V04 и не принятие всей карты.

## Свежая сверка (28.09.2026, только чтение)

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

## Порядок (ещё не начат с шага дампа)

1. Дамп / backup проекта **до** DELETE/DROP. Повторить счётчики в тот же день, что и удаление.
2. `DROP TABLE` только 19 Prisma-таблиц (CASCADE внутри этого набора). Не `DROP SCHEMA public`. `ThoughtState` сейчас нет — не искать её как обязательную. Проверить FK ещё раз в момент удаления.
3. Сохранить `auth.users`, `public.profiles`, `handle_new_user` / `on_auth_user_created`, политики `profiles`, bucket `vocal-private`. Не переигрывать Supabase-миграцию `vocal_app_tables`.
4. На пустой области приложения: `prisma migrate deploy` по цепочке `0`…`9` (появится `_prisma_migrations` и `ThoughtState`, колонки 8–9). Не `migrate resolve` под уже существующие таблицы.
5. Сверить схему, RLS/права, вход Auth, короткий путь C00 на тестовом пользователе.

## Запреты

- Не `migrate deploy` / `migrate resolve` поверх нынешних 19 таблиц.
- Не удалять `profiles` и не чистить `auth.users` «заодно».
- Не объявлять live-схему принятой до шага 5.
- Не стартовать V04 из этого документа.
