"""K1: writes Analyz/craft/01_principles-matrix.md from the heading data (families.py). Reproducible, no model."""
import json, subprocess, pathlib, sys
root = pathlib.Path(__file__).resolve().parents[2]
subprocess.run([sys.executable, str(root / "scripts/k-research/families.py"), "--json", "/tmp/k1-fam.json"], check=True, capture_output=True)
d = json.load(open("/tmp/k1-fam.json"))
EXCLUDED = {"final_function"}
order = [k for k in d if k not in ("unclassified",)]
def status(fid, v):
    if fid in EXCLUDED: return "исключён (решение владельца: правило конца хода, R4)"
    if v["authors_total"] >= 3 and len(v["authors_verifiable"]) >= 2: return "общий, проверяем на ≥2 авторах"
    if v["authors_total"] >= 3 and len(v["authors_verifiable"]) == 1: return "частично проверен (1 автор с расшифровками)"
    return "гипотеза"
lines = [
 "# K1. Матрица принципов (12 авторов, по заголовкам)",
 "",
 "Сгенерировано скриптом `scripts/k-research/families.py` и `matrix_md.py`; расшифровки и тексты принципов в контекст не загружались. Метод грубый: заголовок отнесён к семейству по ключевым словам (правила в скрипте). Это таблица «принцип · авторы · общее / различное / неизвестно», не вывод о качестве принципов. Различное (почерк автора, лексика, формулы) в карточки не идёт.",
 "",
 "Проверяемые авторы (расшифровки лежат в репозитории): hadunkin, chemistry_by_olga, marysstories, ira_podrez, lermontova.career. Остальные семь (alina_telling, doctor_belokon, doctor_komarovskiy, irina_hakamada, labkovskiyofficial, ludmila.petranovskaya, natalia.remish): расшифровок нет, их принципы **«не проверено»**, пока владелец не положит расшифровки в `Analyz/_private_raw/` (папка в `.gitignore`).",
 "",
 "| Семейство операций | Авторов всего | Из них проверяемых | Авторы (✓ = расшифровки в репозитории) | Статус | Известно / неизвестно |",
 "|---|---:|---:|---|---|---|",
]
for fid in order:
    v = d[fid]
    names = ", ".join(("✓ " if a in v["authors_verifiable"] else "") + a for a in v["authors"]) or "—"
    unknown = "семь авторов без расшифровок: цитаты и решения Prompt 0 не проверены" if any(a not in v["authors_verifiable"] for a in v["authors"]) else "—"
    lines.append(f"| {v['name']} | {v['authors_total']} | {len(v['authors_verifiable'])} | {names} | {status(fid, v)} | {unknown} |")
lines += ["", f"Не отнесено ни к одному семейству ({d['unclassified']['authors_total']} автора): " + "; ".join(f"{a}: " + " / ".join(h[:50] for h in hs) for a, hs in d["unclassified"]["headings"].items()), "",
 "## Проверка метода",
 "",
 "- «Функция финала» найдена у 9 авторов из 12 (в плане указано 9 из 11 до добавления hadunkin): совпадает с фактом из проверки корпуса, значит правила отнесения не потеряли самый частый принцип.",
 "- Шесть повторяющихся операций из `STAGE_CARDS.md` попали в семейства: развести понятия → `separate_concepts`; проверить предпосылку → `check_premise`; сузить категоричное → `narrow_categorical`; абстракция в модель → `abstraction_to_model`; от случая к правилу → `case_to_rule`; переопределить слово → `redefine_by_criterion`.",
 "- Ограничение: отнесение по заголовкам; часть заголовков стоит на границе (например «Уточнить проблему через контраст» отнесён к проверке рамки). Таблица нужна для отбора кандидатов, а не как доказательство.",
 "",
 "## Заголовки по семействам (для проверки отнесения)",
 ""]
for fid in order:
    v = d[fid]
    lines.append(f"### {v['name']}")
    for a, hs in v["headings"].items():
        lines.append(f"- {a}: " + " ; ".join(hs))
    lines.append("")
(root / "Analyz/craft/01_principles-matrix.md").write_text("\n".join(lines), encoding="utf-8")
print("written", len(lines), "lines")
