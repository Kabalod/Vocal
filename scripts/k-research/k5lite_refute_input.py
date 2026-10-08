"""K5-lite independent refutation pass: builds the INPUT only (cards P01, P04, P07-P12 as written, plus 6 transcripts per card
chosen by seeded random stratified by author, excluding the 20 K5-lite takes). argv: 01b file, K5 takes file, out file (private).
Prints ids and sources only."""
import json, random, re, pathlib, sys
root = pathlib.Path(__file__).resolve().parents[2] / "Analyz"
text = open(sys.argv[1], encoding="utf-8").read()
used = {t["id"] for t in json.load(open(sys.argv[2], encoding="utf-8"))}
cards = {}
for m in re.finditer(r"### (P\d\d)\. (.*?)\n(.*?)(?=\n### |\n## )", text, re.S):
    if m.group(1) in {"P01", "P04", "P07", "P08", "P09", "P10", "P11", "P12"}:
        cards[m.group(1)] = f"{m.group(1)}. {m.group(2)}\n{m.group(3).strip()}"
pool = {}
for a in ["chemistry_by_olga", "marysstories", "ira_podrez", "lermontova.career", "SirDenisov", "vipsauna"]:
    recs = json.load(open(root / f"Blogers2/{a}_combined.json", encoding="utf-8"))["records"]
    pool[a] = sorted([r for r in recs if 60 <= r["word_count"] <= 220 and r["instagram_id"] not in used and r["text"].strip()], key=lambda r: r["instagram_id"])
out = []
for i, (pid, card) in enumerate(sorted(cards.items())):
    rng = random.Random(20261008 + i)
    authors = sorted(pool)
    rng.shuffle(authors)
    chosen = [(a, rng.choice(pool[a])) for a in authors]  # one per author = 6 transcripts, stratified by author
    out.append({"card": pid, "cardText": card, "transcripts": [{"id": r["instagram_id"], "source": a, "text": r["text"].strip()} for a, r in chosen]})
json.dump(out, open(sys.argv[3], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for o in out:
    print(o["card"], [(t["source"], t["id"]) for t in o["transcripts"]])
