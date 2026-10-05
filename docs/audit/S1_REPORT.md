# S1 (I07-A) — шлюз AI/STT: отчёт

Статус: **кандидат**, не приёмка. BASE = `0066469` (ветка `fix/c00-live-action-shape`). Ветка этапа: `feat/s1-ai-gateway`.
Закрывает п. 4–9 аудита `AUDIT_2026-10-05.md` в объёме кода; живая модель не запускалась.

## Что сделано

- `src/lib/ai/gateway.ts` — единый серверный шлюз:
  - `gatewayComplete(complete, args)` — бюджет на владельца → дедлайн операции → учёт; вызывается во всех 5 чат-путях;
  - `meteredTranscribe(path, impl, {seconds})` — бюджет секунд STT → дедлайн → строка учёта (успех и ошибка);
  - `transcribeVoiceOnce(...)` — голос → текст один раз на `idempotencyKey`, лимиты размера/длины.
- `src/lib/ai/usage-guard.ts` — лимиты включены по умолчанию (200 000 токенов, 3600 с STT в сутки на `ownerUserId`); `0` отключает; STT-строки не считаются как чат-токены.
- `src/lib/groq.ts`, `ai/complete.ts`, `stt.ts` — таймаут одной попытки (чат 45 с, STT 120 с вместо 10 мин), retry ≤3, `withRetry` не спит дольше дедлайна; файловый `consumeAiCallBudget` убран из `complete.ts` (xAI идёт через тот же шлюз).
- `src/lib/pipeline.ts` — STT идёт через `meteredTranscribe`; heartbeat lease каждые `lease/3` во время STT и title (`withLeaseHeartbeat`). `src/lib/jobs.ts`: `jobLeaseMs()` (env `VOCAL_JOB_LEASE_MS` только для тестов).
- `src/lib/profile-dialogue.ts` — `failStaleProfileProcessing`: «Собираю портрет…» старше 3 мин при повторе того же ключа закрывается ошибкой (семантика V04 не менялась).
- Тесты: `tests/i07-gateway.test.ts` (12), `tests/runner-coverage.test.ts` (2); `stale ready reply` переписан в форме V04; runner: добавлены `v04-01-union`, `v04-02-envelope`, `v04-03-slice`, `v05-generate-keys`, `c00-classify-skip-model`, `p01-6-2-final`, `landing`; live-тесты явно в `liveModelTests` (вне любого запуска); флаг `--i07`.

## Таблица 7 путей: было / стало

| Путь | Бюджет | Учёт | Таймаут / retry | Идемпотентность |
|---|---|---|---|---|
| Диалог мысли (`dialogue.ts`) | было: проверка только при новом сообщении, считались только `done`; стало: + проверка перед каждым вызовом модели | было: своя строка `AiCall`; стало: она же + строка `dialogue_failed` с оценкой токенов при сбое | было: 10 мин × до 4 попыток; стало: 45 с попытка, 90 с операция, ≤3 попыток | без изменений (`turnKey`, lease) |
| C00-классификатор | было: нет; стало: есть | было: нет; стало: строка `c00_classify` | как выше | без изменений |
| Диалог профиля | как у диалога мысли | как у диалога мысли | как выше | + зависший processing закрывается при повторе ключа |
| Сценарий V05 | как у диалога мысли | как у диалога мысли | как выше | без изменений |
| Название мысли | было: нет; стало: есть | своя строка `thought_title` (+ `_failed`) | как выше; heartbeat lease на время title | без изменений |
| STT конвейера | было: нет; стало: секунды/сутки | было: нет; стало: строка `stt` (секунды в `promptTokens`) | было: 10 мин × 5; стало: 120 с попытка, 300 с операция, ≤3; heartbeat lease | `Job` + lease как раньше |
| STT голоса (мысль и профиль) | было: нет; стало: секунды/сутки | строка `stt` + строка `stt_voice_key` (расшифровка по ключу) | как STT конвейера | было: ffmpeg + STT до проверки ключа; стало: ключ первым, повтор бесплатный; лимит 15 МБ / 180 с |

## Новые переменные окружения

`VOCAL_DAILY_TOKEN_LIMIT` (по умолчанию 200000), `VOCAL_DAILY_STT_SECONDS` (3600), `VOCAL_AI_TIMEOUT_MS` (90000), `VOCAL_AI_ATTEMPT_TIMEOUT_MS` (45000), `VOCAL_STT_TIMEOUT_MS` (300000), `VOCAL_STT_ATTEMPT_TIMEOUT_MS` (120000), `VOCAL_MAX_VOICE_MB` (15), `VOCAL_MAX_VOICE_SECONDS` (180), `VOCAL_JOB_LEASE_MS` (только тесты). Описаны в `.env.example`. `VOCAL_AI_DAILY_CALL_LIMIT` больше не действует в `complete.ts` (модуль `ai-call-budget.ts` остался только для `scripts/xai-smoke.ts`).

## Миграции

Не потребовались и не применялись. Ограничение: секунды STT хранятся в `AiCall.promptTokens` у `kind = "stt"` (отдельной колонки нет); бюджет чата исключает этот `kind`.

## Проверки (выполнены на среде разработки: Node 22, встроенный Postgres 127.0.0.1, не Docker)

Прогон шёл напрямую `tsx --test --test-concurrency=1` на тех же файлах, что и `test:postgres`, а не через `scripts/test-postgres.cjs` (Docker в среде нет).

- `npx tsc --noEmit` — ок.
- Весь список `dbTests` (66 файлов): **293 pass / 0 fail**, ~7 мин 16 с.
- Файлы, которые есть только в `--reels`, но не в `dbTests` (25 файлов): **107 pass / 0 fail**.
- `next build --no-lint` с `VOCAL_UI_TEST_DB=1` и локальной БД — ок. **`next build` и `next lint` с проверкой lint падают** на 13 ошибках `react-hooks/rules-of-hooks` в `src/components/VocalAppShell.tsx`; файл S1 не менял, ошибки существовали до S1. Для CI (S4) их нужно исправить отдельно.
- Мутационная проверка: если убрать `FOR UPDATE` в `commitV04ProfileTurn`, тест `V04 commits are serialized by the CreatorProfile lock` падает; с блокировкой проходит. Прежний `v04-05-concurrency` без блокировки НЕ падал (не доказывает гонку).
- В ходе прогона исправлены тесты `c00-classify-signal` (теперь с БД: шлюз пишет учёт классификатора).

## Что не проверялось / риски

- `scripts/test-postgres.cjs` целиком (Docker-запуск) не запускался; флаг `--i07` не прогонялся через runner.
- Проверка бюджета не атомарна: два параллельных вызова одного владельца могут оба пройти порог.
- Начало суток — по локальному времени сервера (как было).
- Долг «stale ready reply» в ROADMAP: условие закрытия (тест падает без `FOR UPDATE`) выполнено, строку ROADMAP не менял без приёмки. Остальные тесты `profile-dialogue.test.ts` со старым форматом ответа (`patch`/`kind`: ~395, 450, 463, 532, 545, 735) проходят из-за ошибки разбора; не переписаны.
- Порядок шага 0: контракт I07 здесь вместе с отчётом, не отдельным docs-коммитом до кода.
- Моки не доказывают качество живой модели.
