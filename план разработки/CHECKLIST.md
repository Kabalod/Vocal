# Vocal — сводный checklist

Отмечать `[x]` только после проверки результата. Для блокера указать короткую причину и ссылку на issue/commit, если они есть.

## 00 — подготовка

- [ ] Прочитан канонический набор и зафиксирован приоритет документов.
- [ ] Инвентаризированы routes, data models, API, scripts и baseline failures.
- [ ] Все продуктовые правила включены в traceability matrix.
- [ ] Найдена точная ветка `SCRIPT_REQUIRED`.
- [ ] Зафиксированы rollback и миграционная дисциплина.
- [ ] Пользователь принял этап 00.

## 01 — P00 оболочка

- [ ] Токены с точными значениями находятся в одном общем слое.
- [ ] Inter используется для UI, Literata для контента/сценария с fallback.
- [ ] Глобально только «Мысли / Профиль», active state корректен.
- [ ] Базовые primitives переиспользуемы и доступны с клавиатуры.
- [ ] `/reels` и `/profile` работают как раньше; API/data/media не менялись.
- [ ] Нет overflow на 320/360/390/desktop; touch targets ≥44×44.
- [ ] Пользователь принял этап 01.

## 02 — P01 список мыслей

- [ ] Реальные loading/empty/error+retry/loaded states.
- [ ] Только три канонических статуса.
- [ ] Переход по реальному id и возврат работают.
- [ ] Create entry доступен без профиля.
- [ ] Пользователь принял этап 02.

### Ревизия P01 от 18.09.2026 — новый архив мыслей

- [ ] P01.1: диапазон дат, calendar facets и серверные тесты приняты агентом «Создание приложение».
- [ ] P01.2: URL-state, lazy loading, гонки и состояния ошибок приняты.
- [ ] P01.3: desktop sidebar/calendar/polaroid grid и reduced motion приняты.
- [ ] P01.4: mobile grid, bottom-sheet calendar и две зоны карточки приняты.
- [ ] Техдолг (не блокер P01.3): `tests/profile-dialogue.test.ts` — «stale ready reply cannot complete after a newer clarify» падает на SHA `4e1b847`; файлы профиля не менялись. Закрыть до общей релизной приёмки.
- [ ] P01.5: preview, быстрый диалог, запись дубля и возврат в архив приняты.
- [ ] Подтверждены три открытых решения из `02_P01_СПИСОК_МЫСЛЕЙ.md`.
- [ ] Итоговая ревизия P01 принята; приложены desktop/mobile screenshots.

## 03 — P02 новая мысль

- [ ] Success создаёт одну сущность с реальным id.
- [ ] Double submit защищён; error не теряет ввод; retry работает.
- [ ] Cancel/back не создаёт запись.
- [ ] List/cache корректны после reload.
- [ ] Нет profile guard.
- [ ] Пользователь принял этап 03.

## 04 — каркас студии

- [ ] `/reels/[id]` имеет loading/not-found/error/retry.
- [ ] Локально только «Дубли / Диалог / Сценарий».
- [ ] Active tab/deep link переживает reload и сохраняет id.
- [ ] Back и responsive/keyboard работают.
- [ ] Нет fake business data.
- [ ] Пользователь принял этап 04.

## 05 — P03–P05

- [ ] Диалог сохраняется и восстанавливается после reload.
- [ ] Text/voice send имеет pending/error/retry; voice reply не take.
- [ ] Proposal lifecycle подтверждён и защищён от дублей.
- [ ] Script versions/save/error/reload работают.
- [ ] Final script не меняет final take.
- [ ] Пользователь принял этап 05.

## 06 — P06–P09

- [ ] Нет permission/take до «Начать запись».
- [ ] На записи крупный сценарий, compact stage, AI chat отсутствует.
- [ ] Голос и upload подготовленного видео имеют полный lifecycle.
- [ ] Scriptless recording работает end-to-end; `SCRIPT_REQUIRED` закрыт тестом.
- [ ] Processing reload/retry не создаёт лишний take.
- [ ] AI сравнивает автоматически; ручного A/B UI нет.
- [ ] Final take и final script независимы во всех комбинациях.
- [ ] Пользователь принял этап 06.

## 07 — P10–P12

- [ ] Active/draft profile различимы.
- [ ] Questionnaire идёт по одному вопросу; voice answer не take.
- [ ] Unfinished/cancelled amend не меняет active AI portrait.
- [ ] Confirm атомарен, ошибки/повтор безопасны.
- [ ] Empty profile не блокирует мысль.
- [ ] Пользователь принял этап 07.

## 08 — старые маршруты

- [ ] Для каждого redirect есть action+save+error+return parity.
- [ ] Deep links/id/query/back и отсутствие loops проверены.
- [ ] Удалены только пользовательские entry points и доказанно мёртвый UI.
- [ ] API/data/admin/internal routes не удалены случайно.
- [ ] Rollback map готов.
- [ ] Пользователь принял этап 08.

## 09 — R1–R8 / P13–P16

