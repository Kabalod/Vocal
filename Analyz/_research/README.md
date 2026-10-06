# Исследование Analyz

База мышления блогеров по расшифровкам. Это **не** шкала Vocal 0–10 и не советы на следующий дубль.

Промпты v1 (hadunkin, калибровка): [`Analyz/prompts_analysis_bloggers.md`](../prompts_analysis_bloggers.md)  
Промпты v2 (шлюз, схема, routing): [`prompts_analysis_v2.md`](prompts_analysis_v2.md)  
Протокол следующего корпуса: [`03_protocol-v2.md`](03_protocol-v2.md)  
Как метод сработал на одном авторе: [`01_method-review.md`](01_method-review.md)

## Этапы работы

| № | Этап | Статус | Где результат |
|---|------|--------|----------------|
| 0 | План и правила | готов | [00_plan.md](00_plan.md) |
| 1 | Инвентарь корпуса hadunkin | готов | [hadunkin/_out/00_inventory.md](../hadunkin/_out/00_inventory.md) |
| 2 | Пилот: 12 роликов × Prompt 1–3 | готов | [hadunkin/_out/pilot/index.md](../hadunkin/_out/pilot/index.md) · [выводы](../hadunkin/_out/03_pilot-conclusions.md) |
| 3 | Prompt 1 на мыслящих (~80+ слов) | готов: 195 смыслов, очередь 0 | [каталог](../hadunkin/_out/01_catalog_80plus.md) · [смысл](../hadunkin/_out/sense/index.md) |
| 4 | Prompt 2 только если в смысле был тезис | плотный слой: 52 + кластер | [механика](../hadunkin/_out/sense/index-mechanics.md) |
| 5 | Prompt 3 только если свой вывод | готов: 40 в sense + пилот | [мышление](../hadunkin/_out/sense/index-thinking.md) |
| 6 | Сводка по автору hadunkin | готов: гипотезы, не портрет | [hadunkin/_out/_author/01_corpus-hypotheses.md](../hadunkin/_out/_author/01_corpus-hypotheses.md) |
| 7 | Разбор метода (промпты × один автор) | готов | [01_method-review.md](01_method-review.md) |
| 8 | Оптимизация процесса и промптов | готов | [02_optimization.md](02_optimization.md) |
| 9 | Analysis Protocol v2 (автор №2 = контраст) | готов | [03_protocol-v2.md](03_protocol-v2.md) · [промпты v2](prompts_analysis_v2.md) |
| 10 | Матрица авторов (живой черновик) | v0.4: + 4 врача/Q&A/карьера | [04_author-matrix.md](04_author-matrix.md) |

## Как читать один ролик

Пилот (все три слоя): [`hadunkin/_out/pilot/`](../hadunkin/_out/pilot/index.md)  
Смысл этапа 3: [`hadunkin/_out/sense/`](../hadunkin/_out/sense/index.md)

1. `00_meta.md` — id, слова, тип
2. `00_transcript.md` — исходный текст
3. `01_sense.md` — смысловая архитектура
4. `02_mechanics.md` — только если был тезис ([индекс механики](../hadunkin/_out/sense/index-mechanics.md))
5. `03_thinking.md` — только если был свой вывод ([индекс мышления](../hadunkin/_out/sense/index-thinking.md))

Пустые разделы пишем явно: `нет в тексте`.

## Корпуса

- [hadunkin](../hadunkin/_out/README.md) — калибровка метода (полный проход)
- [chemistry_by_olga](../Done/Chemistry_by_olga/) — веб v2
- [marysstories](../Done/Marysstories/) — веб v2 + depth
- [ira_podrez](../Done/ira_podrez_analysis/) — веб v2 + longform→продукт
- [alina_telling](../Done/alina_telling_analysis/) — веб v2 + depth
- [doctor_belokon](../Done/doctor_belokon_analysis/) — веб v2 + depth
- [doctor_komarovskiy](../Done/doctor_komarovskiy_analysis/) — веб v2 + depth
- [irina_hakamada](../Done/irina_hakamada_analysis/) — веб v2 + depth
- [lermontova.career](../Done/lermontova_career_analysis/) — веб v2
- [labkovskiyofficial](../Done/labkovskiyofficial_analysis/) — веб v2 + depth
- [ludmila.petranovskaya](../Done/ludmila_petranovskaya_analysis/) — веб v2 + depth
- [natalia.remish](../Done/natalia_remish_corpus_analysis/) — веб v2 (глубина не сделана)
- Сравнение: [04_author-matrix.md](04_author-matrix.md)
- SirDenisov — шкала Vocal, в это исследование не входит
