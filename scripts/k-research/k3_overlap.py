"""K3: no phrase of a blogger in the candidate texts. 4-word shingles of our wording against all transcripts of the five authors.
Prints only OUR shingles that also occur in a transcript (so nothing from the transcripts is shown beyond those short matches)."""
import json, re, glob, pathlib
root = pathlib.Path(__file__).resolve().parents[2] / "Analyz"
def norm(t):
    t = t.lower().replace("ё", "е"); t = re.sub(r"[^a-zа-я0-9]+", " ", t); return re.sub(r"\s+", " ", t).strip()
corpus = []
for a in ["chemistry_by_olga", "marysstories", "ira_podrez", "lermontova.career"]:
    corpus += [norm(r["text"]) for r in json.load(open(root / f"Blogers2/{a}_combined.json", encoding="utf-8"))["records"]]
corpus += [norm(pathlib.Path(f).read_text(encoding="utf-8", errors="ignore")) for f in glob.glob(str(root / "hadunkin/*.txt"))]
big = " " + " | ".join(corpus) + " "
def shingles(text, n=4):
    w = norm(text).split()
    return {" ".join(w[i:i + n]) for i in range(len(w) - n + 1)}
cands = json.load(open(root / "craft/02_candidates.json", encoding="utf-8"))["candidates"]
inversion = (root / "craft/01b_inversion.md").read_text(encoding="utf-8")
questions = re.findall(r"\*\*Вопрос[^:]*:\*\*\s*«([^»]+)»", inversion)
hits = []
for c in cands:
    text = " ".join([c["mechanism"], c["questionStrategy"], *c["contraindications"]])
    for s in shingles(text):
        if f" {s} " in big: hits.append((c["id"], s))
for q in questions:
    for s in shingles(q):
        if f" {s} " in big: hits.append(("01b question", s))
print(f"texts checked: {len(cands)} candidates, {len(questions)} questions; shingle size 4; corpus records: {len(corpus)}")
print(f"matches: {len(hits)}")
for h in hits: print("  ", *h)
