# Основной цикл Vocal — матрица этапов V00–V07

Общий маршрут (C00, Auth, I, запуск): [`../ROADMAP.md`](../ROADMAP.md). Этот файл — только канон V00–V07, не вторая копия всей карты.

Канон этапов в репозитории. Продуктовые правила: [`CONTRACT.md`](./CONTRACT.md). Решения аудита: [`V00_ADR.md`](./V00_ADR.md). Отчёт: [`V00_REPORT.md`](./V00_REPORT.md).

V00: **accepted**.
BASE_SHA (старт V01): `34abcd78c70b2fa31bd717aeff56acc31577c0d1`.
V01: **accepted**. V01_HEAD: `d34e8dee2243ae109f2e535a439784117cef3aff`. Документы этапа: [`V01_REPORT.md`](./V01_REPORT.md), [`V01_ADR.md`](./V01_ADR.md), [`V01_FILE_MAP.md`](./V01_FILE_MAP.md), [`V01_SCENARIOS.md`](./V01_SCENARIOS.md).
V02: **accepted**. V02_HEAD: `1c9a4b9d4fda8df91b2e650e217883c8e02ccc62`. V02_BASE_SHA: `4223599e6ddb9e6be0d1a09d9c6b433d84912779`. Документы этапа: [`V02_REPORT.md`](./V02_REPORT.md), [`V02_ADR.md`](./V02_ADR.md), [`V02_FILE_MAP.md`](./V02_FILE_MAP.md), [`V02_SCENARIOS.md`](./V02_SCENARIOS.md).
V03: **accepted**. V03_HEAD: `b5278f468666330bc30bb6cd9378f2f02f858264`. V03_BASE_SHA: `66cbcc0c3fc68a5b0786a4e9036a13d523ac3083`. Документы этапа: [`V03_REPORT.md`](./V03_REPORT.md), [`V03_ADR.md`](./V03_ADR.md), [`V03_FILE_MAP.md`](./V03_FILE_MAP.md), [`V03_SCENARIOS.md`](./V03_SCENARIOS.md).
V04: **продукт V04 принят** (`e8985243e85c73d181083428f80c8445fed29756`). V04_BASE_SHA: `564c9cf8534392501e125dda7ecc747c235a5c0d`. Документы V04-00: [`V04_REPORT.md`](./V04_REPORT.md), [`V04_ADR.md`](./V04_ADR.md), [`V04_FILE_MAP.md`](./V04_FILE_MAP.md), [`V04_SCENARIOS.md`](./V04_SCENARIOS.md).
V05: **продукт V05 принят** 02.10.2026. V05_HEAD: `5fa13657b38996ba8f3a416a22fb03b7647843b9`. V05_BASE_SHA: `abd6670f65269b081d20762f49945a3628db52fb`. Документы: [`V05_SCENARIO_TAB_SPEC.md`](./V05_SCENARIO_TAB_SPEC.md), [`V05_REPORT.md`](./V05_REPORT.md).
V06: **продукт V06 принят** 04.10.2026. V06_HEAD: `d0bdb89cd36c6e1b6925d6746a6447323d419eb3`. V06_BASE_SHA: `f741eb8d9e6c5881afcdd43d3f4cff9a8ccbd2fd`. Отчёт проверок: `6e958e6ca3ac96d99a6d4fea5686f49e8ab98fd9`. План: [`V06_PLAN.md`](./V06_PLAN.md). Отчёт: [`V06_REPORT.md`](./V06_REPORT.md).
V07: не начат.
AUDITED_APP_SHA: `f971a7fb43c2fdd9df6b1824620491500972736a`.

| Этап | Содержание |
|---|---|
| V00 | Аудит, контракт, карта файлов. Без смены логики и миграций. |
| V01 | Актуальный дубль, точная ревизия, изоляция запросов. |
| V02 | ThoughtState. |
| V03 | Четыре действия агента и решение о готовности. |
| V04 | Портрет и персонализация вопросов. |
| V05 | Отдельная вкладка «Сценарий»: readiness gate, генерация только по кнопке, версионирование черновиков, защита от устаревшего результата (`stale` / 409), переход к записи без автозапуска камеры. **продукт V05 принят** 02.10.2026 (`5fa13657b38996ba8f3a416a22fb03b7647843b9`). Спека: [`V05_SCENARIO_TAB_SPEC.md`](./V05_SCENARIO_TAB_SPEC.md). |
| V06 | Разбор следующего дубля и завершение. **продукт V06 принят** 04.10.2026 (`d0bdb89cd36c6e1b6925d6746a6447323d419eb3`). План: [`V06_PLAN.md`](./V06_PLAN.md). Отчёт: [`V06_REPORT.md`](./V06_REPORT.md). |
| V07 | Библиотека приёмов и полный цикл. Не начат. |

Путь процесса — в [`CONTRACT.md`](./CONTRACT.md). Действия агента (`ask_question`, `suggest_take`, `content_sufficient`, `redirect_to_task`) не являются статусами мысли. Сценарий не является пятым действием V03 и не генерируется в диалоге.

Продукт V04 **принят** (`e8985243e85c73d181083428f80c8445fed29756`). **продукт V05 принят** 02.10.2026 на `5fa13657b38996ba8f3a416a22fb03b7647843b9`. **продукт V06 принят** 04.10.2026 на `d0bdb89cd36c6e1b6925d6746a6447323d419eb3`. V07 не начат.

C00: документы **приняты**. C00-01–C00-05 и **продукт C00 приняты** (`e268c40`). Auth **принят** (`51d6033`). Live-схема **принята** 29.09.2026. [`../ROADMAP.md`](../ROADMAP.md) **принят** как порядок работ (29.09.2026). Не стартовать I01 без явного старта.

V00 принят. V01 принят на `V01_HEAD`. V02 принят на `V02_HEAD`. V03 принят на `V03_HEAD`. Baseline, миграции 8–9 и `migrate resolve` на live Supabase не применять.
