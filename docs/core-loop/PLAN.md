# Основной цикл Vocal — матрица этапов V00–V07

Канон этапов в репозитории. Продуктовые правила: [`CONTRACT.md`](./CONTRACT.md). Решения аудита: [`V00_ADR.md`](./V00_ADR.md). Отчёт: [`V00_REPORT.md`](./V00_REPORT.md).

V00: **accepted**.
BASE_SHA (старт V01): `34abcd78c70b2fa31bd717aeff56acc31577c0d1`.
V01: **accepted**. V01_HEAD: `d34e8dee2243ae109f2e535a439784117cef3aff`. Документы этапа: [`V01_REPORT.md`](./V01_REPORT.md), [`V01_ADR.md`](./V01_ADR.md), [`V01_FILE_MAP.md`](./V01_FILE_MAP.md), [`V01_SCENARIOS.md`](./V01_SCENARIOS.md).
V02: **in progress** (not accepted). V02_BASE_SHA: `4223599e6ddb9e6be0d1a09d9c6b433d84912779`. Документы этапа: [`V02_REPORT.md`](./V02_REPORT.md), [`V02_ADR.md`](./V02_ADR.md), [`V02_FILE_MAP.md`](./V02_FILE_MAP.md), [`V02_SCENARIOS.md`](./V02_SCENARIOS.md).
AUDITED_APP_SHA: `f971a7fb43c2fdd9df6b1824620491500972736a`.

| Этап | Содержание |
|---|---|
| V00 | Аудит, контракт, карта файлов. Без смены логики и миграций. |
| V01 | Актуальный дубль, точная ревизия, изоляция запросов. |
| V02 | ThoughtState. |
| V03 | Четыре действия агента и решение о готовности. |
| V04 | Портрет и персонализация вопросов. |
| V05 | UI перехода к записи и роль сценария. |
| V06 | Разбор следующего дубля и завершение. |
| V07 | Библиотека приёмов и полный цикл. |

Путь процесса — в [`CONTRACT.md`](./CONTRACT.md). Действия агента (`ask_question`, `suggest_take`, `content_sufficient`, `redirect_to_task`) не являются статусами мысли.

V00 принят. V01 принят на `V01_HEAD`. V02 начат от `V02_BASE_SHA`, не принят. Baseline и `migrate resolve` на live Supabase не применять.
