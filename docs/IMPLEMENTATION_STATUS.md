# Статус личного MVP

Репозиторий: `Kabalod/Vocal`.  
План: локальная папка `vocal_cursor_plan_2026-09-10` (не в git). Старый `vocal_complete_plan_10_15` закрыт после DESIGN_05.  
Принятый DESIGN_05 / база Stage 01: `da1396f138e1be2b549a623a859ee8084cded420`.  
Принятый Stage 01 / база Stage 02: `7e0d4b7d774405b3373f479f1b7c7a1ec7f1326f`.

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
| D02 | Shell и навигация | принят | `feat/personal-mvp-design-02-shell` | `c1976b6853b56720aabbc7b0e1e453d4bf7b1f36` | `9cfb5b92f0b2f3ec4081f314b82467aebd56b61b` | lint; typecheck; build; test:reels 30/30 | принято внешним ревью; код `3fa3cc6` |
| D03 | Экран «Записи» | принят | `feat/personal-mvp-design-03-recordings` | `9cfb5b92f0b2f3ec4081f314b82467aebd56b61b` | `7f32e9db6ef12562651a1801c904e959117f840d` | lint; typecheck; build; test:reels 31/31 | принято внешним ревью; код `2cd5bc1` |
| D04 | Рабочая область записи | принят | `feat/personal-mvp-design-04-reel-workspace` | `7f32e9db6ef12562651a1801c904e959117f840d` | `729d1e586a65712b21433c106d13ec77fd99795c` | lint; typecheck; build; test:reels 32/32 | принято внешним ревью; код `505024d` |
| D05 | Сценарий и версии | принят | `feat/personal-mvp-design-05-script-versions` | `729d1e586a65712b21433c106d13ec77fd99795c` | `da1396f138e1be2b549a623a859ee8084cded420` | lint; typecheck; build; test:reels 35/35 | принято внешним ревью; код `df861de` + fix `620c692`; docs `da1396f` — база Stage 01 |
| S01 | Визуальная основа и shell | принят | `feat/vocal-v2-01-foundation-shell` | `da1396f138e1be2b549a623a859ee8084cded420` | `7e0d4b7d774405b3373f479f1b7c7a1ec7f1326f` | lint; typecheck; test:reels 41/41 | принято внешним ревью; код `968d3cf`; focus-trap `a1a2853`; база Stage 02 — `7e0d4b7` |
| S02 | Библиотека компонентов Vocal | есть замечания | `feat/vocal-v2-02-ui-kit` | `7e0d4b7d774405b3373f479f1b7c7a1ec7f1326f` | `d1b9e6fe297ccb9a76e5a54f5874d37ab76e5fe4` | lint; typecheck; build; test:reels 47/47 | код `c3c908f`; focus-fix `d1b9e6f`; Stage 03 не начат |

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
| Принятый DESIGN_01 | `c1976b6853b56720aabbc7b0e1e453d4bf7b1f36` |
| Коммит кода DESIGN_02 | `3fa3cc654faeab19caf33af9ea4f144ccea31122` |
| Принятый DESIGN_02 / база DESIGN_03 | `9cfb5b92f0b2f3ec4081f314b82467aebd56b61b` |
| Коммит кода DESIGN_03 | `2cd5bc128358eefb7c0dd5dc5318330c46ef0f9a` |
| Принятый DESIGN_03 / база DESIGN_04 | `7f32e9db6ef12562651a1801c904e959117f840d` |
| Коммит кода DESIGN_04 | `505024d3888ee3a73e974a15b0f26d23fa70b7d6` |
| Принятый DESIGN_04 / база DESIGN_05 | `729d1e586a65712b21433c106d13ec77fd99795c` |
| Коммит кода DESIGN_05 | `df861de26c7c44be262bc1170b7408478cd1826d` |
| Исправление ревью DESIGN_05 | `620c6927170c8248963a0eef29f9677611224a1b` |
| Принятый DESIGN_05 / база Stage 01 | `da1396f138e1be2b549a623a859ee8084cded420` |
| Коммит кода Stage 01 | `968d3cf6a7e7fa3aa40d5ce7deebd07662066e83` |
| Исправление ревью Stage 01 | `a1a28530908265f44809a6bdcec9f3f808565912` |
| Принятый Stage 01 / база Stage 02 | `7e0d4b7d774405b3373f479f1b7c7a1ec7f1326f` |
| Коммит кода Stage 02 | `c3c908f6bce2f52ad91270f06817bba9a94a8394` |
| Исправление ревью Stage 02 | `d1b9e6fe297ccb9a76e5a54f5874d37ab76e5fe4` |

## Этап 9 — проверки

| Команда | Результат |
|---|---|
| `npm run test:reels` | 29/29 |
| `npm run lint` | exit 0 |
| `npm run build` | успех |
| `npm run typecheck` | scripts исключены; analyze с `@ts-nocheck` |
| Браузер | частичный smoke, без живого Groq и без настоящего видео |

Новой миграции нет. Платных вызовов не было. Backup: `%USERPROFILE%\Vocal-backups\stage09-2026-09-07-234850`. Restore: `%USERPROFILE%\Vocal-restore-check-stage09`.
