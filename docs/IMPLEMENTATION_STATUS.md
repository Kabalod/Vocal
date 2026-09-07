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
| 6 | Разбор и вопросы | на ревью | `feat/personal-mvp-06-reviews-and-questions` | `437d8f2f1fd8a74aa17cbe810088ae58b31b4ae5` | `HEAD_SHA` | `test:reels` 25/25; lint ок | есть замечания, правки в ветке |
| 7 | Сценарий и версии | не начат | — | — | — | — | ждёт принятия этапа 6 |
| 8 | Сравнение, экспорт, итоговая проверка | не начат | — | — | — | — | |

Этап не считается принятым, пока внешнее ревью не подтвердит его явно.

## Коммиты

| Роль | SHA |
|---|---|
| Принятый этап 0 | `89c52c52160f4ac2ce8155f6ece178bc259c7092` |
| Принятый этап 1 | `ba283c9e9e20e634e76994a43183f1d2d3660e60` |
| Принятый этап 2 | `b08929b1e1328e75c7e9d3bf6ecf1697dce46daa` |
| Принятый этап 3 | `1d8f26c1cb3d137f133fc8f35b0dfd7eac8302be` |
| Принятый этап 4 | `0dd0d04edbcf1cee9cff3b58d00f6290be5bd15e` |
| Принятый этап 5 / BASE этапа 6 | `437d8f2f1fd8a74aa17cbe810088ae58b31b4ae5` |
| Коммит этапа 6 | `7858783c2a419ce78d3bcdb9fa7e604d6c926a56` |

## Этап 6 — проверки

| Команда | Результат |
|---|---|
| `npm run test:reels` | 25/25 |
| `npm run lint` | exit 0 |
| `npm run typecheck` | исходные analyze/score-analyz; новых ошибок этапа нет |
| `npm run build` | не запускался на этапе 6 |

Миграция `20260907130000_reviews_and_questions`. Платных вызовов в автотестах не было (mock Groq). Браузер не гонялся. Живой Groq из UI не проверялся.
