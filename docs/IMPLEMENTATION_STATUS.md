# Статус личного MVP

Репозиторий: `Kabalod/Vocal`.  
План: [cursor-plan/README.md](cursor-plan/README.md).

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
| 8 | Сравнение, экспорт, итоговая проверка | на ревью | `feat/personal-mvp-08-comparison-and-release-check` | `87cf50b8dc8d01f98a2e64120d51ab308b9921db` | `ec1883ccf0d8526826ac818efe90d513b3502737` | `test:reels` 28/28; lint ок | ждёт внешнего ревью |

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
| Принятый этап 7 / BASE этапа 8 | `87cf50b8dc8d01f98a2e64120d51ab308b9921db` |
| Коммит этапа 7 | `146c63bf94b1eadcbe3e2d59cdda4eb72d51eec9` |
| Коммит этапа 8 | `ec1883ccf0d8526826ac818efe90d513b3502737` |

## Этап 8 — проверки

| Команда | Результат |
|---|---|
| `npm run test:reels` | 28/28 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | исходные analyze/score-analyz/questions |
| `npm run build` | не запускался на этапе 8 |

Миграция `20260907132000_compare_results`. Платных вызовов в автотестах не было. Браузер и живой Groq не проверялись. Просмотр медиа на Windows живым запуском не подтверждён.
