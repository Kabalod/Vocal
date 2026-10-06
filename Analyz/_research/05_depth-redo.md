# Переделка глубины Prompt 1–3

Дата: 03-Sep-2026  
Зачем: веб-GPT делал эссе «для Vocal», а не схему v2. Этот файл — список авторов и копируемый промпт.

Не перепроходить hadunkin.

---

## Кого переделываем

### Обязательно (валидной глубины нет)

| # | Автор | Папка | ID брать из | Сколько ID | Почему |
|---|-------|--------|-------------|------------|--------|
| 1 | **natalia.remish** | `Done/natalia_remish_corpus_analysis/` | `04_depth-selections.md` | 23 уникальных (повтор `Da90XaiN2sb` в типичных и плотных — один разбор, две пометки) | depth-файла нет |
| 2 | **lermontova.career** | `Done/lermontova_career_analysis/` | `04_depth-selections.md` | 23 | `06_depth-analysis.jsonl` — шаблон, одинаковые переходы на всех ID |

### По желанию (контур корпуса не закрыт; ось в матрице уже есть)

| # | Автор | Папка | ID брать из | Сколько | Зачем |
|---|-------|--------|-------------|---------|--------|
| 3 | **ira_podrez** | `Done/ira_podrez_analysis/` | `04_depth-selections.md` | 24 | нет P1–3 на Reels; longform не заменяет |
| 4 | **chemistry_by_olga** | `Done/Chemistry_by_olga/` | `03_depth-selections.md` | ~22 уникальных (есть пересечения типичных/плотных) | выборка есть, глубины нет |

Делать 3–4 только если нужен одинаковый формат по всем Done. Для сравнения авторов они почти не сдвинут таблицу.

### Не переделывать

Alina, Belokon, Komarovskiy, Hakamada, Marys, Labkovskiy, Петрановская — глубина по выборке есть, гипотезы сужены, контркорзина разобрана. Схема полей v2 там не соблюдена, но повтор ради JSON не стоит токенов.

Hadunkin — калибровка закрыта.

---

## Как класть в веб-окно

Один чат = один автор.

1. Вставить промпт ниже целиком.
2. Приложить: `04_depth-selections.md` (у Ольги `03_…`), `00_prompt0-gateway.jsonl` (или строки шлюза по выбранным ID), `01_corpus-hypotheses.md`, `03_clusters.md`.
3. Приложить **тексты только выбранных ID**, не весь корпус.
4. Порядок: типичные → плотные → ломают модель.
5. Просить сначала JSONL по ID, потом `09_revision-log.md`. Не просить эссе «для Vocal» вместо полей.

Проверка приёмки (брак, если хоть одно):

- нет полей `thesis_present` / `p2_allowed` / `p3_allowed` / `kernel_quotes`;
- P2 заполнен при `p2_allowed=no`;
- P3 с принципом при `p3_allowed=no`;
- одинаковые `thought_steps` или `retention_map` на ≥5 ID;
- `kernel_quotes` — пересказ, не дословные фразы;
- в «ломают модель» все ролики подтвердили главную гипотезу;
- нет `09_revision-log.md`.

---

## Промпт (копировать целиком)

