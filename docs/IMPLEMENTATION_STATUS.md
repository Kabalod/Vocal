# Статус личного MVP

Репозиторий: `Kabalod/Vocal`.  
План: [cursor-plan/README.md](cursor-plan/README.md).  
Следующая последовательность (дизайн, затем профиль 10–15): локальная папка `vocal_complete_plan_10_15/`.  
Принятый DESIGN_01 / база следующего дизайн-этапа: `c1976b6853b56720aabbc7b0e1e453d4bf7b1f36`. DESIGN_02 не начат.

Легенда статуса: `не начат` · `в работе` · `на ревью` · `принят` · `есть замечания`.

| Этап | Название | Статус | Ветка | BASE_SHA | HEAD_SHA | Проверки | Замечания |
|---|---|---|---|---|---|---|---|
| 0 | Исходное состояние и правила | принят | `feat/personal-mvp-00-baseline` | `b59e78a0a177442dd7fc30e02217153c634eb98f` | `89c52c52160f4ac2ce8155f6ece178bc259c7092` | lint ок; typecheck/build — исходные ошибки | принято внешним ревью |
| 1 | Карточки роликов и дубли | принят | `feat/personal-mvp-01-reels-and-takes` | `89c52c52160f4ac2ce8155f6ece178bc259c7092` | `ba283c9e9e20e634e76994a43183f1d2d3660e60` | `test:reels` 4/4 на момент принятия | принято внешним ревью |
| 2 | Экран «Мои ролики» | принят | `feat/personal-mvp-02-reel-workspace` | `ba283c9e9e20e634e76994a43183f1d2d3660e60` | `b08929b1e1328e75c7e9d3bf6ecf1697dce46daa` | `test:reels` 14/14 | принято внешним ревью |
| 3 | Материалы, плеер, перезаписи | принят | `feat/personal-mvp-03-take-media` | `b08929b1e1328e75c7e9d3bf6ecf1697dce46daa` | `1d8f26c1cb3d137f133fc8f35b0dfd7eac8302be` | `test:reels` 19/19; lint ок | принято внешним ревью |
| 4 | Расшифровки и надёжная обработка | принят | `feat/personal-mvp-04-transcripts-and-jobs` | `1d8f26c1cb3d137f133fc8f35b0dfd7eac8302be` | `0dd0d04edbcf1cee9cff3b58d00f6290be5bd15e` | `test:reels` 20/20; lint ок | принято внешним ревью |
| 5 | Анкета автора | принят | `feat/personal-mvp-05-creator-profile` | `0dd0d04edbcf1cee9cff3b58d00f6290be5bd15e` | `437d8f2f1fd8a74aa17cbe810088ae58b31b4ae5` | `test:reels` 22/22; lint ок | принято внешним ревью |
| 6 | Разбор и вопросы | принят | `feat/personal-mvp-06-reviews-and-questions` | `437d8f2f1fd8a74aa17cbe810088ae58b31b4ae5` | `d265b0d287b791e981577774b9b1a5215f5d2fc3` | `test:reels` 25/25; lint ок | принято внешним ревью |
| 7 | Сценарий и версии | принят | `feat/personal-mvp-07-script-editor` | `d265b0d287b791e981577774b9b1a5215f5d2fc3` | `87cf50b8dc8d01f98a2e64120d51ab308b9921db` | `test:reels` 26/26; lint ок | принято внешним ревью |
| 8 | Сравнение, экспорт, итоговая проверка | принят | `feat/personal-mvp-08-comparison-and-release-check` | `87cf50b8dc8d01f98a2e64120d51ab308b9921db` | `086292d9d0db4285382c9a3ca6f47231423928ad` | `test:reels` 29/29; lint ок | принято внешним ревью |
| 9 | Стабилизация MVP и браузерная проверка | на ревью | `feat/personal-mvp-09-mvp-stabilization` | `086292d9d0db4285382c9a3ca6f47231423928ad` | `21b4858f70306cd8df29b9d450c30a4356fd49f9` | `test:reels` 29/29; lint; build | не принят формально; план 10–15 стартует от `d4c06fa` |
| D01 | Визуальный фундамент | принят | `feat/personal-mvp-design-01-foundation` | `d4c06fad0f1b468ff70a79effd461a65ec7cfcc5` | `c1976b6853b56720aabbc7b0e1e453d4bf7b1f36` | lint; typecheck; build; test:reels 29/29 | принято внешним ревью; код `6ad19cff` |

Этап не считается принятым, пока внешнее ревью не подтвердит его явно.

## Коммиты

| Роль | SHA |
|---|---|
| Принятый этап 0 | `89c52c52160f4ac2ce8155f6ece178bc259c7092` |
| Принятый этап 1 | `ba283c9e9e20e634e76994a43183f1d2d3660e60` |
| Принятый этап 2 | `b08929b1e1328e75c7e9d3bf6ecf1697dce46daa` |
| Принятый этап 3 | `1d8f26c1cb3d137f133fc8f35b0dfd7eac8302be` |
| Принятый этап 4 | `0dd0d04edbcf1cee9cff3b58d00f6290be5bd15e` |
| Принятый этап 5 | `437d8f2f1fd8a74aa17cbe810088ae58b31b4ae5` |
| Принятый этап 6 | `d265b0d287b791e981577774b9b1a5215f5d2fc3` |
| Принятый этап 7 | `87cf50b8dc8d01f98a2e64120d51ab308b9921db` |
| Принятый этап 8 / BASE этапа 9 | `086292d9d0db4285382c9a3ca6f47231423928ad` |
| Коммит этапа 7 | `146c63bf94b1eadcbe3e2d59cdda4eb72d51eec9` |
| Коммит этапа 8 | `ec1883ccf0d8526826ac818efe90d513b3502737` |
| Исправление ревью этапа 8 | `0b07f90b2f0da6601a6fdd08bb60bd4805611cb0` |
| Документация SHA этапа 8 | `086292d9d0db4285382c9a3ca6f47231423928ad` |
| Инструкция этапа 9 (ветка 8, не база) | `33d7ff175559a3a87aee78bdbe11a3fb77ca669d` |
| Коммит этапа 9 | `21b4858f70306cd8df29b9d450c30a4356fd49f9` |
| Код DESIGN_01 | `6ad19cffb913a572cdba91b8af679d1819b8524f` |
| Принятый DESIGN_01 / база DESIGN_02 | `c1976b6853b56720aabbc7b0e1e453d4bf7b1f36` |

## Этап 9 — проверки

| Команда | Результат |
|---|---|
| `npm run test:reels` | 29/29 |
| `npm run lint` | exit 0 |
| `npm run build` | успех |
| `npm run typecheck` | scripts исключены; analyze с `@ts-nocheck` |
| Браузер | частичный smoke, без живого Groq и без настоящего видео |

Новой миграции нет. Платных вызовов не было. Backup: `%USERPROFILE%\Vocal-backups\stage09-2026-09-07-234850`. Restore: `%USERPROFILE%\Vocal-restore-check-stage09`.
