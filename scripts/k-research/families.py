"""K1: map the headings of every author's 02_generative-principles.md to operation families (reproducible, no model).

A heading is assigned to the FIRST family whose pattern matches. Boilerplate sections are skipped. Run:
  python3 scripts/k-research/families.py            # prints the matrix
  python3 scripts/k-research/families.py --json out # writes the data used by 01_principles-matrix.md
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2] / "Analyz" / "Done"
AUTHORS = {
    "chemistry_by_olga": "Chemistry_by_olga",
    "marysstories": "Marysstories",
    "ira_podrez": "ira_podrez_analysis",
    "lermontova.career": "lermontova_career_analysis",
    "alina_telling": "alina_telling_analysis",
    "doctor_belokon": "doctor_belokon_analysis",
    "doctor_komarovskiy": "doctor_komarovskiy_analysis",
    "irina_hakamada": "irina_hakamada_analysis",
    "labkovskiyofficial": "labkovskiyofficial_analysis",
    "ludmila.petranovskaya": "ludmila_petranovskaya_analysis",
    "natalia.remish": "natalia_remish_corpus_analysis",
}
# Authors whose transcripts are in the repository (Analyz/Blogers2 or hadunkin): their quotes can be checked by script.
VERIFIABLE = {"hadunkin", "chemistry_by_olga", "marysstories", "ira_podrez", "lermontova.career"}
HADUNKIN = ROOT.parent / "hadunkin" / "_out" / "_author" / "01_corpus-hypotheses.md"

SKIP = re.compile(r"что не переносить|контроль генерации|минимальные поля|обновление|дополнение|смена метрики|базовая операция|отдельные архитектуры", re.I)

# (family id, human name, pattern). Order matters: the first match wins.
FAMILIES = [
    ("final_function", "Функция финала (ИСКЛЮЧЕНА из карточек: правило конца хода, R4)", r"финал|закончить наблюдаемым|распределённый финал"),
    ("commercial_split", "Отделить объяснение от коммерческого перехода", r"коммерч|оффер|продвижен|cta|шлюз"),
    ("series_long", "Серия и длинный материал", r"серия|серию|длинн|атомарн"),
    ("narrow_categorical", "Сузить категоричное утверждение до условного", r"сузить категоричн|катастрофическ\w+ вывод|условн\w+ (опровержен|ответ)|шкала между|эпистемическ|границ\w+ вывода|реалистичный остаток"),
    ("separate_concepts", "Развести смешанные понятия", r"перепутаны понятия|развести смеш|функциональное противопоставление|одно опорное различение|разделить конкурир|диагностическое переименование"),
    ("check_premise", "Проверить предпосылку вопроса или рамки", r"вынеси аксиому|проверка (рамки|предпосылки|смысловой подмены)|автоматическую рамку|уточнени\w+ исходной рамки|уточнить проблему через контраст"),
    ("redefine_by_criterion", "Переопределить слово или ярлык через критерий", r"переопредели слово|переопределить слово|через критерий|развилка по критерию|профессиональн\w+ ярлык|типология по функции|диагноз в действие"),
    ("abstraction_to_model", "Перевести абстракцию в модель, сцену или случай", r"абстракци|заземляющая модель|мини-модель|аналогия|материализовать|тест числа|перевести число"),
    ("case_to_rule", "От случая к правилу", r"случай|эпизод|личный опыт|частный"),
    ("unfold_vague", "Развернуть расплывчатое до причины, мотива и цены", r"сними популярную причину|расплывчат|от ярлыка|от поведения к проверяем|промежуточным механизмом|дерево причин|диагноз отсутствующего|объект → устройство|от ярлыка к механизму"),
    ("support_type", "Выбрать честный тип опоры", r"тип опоры|режим\w* опоры|лестница доказательств|этическая маркировка|аудит обещания"),
    ("practical_steps", "Практический шаг и маршрутизация по неопределённости", r"конструктор|лестница практ|следующий шаг|операционализ|контролируемому действию|триаж|маршрутизатор|матрица поддержки|реальных ограничений|пяти решений|выбор архитектуры|честная хроника|список с единой осью|удержание двух"),
]

def headings(path):
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^#{2,3}\s+(.*)", line)
        if m:
            out.append(m.group(1).strip())
    return out

def classify(heading):
    if SKIP.search(heading):
        return None
    low = heading.lower()
    for fid, _name, pattern in FAMILIES:
        if re.search(pattern, low):
            return fid
    return "unclassified"

def hadunkin_principles():
    """The numbered transferable principles of hadunkin (his folder has no 02_generative-principles.md)."""
    out, inside = [], False
    for line in HADUNKIN.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            inside = "Генеративные принципы" in line
            continue
        m = re.match(r"^\d+\.\s+(.*?)\s*$", line)
        if inside and m:
            out.append(m.group(1))
    return out


def build():
    rows = {}
    for h in hadunkin_principles():
        fid = classify(h)
        if fid is not None:
            rows.setdefault(fid, {}).setdefault("hadunkin", []).append(h)
    for author, folder in AUTHORS.items():
        for h in headings(ROOT / folder / "02_generative-principles.md"):
            fid = classify(h)
            if fid is None:
                continue
            rows.setdefault(fid, {}).setdefault(author, []).append(h)
    return rows

if __name__ == "__main__":
    rows = build()
    names = {fid: name for fid, name, _ in FAMILIES}
    names["unclassified"] = "Не отнесено ни к одному семейству"
    order = [f for f, _n, _p in FAMILIES] + ["unclassified"]
    data = {}
    for fid in order:
        authors = sorted(rows.get(fid, {}))
        data[fid] = {
            "name": names[fid],
            "authors": authors,
            "authors_total": len(authors),
            "authors_verifiable": [a for a in authors if a in VERIFIABLE],
            "headings": rows.get(fid, {}),
        }
    if "--json" in sys.argv:
        pathlib.Path(sys.argv[sys.argv.index("--json") + 1]).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    for fid in order:
        d = data[fid]
        print(f"{fid:24} total={d['authors_total']:2} verifiable={len(d['authors_verifiable'])}  {', '.join(d['authors'])}")