```
Ты аналитик корпуса коротких расшифровок. Это не оценка блогера, не Vocal 0–10, не советы на следующий дубль, не фактчек отрасли, не портрет личности.

ЗАДАЧА ЭТОГО ЧАТА
Глубокий Prompt 1–3 ТОЛЬКО по заранее зафиксированной выборке автора.
Не анализируй весь корпус заново. Не меняй решения Prompt 0. Не выдумывай тезис, чтобы заполнить поля.

ВХОД (пользователь приложит)
- author
- файл выборки 04_depth-selections.md (или 03_depth-selections.md)
- строки Prompt 0 по этим ID
- 01_corpus-hypotheses.md и 03_clusters.md — только как гипотезы корпуса, которые можно ОПРОТЕСТОВАТЬ, не подтверждать
- транскрипты выбранных ID, каждый отдельно

ПОРЯДОК
1) Возьми списки «Типичные», «Плотные», «Ломают модель» как есть.
2) Пересекающийся ID разбирай один раз; в записи укажи обе пометки selection.
3) Иди типичные → плотные → ломают модель.
4) На каждый ID: сначала Prompt 1 MODE=deep, затем Prompt 2 только если p2_allowed=yes, затем Prompt 3 только если p3_allowed=yes.
5) После всех ID — сводка ревизии гипотез. Не пиши продуктовую архитектуру Vocal вместо Prompt 3.

ЗАПРЕТЫ
- null и «нет в тексте» — валидные ответы.
- Не реконструируй архитектуру, если тезис нельзя отделить от темы / сцены / настроения / призыва / формулы.
- Не копируй один и тот же набор шагов на разные ID.
- Не оценивай «сильный/слабый ролик».
- Не цитируй то, чего нет в транскрипте этого ID.
- LIMITED/SKIP из контркорзины разбирай как границы: чаще thesis_present=false и слои 2–3 не применяются.

---

PROMPT 1 — MODE=deep
Порядок обязателен:
1. Есть ли различимый тезис (утверждение, которое зритель должен начать считать)?
2. Альтернатива: только тема / сцена / настроение / призыв / слоган / процесс?
3. Если тезис не отделяется: thesis=null, thesis_present=false. Остальное null или [], кроме uncertainties, p2_allowed, p3_allowed, routing_reason.
4. Если тезис отделяется — заполни шаги, claims, начало/конец, ядро.

p2_allowed=yes только если был реальный тезис.
p3_allowed=yes только если есть собственный вывод автора, не сцена/мантра/процесс/повтор слогана.

support_type ровно один из:
факт | исследование | наблюдение | личный опыт | история другого человека | аналогия | причинно-следственное рассуждение | авторитет | общеизвестное предположение | ничем не подкреплено

class: OBSERVED только если claim прямо следует из цитаты; иначе INFERRED.
Серьёзный вывод без evidence (дословная цитата этого транскрипта) и confidence — не писать.
kernel_quotes: 3–5 дословных формулировок автора, не пересказ. Если текста мало — меньше или [].

Схема Prompt 1:
{
  "instagram_id": "",
  "selection": ["типичные"|"плотные"|"ломают модель"],
  "prompt0_decision": "FULL|LIMITED|SKIP",
  "mode": "deep",
  "topic": null,
  "thesis": null,
  "thesis_present": true|false|null,
  "thought_steps": [{"text": "", "function": ""}],
  "claims": [{
    "claim": "",
    "support_type": "",
    "evidence": "",
    "confidence": "high|medium|low",
    "class": "OBSERVED|INFERRED"
  }],
  "opening_promise": null,
  "conclusion": null,
  "promise_resolved": true|false|null,
  "kernel_quotes": [],
  "uncertainties": [],
  "p2_allowed": "yes|no",
  "p3_allowed": "yes|no",
  "routing_reason": ""
}

---

PROMPT 2 — только если p2_allowed=yes
Вход: JSON Prompt 1. Полный транскрипт — только для спорных цитат.
Вопрос: КАК тезис превращён в речь этого ролика. Не оценка.

Если ролик — вариация уже подтверждённого кластера из 03_clusters.md и нового хода нет:
{ "instagram_id": "", "full_p2": false, "cluster_id": "", "entry_difference": "", "chorus_vs_new": "chorus" }

Иначе полный объект (каждый сильный вывод: claim+evidence+confidence+class):
{
  "instagram_id": "",
  "full_p2": true,
  "chorus_vs_new": "chorus|new",
  "hook": { "mechanism": "", "why_continue": "", "evidence": "" },
  "retention_map": [{ "moment": "", "new_reason_to_stay": "", "evidence": "" }],
  "abstract_to_concrete": [{ "from": "", "to": "", "evidence": "" }],
  "stays_abstract": [],
  "devices": [{ "device": "", "function": "", "evidence": "" }],
  "density": { "carries_new": [], "removable_without_loss": [] },
  "voice": "",
  "signature_hypotheses": [],
  "claims": [{ "claim": "", "evidence": "", "confidence": "high|medium|low", "class": "OBSERVED|INFERRED" }]
}

Если p2_allowed=no:
{ "instagram_id": "", "status": "не применялся", "reason": "" }

---

PROMPT 3 — только если p3_allowed=yes
Это вероятная модель рассуждения по ЭТОМУ тексту, не биография и не процесс съёмки.
Все выводы class=INFERRED, пока не стали CORPUS_PATTERN в сводке (CORPUS_PATTERN здесь не ставить).

Если p3_allowed=no:
{ "instagram_id": "", "status": "не применялся", "reason": "" }

Иначе:
{
  "instagram_id": "",
  "seed_observation": { "from_text": "", "inferred": null },
  "tension": "Обычно считается X, но в этом тексте Y",
  "own_insight": null,
  "chain": ["наблюдение", "вопрос", "предположение", "аргумент", "пример/опыт", "уточнение", "вывод"],
  "alternatives": { "considered": null, "objection": null, "how_handled": null },
  "value_moment": { "where": null, "why": null },
  "generative_principle": "",
  "principle_wider_than_text": "yes|no",
  "editor_questions": [],
  "claims": [{ "claim": "", "evidence": "", "confidence": "high|medium|low", "class": "INFERRED" }]
}

chain: отсутствующие звенья = null, не заполнять.
generative_principle — операция мышления, переносимая на другую тему, не совет «сделай хук».
Если principle_wider_than_text=yes — в uncertainties этого ID это назвать.

Плохой принцип: «Начни с провокационного hook».
Хороший: «Возьми привычное объяснение, покажи ситуацию, где оно не работает, дай другую причинную модель».

---

ВЫХОД — три файла, не одно эссе

1) 06_prompt1-deep.jsonl
Одна строка JSON = один ID, объект Prompt 1.

2) 06_prompt2-3.jsonl
Одна строка JSON = один ID:
{ "instagram_id": "", "prompt2": {}, "prompt3": {} }

3) 09_revision-log.md
Таблица: гипотеза из 01_corpus-hypotheses | статус после глубины (CONFIRMED / REFINED / BROKEN / INSUFFICIENT) | какие ID | новая формулировка если изменилась.
Отдельно: что контркорзина запрещает обобщать.
Не добавлять продуктовую схему Vocal. Можно 3–7 переносимых операций мышления, только если они выдержали контркорзину.

Пиши по-русски внутри JSON-строк. JSON строго валидный, ensure_ascii не нужен: кириллица допустима.
```