- [ ] P13–P16 точно сопоставлены с каноном.
- [ ] R1 contracts/data invariants принят.
- [ ] R2 idempotency/races принят.
- [ ] R3 errors/reload/reconnect принят.
- [ ] R4 voice reliability принят.
- [ ] R5 media reliability/scriptless regression принят.
- [ ] R6 AI context isolation/confirmed profile принят.
- [ ] R7 canonical P16 export принят.
- [ ] R8 a11y/privacy/observability/regression принят.
- [ ] Логи не содержат secrets/raw media/full personal content.

## 10 — P17

- [ ] Полный E2E и все критические error/reload paths пройдены.
- [ ] Проверены все неподвижные продуктовые правила.
- [ ] Visual audit выполнен после функциональной приёмки.
- [ ] 320/360/390/desktop, keyboard, focus, labels, overflow проверены.
- [ ] Нет новых console/hydration/unhandled errors.
- [ ] Tests/lint/typecheck/build пройдены или blockers согласованы.
- [ ] Итоговый release handoff и rollback готовы.
- [ ] Пользователь принял P17.

## Общая дисциплина для каждого этапа

- [ ] Cursor сначала исследовал текущий repo и канонические документы.
- [ ] Scope не расширен; новые продуктовые функции не добавлены.
- [ ] Существующее полезное backend/data/API поведение сохранено.
- [ ] Использованы только реально существующие scripts из package.json/документации.
- [ ] Pre-existing blockers отделены от новых regressions.
- [ ] Просмотрен diff; секреты отсутствуют.
- [ ] Commit/push не выполнены без прямой команды.
- [ ] Записан concise handoff и rollback.
- [ ] Следующий этап не начат до review пользователя.

## Правило проверки

Каждый этап отмечается в чек-листе только после проверки агентом «Создание приложение». Колонки: сделано → на проверке → принято / правки.

## Статус проверки агентом

- [x] **01 P00 оболочка** — принято 2026-09-16 (ветка `feat/p00-shell`, локально). Замечания неблокирующие: rename `RECORDINGS_NAV`, копирайт «внутри записи»→«мысли», дубль mobile nav оставить до P01.
- [x] **02 P01 список мыслей** — принято 2026-09-16 (ветка ``feat/p01-thoughts-list``, ещё не закоммичено). Неблокирующе: studio ещё с legacy-статусами; визуал polaroid/sidebar — позже; ``archived→open`` только если архив просочится в UI.
- [x] **03 P02 новая мысль** — принято 2026-09-16 (ветка `feat/p02-new-thought`, незакоммичено). Текст-only форма, idempotency, без profile/tabs; голос/видео на карточке — позже; flaky profile-dialogue вне scope.
- [x] **04 Каркас студии** — принято 2026-09-16 (ветка `feat/studio-shell`, незакоммичено). URL `?tab=`, back «← Мысли», слоты с legacy-контентом; abort диалога и TakeComparison/ContextForm — на P03+.
- [x] **05 P03–P05 диалог/предложение/сценарий** — принято 2026-09-16 (ветка `feat/p03-p05-dialogue-script`, незакоммичено). Одна активная вкладка; голос → dialogue API; без TakeComparison/ContextForm; запись на «Дубли» остаётся слотом до P06.
- [x] **06 P06–P09 дубли/итоги** — принято 2026-09-16 (ветка `feat/p06-p09-takes`, незакоммичено). SCRIPT_REQUIRED снят с uploads; запись после кнопки; AutoTakeCompare; независимые итоги. Живой mic/STT не смотрели.
- [x] **08 старые маршруты** — принято 2026-09-16 (ветка `feat/legacy-routes`, незакоммичено). `/history→/reels`, `/jobs/[id]→мысль|404`; `/` и `/settings` без redirect до parity. Профиль (07) ещё впереди.
- [x] **09 R1 contracts/data** — принято 2026-09-16 (ветка `feat/r1-contracts`, незакоммичено). Mapping P13–P16 зафиксирован; независимые финалы, 3 статуса, scriptless, amend не публикует. R2 не стартовать до kickoff.
- [x] **09 R2 idempotency/races** — принято 2026-09-16 (ветка `feat/r2-idempotency`, незакоммичено). Очередь `enqueueByKey` на процесс; CAS финалов; script не двигает `updatedAt`. R3 не стартовать до kickoff.
- [x] **09 R3 recovery** — принято 2026-09-16 (ветка `feat/r3-recovery`, незакоммичено). Stale processing→error; job lease/exhaust recovery; silent studio refetch; takes retry; safe job log. R4 не стартовать до kickoff.
- [x] **09 R4 voice** — принято 2026-09-16 (ветка `feat/r4-voice`, незакоммичено). Permission/cancel/retry; voice POST только в dialogue; take не создаётся. R5 не стартовать до kickoff.
- [x] **09 R5 take/media** — принято 2026-09-16 (ветка `feat/r5-media`, незакоммичено). Scriptless process, client limits, stale pending reclaim, MEDIA_TIMEOUT. Следующий kickoff: R6.
- [x] **09 R6 AI context** — принято 2026-09-16 (ветка `feat/r6-context`, незакоммичено; R5 ещё на том же дереве). Только completed portrait + текущая мысль; amend draft отсечён; safeAiLog. Следующий kickoff: R7.
