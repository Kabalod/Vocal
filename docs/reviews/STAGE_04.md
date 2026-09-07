# Отчёт после этапа для проверки через GitHub

## Идентификация

- Этап: 4 — версии расшифровки и надёжная обработка
- Репозиторий: Kabalod/Vocal
- Ветка: feat/personal-mvp-04-transcripts-and-jobs
- BASE_SHA (до изменений): 1d8f26c1cb3d137f133fc8f35b0dfd7eac8302be
- HEAD_SHA (после изменений): `HEAD_SHA`
- Ссылка на ветку: https://github.com/Kabalod/Vocal/tree/feat/personal-mvp-04-transcripts-and-jobs
- Ветка отправлена в GitHub: да, без force push (если push прошёл)
- Предыдущий этап принят: да, этап 3 на `1d8f26c1cb3d137f133fc8f35b0dfd7eac8302be`

## Реализовано

Успешное распознавание сразу сохраняется как исходная версия расшифровки дубля, даже если последующий LLM-разбор падает. Повтор такой задачи не вызывает STT снова. Правка текста создаёт новую версию; исходник и его сегменты не переписываются. Таймкоды в UI помечены как относящиеся к исходнику. Два захвата одной задачи не идут параллельно: активный lease отклоняет второй claim/retry. Перезапуск поднимает queued и зависшие converting/transcribing/analyzing без живого lease; задачи в `error` сами не стартуют. Исчерпание попыток даёт 409, новый Take не создаётся. Старый анализ при retry не стирается на экране Job.

## Файлы

| Путь | Изменение и причина |
|---|---|
| prisma/schema.prisma | TranscriptRevision, selectedTranscriptId, stage/attempts/lease у Job |
| prisma/migrations/20260907124000_transcripts_and_jobs | ADD TABLE/COLUMN без reset |
| src/lib/transcripts.ts | исходник, правки, импорт из payload, выбор версии |
| src/lib/jobs.ts | атомарный claim, heartbeat, recover без SQL-сравнения дат SQLite |
| src/lib/pipeline.ts | convert/STT/analyze; STT в БД до LLM; inject deps для тестов |
| src/instrumentation.ts | recoverUnfinishedJobs при старте Node |
| src/app/api/jobs/[id]/retry/route.ts | повтор сбойного этапа; busy/exhausted; без нового Take |
| src/app/api/takes/[id]/transcript/route.ts | список, правка, выбор версии |
| src/components/TranscriptEditor.tsx | правки и исходник в карточке ролика |
| src/components/ReelTakes.tsx | редактор расшифровки |
| src/components/JobView.tsx | retry не обнуляет старый analysis |
| tests/pipeline-recovery.test.ts | mock STT/LLM, lease, exhausted, импорт payload |
| docs/IMPLEMENTATION_STATUS.md | этап 3 принят; этап 4 на ревью |
| docs/PERSONAL_MVP.md | состояние после этапа 4 |

## Данные и миграции

- Требуемые команды: `npx prisma migrate deploy` (уже применено локально)
- Как сохранены старые данные: только ADD COLUMN/TABLE; payload AnalysisResult не менялся
- Где находится локальная резервная копия (без её содержимого): `%USERPROFILE%\Vocal-backups\stage04-2026-09-07-192344`
- Проверялось ли восстановление: копия backup совпала по SHA256 с исходным файлом до миграции
- Проверялся ли повтор миграционного переноса: хеши payload AnalysisResult live vs backup-копии совпали (2 записи)

## Проверки

| Команда или ручной сценарий | Выполнено? | Результат | Ограничения |
|---|---|---|---|
| `npm run test:reels` | да | 20/20 | временные SQLite, mock провайдер |
| `npm run lint` | да | exit 0 | — |
| `npm run typecheck` | да | исходные ошибки analyze.ts и score-analyz.ts | новые ошибки этапа закрыты |
| `npm run build` | нет | — | не запускался |
| Браузер / редактор расшифровки | нет | — | только код и автотесты API |

- Исходные ошибки проекта: `src/lib/analyze.ts` (strict Zod), `scripts/score-analyz.ts` TS1501
- Новые ошибки этапа: нет после правок leaseUntil/prefer-const
- Платные вызовы использовались: нет
- Какие проверки требуют компьютера пользователя: живой Groq, плеер, ручная правка в UI, restart dev-сервера с зависшей задачей

## ИИ

- Какие действия реально вызывают модель: STT (`transcribeAudio`) и LLM (`analyzeSpeech`) в `processJob`, если нет исходной расшифровки / при анализе
- Какие действия проверены без ключа: claim/retry/версии/импорт payload; пайплайн с mock
- Какие версии входов сохраняются: original (stt / manual / payload_import) и edit (manual); сегменты только у original
- Что происходит при ошибке или повторе: STT уже в БД → retry со стадии analyze; STT не был → retry снова convert/STT; lease живой → 409; attempts >= max → 409; старый AnalysisResult не удаляется

## Осталось

- Невыполненные условия готовности: нет по автотестам; ручной restart/UI не гонялись
- Известные проблемы: сравнение DateTime в SQLite where ненадёжно — claim/recover проверяют lease в JS + optimistic `updateMany` по attempts/leaseOwner
- Отклонения от плана и причины: Redis нет, как и требовалось; heartbeat обновляет lease на смене стадии, отдельный таймер не крутится; массовый backfill только ленивый при чтении/пайплайне, не отдельный скрипт; этап 5 не начинался

## Запрос ревьюеру

Проверь изменения BASE_SHA..HEAD_SHA и соответствие инструкции этапа.
Укажи блокирующие ошибки отдельно от необязательных улучшений.
Не считай этап принятым только на основании этого отчёта.

## После замечаний

- Замечание:
- Исправление:
- Новый commit SHA:
- Повторная проверка:
