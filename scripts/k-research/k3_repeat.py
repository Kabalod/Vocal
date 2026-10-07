"""K3: how often do five authors with transcripts show the lexical trace of each operation? Share of records with a marker.
A rough proxy (word markers), not proof that the operation is the one named; it only shows whether the trace repeats across
authors. No transcript text is printed."""
import json, re, glob, pathlib
root = pathlib.Path(__file__).resolve().parents[2] / "Analyz"
def norm(t):
    t = t.lower().replace("ё", "е"); t = re.sub(r"[^a-zа-я0-9]+", " ", t); return " " + re.sub(r"\s+", " ", t).strip() + " "
corpora = {}
for a in ["chemistry_by_olga", "marysstories", "ira_podrez", "lermontova.career"]:
    recs = json.load(open(root / f"Blogers2/{a}_combined.json", encoding="utf-8"))["records"]
    corpora[a] = [norm(r["text"]) for r in recs if len(r["text"].split()) >= 40]
corpora["hadunkin"] = [norm(pathlib.Path(f).read_text(encoding="utf-8", errors="ignore")) for f in glob.glob(str(root / "hadunkin/*.txt"))]
corpora["hadunkin"] = [t for t in corpora["hadunkin"] if len(t.split()) >= 40]
MARKERS = {
    "P01 narrow (condition / not always)": r" не всегда | не обязательно | зависит от | в зависимости от | не значит | не означает | если только | кроме случаев ",
    "P02 separate (difference between)": r" разниц\w+ между | отличается от | не то же самое | это не одно и то же | путают | разные вещи ",
    "P03 premise (what is taken as given)": r" принято считать | многие думают | все думают | на самом деле | миф | говорят что | считается что | почему то считают ",
    "P04 case/episode (concrete case)": r" например | у меня был | у меня была | однажды | как то раз | один раз | вчера | недавно | в прошлый раз | случай ",
    "P05 case→rule (so, rule)": r" поэтому | значит | вывод | правило | урок | отсюда | в итоге ",
    "P06 redefine (what it means)": r" что значит | это значит | определение | называется | то есть | под этим я понимаю | на самом деле это ",
}
print(f"{'operation (marker proxy)':44}" + "".join(f"{a[:12]:>14}" for a in corpora))
print(f"{'records with >=40 words':44}" + "".join(f"{len(v):>14}" for v in corpora.values()))
for name, pat in MARKERS.items():
    rx = re.compile(pat)
    row = []
    for a, texts in corpora.items():
        row.append(sum(1 for t in texts if rx.search(t)) / max(1, len(texts)))
    print(f"{name:44}" + "".join(f"{x*100:13.0f}%" for x in row))
