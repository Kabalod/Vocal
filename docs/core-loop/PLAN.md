# Основной цикл Vocal — матрица этапов V00–V07

Общий маршрут (C00, Auth, I, запуск): [`../ROADMAP.md`](../ROADMAP.md). Этот файл — только канон V00–V07, не вторая копия всей карты.

Канон этапов в репозитории. Продуктовые правила: [`CONTRACT.md`](./CONTRACT.md). Решения аудита: [`V00_ADR.md`](./V00_ADR.md). Отчёт: [`V00_REPORT.md`](./V00_REPORT.md).

V00: **accepted**.
BASE_SHA (старт V01): `34abcd78c70b2fa31bd717aeff56acc31577c0d1`.
V01: **accepted**. V01_HEAD: `d34e8dee2243ae109f2e535a439784117cef3aff`. Документы этапа: [`V01_REPORT.md`](./V01_REPORT.md), [`V01_ADR.md`](./V01_ADR.md), [`V01_FILE_MAP.md`](./V01_FILE_MAP.md), [`V01_SCENARIOS.md`](./V01_SCENARIOS.md).
V02: **accepted**. V02_HEAD: `1c9a4b9d4fda8df91b2e650e217883c8e02ccc62`. V02_BASE_SHA: `4223599e6ddb9e6be0d1a09d9c6b433d84912779`. Документы этапа: [`V02_REPORT.md`](./V02_REPORT.md), [`V02_ADR.md`](./V02_ADR.md), [`V02_FILE_MAP.md`](./V02_FILE_MAP.md), [`V02_SCENARIOS.md`](./V02_SCENARIOS.md).
V03: **accepted**. V03_HEAD: `b5278f468666330bc30bb6cd9378f2f02f858264`. V03_BASE_SHA: `66cbcc0c3fc68a5b0786a4e9036a13d523ac3083`. Документы этапа: [`V03_REPORT.md`](./V03_REPORT.md), [`V03_ADR.md`](./V03_ADR.md), [`V03_FILE_MAP.md`](./V03_FILE_MAP.md), [`V03_SCENARIOS.md`](./V03_SCENARIOS.md).
V04: продукт **not started**. V04 **не принят**. V04_BASE_SHA: `564c9cf8534392501e125dda7ecc747c235a5c0d`. Документы V04-00: [`V04_REPORT.md`](./V04_REPORT.md), [`V04_ADR.md`](./V04_ADR.md), [`V04_FILE_MAP.md`](./V04_FILE_MAP.md), [`V04_SCENARIOS.md`](./V04_SCENARIOS.md).
AUDITED_APP_SHA: `f971a7fb43c2fdd9df6b1824620491500972736a`.

| Этап | Содержание |
|---|---|
| V00 | Аудит, контракт, карта файлов. Без смены логики и миграций. |
| V01 | Актуальный дубль, точная ревизия, изоляция запросов. |
| V02 | ThoughtState. |
| V03 | Четыре действия агента и решение о готовности. |
| V04 | Портрет и персонализация вопросов. |
| V05 | Отдельная вкладка «Сценарий»: readiness gate, генерация только по кнопке, версионирование черновиков, защита от устаревшего результата (`stale` / 409), переход к записи без автозапуска камеры. Планируется; не начат. Спека: [`V05_SCENARIO_TAB_SPEC.md`](./V05_SCENARIO_TAB_SPEC.md). BASE для V05 не назначен. |
| V06 | Разбор следующего дубля и завершение. |
| V07 | Библиотека приёмов и полный цикл. |

Путь процесса — в [`CONTRACT.md`](./CONTRACT.md). Действия агента (`ask_question`, `suggest_take`, `content_sufficient`, `redirect_to_task`) не являются статусами мысли. Сценарий не является пятым действием V03 и не генерируется в диалоге.

Продукт V04 не начат (V04-00 — документы). V05 не начат. Документ [`V05_SCENARIO_TAB_SPEC.md`](./V05_SCENARIO_TAB_SPEC.md) — контракт будущего этапа, не реализация.

C00: документы **приняты**. C00-01–C00-04 **приняты** (C00-04 = `ce6a43c`). C00-05 **реализован, не принят**. Продукт C00, V04 и [`../ROADMAP.md`](../ROADMAP.md) **не приняты**. Следующий этап — приёмка C00-05. Не стартовать V04-01, V05 и I01.

V00 принят. V01 принят на `V01_HEAD`. V02 принят на `V02_HEAD`. V03 принят на `V03_HEAD`. Baseline, миграции 8–9 и `migrate resolve` на live Supabase не применять.
