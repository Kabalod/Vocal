# Отчёт после этапа для проверки через GitHub

## Идентификация

- Этап: 3 — материалы, плеер и перезаписи
- Репозиторий: Kabalod/Vocal
- Ветка: feat/personal-mvp-03-take-media
- BASE_SHA (до изменений): b08929b1e1328e75c7e9d3bf6ecf1697dce46daa
- HEAD_SHA (после изменений): `4c7879eb25fc8315fa68500dafedfdf3ee1c3ba5`
- Ссылка на ветку: https://github.com/Kabalod/Vocal/tree/feat/personal-mvp-03-take-media
- Ветка отправлена в GitHub: да, без force push
- Предыдущий этап принят: да, этап 2 на `b08929b1e1328e75c7e9d3bf6ecf1697dce46daa`

## Реализовано

В карточке можно добавить несколько попыток: видео, аудио или текст. Новый дубль не затирает старый и не становится финальным сам. Текст пишется в `bodyText` без фиктивного видео (на этапе 4 уйдёт в версии расшифровки). Загрузка с `reelId` не создаёт Job и не вызывает Groq. Плеер отдаёт файл с Range; mov/mkv — честный отказ и скачивание. Повтор той же Idempotency-Key не плодит дубль. Клиентский filesystem path отклоняется. Сбой записи помечает `mediaStatus=failed` и удаляет недописанный файл.

Старый POST `/api/uploads` без `reelId` по-прежнему создаёт Job и ставит анализ в очередь — для экрана `/jobs`. Новая карточка этим путём из UI «Мои ролики» не ходит.

Камера в браузере не делалась.

## Файлы

| Путь | Изменение и причина |
|---|---|
| prisma/schema.prisma | mediaStatus, storedPath, mime, bodyText у Take |
| prisma/migrations/20260907123000_take_media | ADD COLUMN без пересборки Job |
| src/lib/takes.ts | загрузка, PATCH заметки, путь файла |
| src/lib/take-media.ts | Range и безопасный путь |
| src/lib/take-playback.ts | что браузер умеет открыть |
| src/lib/storage.ts | пути take-*, проверка корня storage |
| src/app/api/reels/[id]/takes/route.ts | список и текстовый дубль |
| src/app/api/takes/[id]/route.ts | GET/PATCH, без path от клиента |
| src/app/api/takes/[id]/media/route.ts | выдача файла |
| src/app/api/uploads/route.ts | привязка к reelId без ИИ |
| src/app/api/reels/[id]/route.ts | PATCH selectedTakeId |
| src/components/TakeList.tsx | нумерация, финальный, заметка |
| src/components/TakePlayer.tsx | видео/аудио/текст, таймкод |
| src/components/TakeUploadDropzone.tsx | Загрузка в карточку без ИИ |
| src/components/UploadDropzone.tsx | без изменений смысла: старый путь /jobs |
| src/components/ReelTakes.tsx | сборка экрана |
| tests/reels-takes.test.ts | API без Groq |
| docs/IMPLEMENTATION_STATUS.md | этап 2 принят, этап 3 на ревью |
| docs/reviews/STAGE_03.md | этот отчёт |

## Данные и миграции

- Требуемые команды: `npx prisma migrate deploy`
- Как сохранены старые данные: только новые колонки Take с default; Job/payload не трогались
- Где находится локальная резервная копия (без содержимого): `%USERPROFILE%\Vocal-backups\stage03-2026-09-07-184358`
- Проверялось ли восстановление: SHA256 бэкапа совпал с живой БД до migrate; после migrate копия бэкапа и живая БД — те же 2 Job / 2 AnalysisResult и те же payload hashes
- Проверялся ли повтор миграционного переноса: migrate deploy на рабочей один раз; в тестах — пустая БД и сценарий db-push + две миграции

## Проверки

| Команда или ручной сценарий | Выполнено? | Результат | Ограничения |
|---|---|---|---|
| бэкап SHA256 | да | совпал с живой до migrate | не git |
| npm run test:reels | да | 19/19 | без браузера; гонка загрузки и backfill mp4 |
| npm run lint | да | ok | next lint deprecated |
| npm run typecheck | да | исходные ошибки | не этап 3 |
| npm run build | нет | — | не гонялся в этом этапе; ранее падал на score-analyz.ts |
| браузер / плеер / перемотка | нет | — | компьютер пользователя |
| STT / Groq | нет | не вызывались | загрузка в карточку Job не создаёт |

- Исходные ошибки проекта: TS1501 `scripts/score-analyz.ts:93`; strict в `src/lib/analyze.ts`
- Новые ошибки этапа: нет (lint)
- Платные вызовы использовались: нет
- Какие проверки требуют компьютера пользователя: открыть карточку, загрузить mp4 и mkv, перемотка, текстовый дубль, перезапуск страницы

## ИИ

- Какие действия реально вызывают модель: по-прежнему STT/LLM у Job; загрузка в карточку и текст — нет
- Какие действия проверены без ключа: test:reels, lint
- Какие версии входов сохраняются: AnalysisResult.payload как был
- Что происходит при ошибке или повторе: повтор Job не создаёт Take; повтор загрузки с тем же ключом возвращает тот же Take

## Осталось

- Невыполненные условия готовности: внешнее ревью; ручной плеер не гонялся
- Известные проблемы: typecheck/build красные из‑за этапа 0
- Отклонения: `VOCAL_STORAGE_ROOT` для тестов; старый upload без reelId оставлен для /jobs; текстовое поле на Take до этапа 4

## Запрос ревьюеру

Проверь BASE_SHA..HEAD_SHA, медиа и Range, принадлежность, атомарность загрузки, отсутствие лимита числа попыток, что новая загрузка в карточку не вызывает модель.
Не считай этап принятым только на основании этого отчёта.

## После замечаний

- Замечание: pending не держался как эксклюзивная запись; параллельный повтор с тем же ключом мог писать тот же файл и пометить Take failed после чужого успеха.
- Исправление: createTake по-прежнему пишет mediaStatus/originalName/mimeType; запись файла только после атомарного claim (`updateMany` pending/failed + storedPath null). Второй запрос при pending ждёт результат, не пишет. Сбой claimer → failed и unlink только своего dest.
- Замечание: у backfill Take originalName=null, браузерный плеер выключен при hasFile.
- Исправление: DTO и media берут originalName/MIME с Job; backfill копирует их на Take. Тест old.mp4 + Range.
- Новый commit SHA: будет записан после коммита
- Повторная проверка: `npm run test:reels`; браузер не гонялся. Этап 4 не начинался.
