"""K2: builds Analyz/craft/02_candidates.json and Analyz/craft/provenance.json.
The candidate texts are written by hand in CANDIDATES (see 01b_inversion.md); the status and the provenance are computed:
a candidate is `candidate` only when its operation family appears at >=2 authors whose evidence quotes are verbatim
(K3 script) AND the question is not derived from a single author's long-form material; otherwise it stays `hypothesis`."""
import json, subprocess, sys, pathlib
root = pathlib.Path(__file__).resolve().parents[2]
subprocess.run([sys.executable, str(root / "scripts/k-research/families.py"), "--json", "/tmp/k2-fam.json"], check=True, capture_output=True)
fam = json.load(open("/tmp/k2-fam.json"))
QUOTE_VERIFIED = {"chemistry_by_olga", "marysstories", "ira_podrez", "lermontova.career"}  # K3: 60/60 verbatim
SINGLE_AUTHOR_LONGFORM = "ira_podrez_longform"

# id, family, gapKind, modes, mechanism, question strategy, contraindications, evidence reel ids (family level, hand-linked), basis
C = [
 ("P01", "narrow_categorical", "no_boundary", ["explanation", "ready_thought"],
  "Найти условие, при котором общее утверждение перестаёт работать.", "Спросить, в какой ситуации это утверждение не сработает.",
  ["Не применять к утверждениям автора о самом себе.", "Не придумывать исключение за автора.", "Медицинские, финансовые и юридические темы: нужен источник, а не исключение.", "Признаки кризиса: остановить вопросы."],
  ["C1cLekwt5kQ", "C9PpQYjN0OT", "DAHUH-ktuFs", "DWmRFd-jAla", "Daj83coIAHM", "DZDRhKVolvp"], "families"),
 ("P02", "separate_concepts", "unclear_terms", ["explanation", "ready_thought"],
  "Развести два близких понятия по наблюдаемой разнице.", "Спросить, чем для автора отличаются два слова, когда он замечает их в жизни.",
  ["Не давать определение за автора.", "Не применять, если автор сознательно использует слова как синонимы.", "Профессиональные термины с разницей по источнику не трогать."],
  ["C7or6uoN6vm", "C9PpQYjN0OT"], "families"),
 ("P03", "check_premise", "facts_vs_interpretation", ["explanation", "observation", "personal_story"],
  "Отделить допущение, поданное как данность, от того, что автор сам видел.", "Спросить, на чём держится допущение: что автор видел или проверял сам.",
  ["Не применять к простому описанию опыта автора.", "Не вести к диагнозу по мотивам другого человека.", "Тема травмы: не настаивать."],
  ["DaS5xcOsJmM", "DboIv5kMB4f", "DbJHNvOMPGw", "Da_EDoTIxjG", "DZxeSOiID-Q"], "families"),
 ("P04", "abstraction_to_model", "no_episode", ["personal_story", "observation", "unspecified"],
  "Перевести общее рассуждение в один конкретный случай автора.", "Спросить, какой один случай из жизни автора это показывает.",
  ["Не подсказывать случай за автора.", "Не применять, если случай уже рассказан.", "Не требовать подробностей о тяжёлых событиях и третьих лицах.", "Принять «случаев нет» как ответ."],
  ["Da0czvdsi1s", "DY4y8zQoAp-", "DbfLCIxBytn"], "families"),
 ("P05", "case_to_rule", "no_thesis", ["personal_story"],
  "Вывести из рассказанного случая правило с условием.", "Спросить, что из этого случая автор сказал бы человеку в похожем положении.",
  ["Не превращать один случай в закон: вывод только как «в моём случае».", "Не принуждать к морали.", "Не применять, если автор хочет только рассказать историю."],
  ["Db-S6X-octp", "Db5Al1QsHiw", "DbTpNbep1lR"], "families"),
 ("P06", "redefine_by_criterion", "unclear_terms", ["explanation", "ready_thought"],
  "Заменить нагруженное слово проверяемым признаком.", "Спросить, по какому признаку автор поймёт, что это именно так, а не иначе.",
  ["Клинические термины и диагнозы не переопределять.", "Не применять, если слово задано профессиональным стандартом."],
  ["DbsjCebBI-P", "DW_C0IPjFoO", "DbEDiLEtfun"], "families"),
 ("P07", "unfold_vague", "no_mechanism", ["personal_story", "observation"],
  "Развернуть эмоциональный ярлык в исход, который автор признаёт своим.", "Спросить, что, по мнению автора, произойдёт дальше, если это случится; не больше пяти шагов.",
  ["Остановиться, когда исход назван и признан своим или ответ «не знаю».", "Не объяснять причину за автора.", "Признаки кризиса: остановить вопросы."],
  ["DbvHWcIhkfw", "DbQ2_7ihCj1", "DcBQm01It5r"], SINGLE_AUTHOR_LONGFORM),
 ("P08", "unfold_vague", "no_mechanism", ["personal_story", "observation"],
  "Восстановить процесс выбора: что происходит в момент, когда автор поступает вопреки своему желанию.", "Спросить, как это обычно происходит в момент выбора не делать.",
  ["Не ставить диагноз и не объяснять «устройство психики».", "Не применять, если процесс уже описан."],
  ["DbQ2_7ihCj1", "DcBMs-IoUuW"], SINGLE_AUTHOR_LONGFORM),
 ("P09", "case_to_rule", "repeat_unchecked", ["personal_story", "observation"],
  "Проверить закономерность вторым случаем.", "Спросить, был ли ещё один похожий случай.",
  ["Не настаивать, если автор говорит о единичном событии.", "Не требовать второго случая в чувствительных темах.", "Совпадение считать по действию, не по словам."],
  ["DcBQm01It5r", "DcBMs-IoUuW", "DcsbfVwzciw"], SINGLE_AUTHOR_LONGFORM),
 ("P10", "unfold_vague", "facts_vs_interpretation", ["personal_story"],
  "Заменить оценку другого человека описанием того, что автор заметил со стороны.", "Спросить, что именно человек сказал или сделал.",
  ["Не объяснять мотив третьего лица.", "Темы насилия или угрозы: приоритет безопасность."],
  [], SINGLE_AUTHOR_LONGFORM),
 ("P11", "abstraction_to_model", "no_episode", ["personal_story"],
  "Развернуть случай в минимальную сцену из двух-трёх действий.", "Спросить, что в тот момент произошло.",
  ["Не применять к тяжёлым событиям.", "Не применять, если сцена уже описана."],
  [], SINGLE_AUTHOR_LONGFORM),
 ("P12", "check_premise", "facts_vs_interpretation", ["personal_story"],
  "Сравнить ожидание автора и фактический результат.", "Спросить, чего автор ждал в тот момент.",
  ["Не подталкивать к самообвинению.", "Не применять, если ожидание и результат уже названы."],
  [], SINGLE_AUTHOR_LONGFORM),
]
cands, prov = [], {}
for cid, family, gap, modes, mech, strat, contra, evid, basis in C:
    f = fam[family]
    verified = [a for a in f["authors"] if a in QUOTE_VERIFIED]
    unverified = [a for a in f["authors"] if a not in QUOTE_VERIFIED and a != "hadunkin"]
    single = basis == SINGLE_AUTHOR_LONGFORM
    status = "candidate" if len(verified) >= 2 and not single else "hypothesis"
    reason = (f"операция у {len(verified)} авторов с дословно подтверждёнными цитатами ({', '.join(verified)})" if status == "candidate"
              else ("вопрос получен из длинных эфиров одного автора (ira_podrez)" if single
                    else f"операция подтверждена у {len(verified)} автора с дословными цитатами ({', '.join(verified) or 'нет'}): нужно минимум два"))
    if cid == "P07":
        status, reason = "withheld", "задержана 08.10.2026: граница с психотерапией (цепочка «и чем это закончится»); запрет по STAGE_CARDS.md сохраняется; в первую партию не входит"
    cands.append({
        "id": f"cand_{cid.lower()}", "family": family, "principleRef": cid, "gapKind": gap, "contentModes": modes,
        "when": f"в дубле виден признак пробела типа {gap} (см. 01b_inversion.md)",
        "input": "последний дубль автора и состояние мысли; без текста сценария и без чужих цитат",
        "move": strat, "mechanism": mech, "questionStrategy": strat,
        "check": "ответ автора содержит конкретику (случай, признак, условие) или честное «не знаю»; без вывода за автора",
        "risk": "; ".join(contra[:2]), "contraindications": contra,
        "status": status, "statusReason": reason,
        "questionEffect": "не проверено: проверяется только на сыром дубле в K5",
    })
    prov[f"cand_{cid.lower()}"] = {
        "family": family,
        "principleHeadings": f["headings"],
        "authorsQuoteVerified": verified,
        "authorsUnverified": unverified,
        "hadunkin": "принципы сформулированы пересказом, цитаты не дословны (0 из 6)" if "hadunkin" in f["authors"] else None,
        "evidenceReelIds": evid,
        "basis": basis,
    }
out = root / "Analyz/craft"
(out / "02_candidates.json").write_text(json.dumps({"version": "k2-1", "note": "Кандидаты, не карточки каталога. Поля mechanism/questionStrategy/contraindications совпадают со схемой рантайма; остальные только для разбора.", "candidates": cands}, ensure_ascii=False, indent=1), encoding="utf-8")
(out / "provenance.json").write_text(json.dumps({"version": "k2-1", "note": "Происхождение кандидатов: семейства принципов, авторы, id роликов. Только в разборе; в рантайм не попадает.", "candidates": prov}, ensure_ascii=False, indent=1), encoding="utf-8")
for c in cands: print(c["id"], c["status"], "|", c["statusReason"][:90])
