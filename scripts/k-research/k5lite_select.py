"""K5-lite: pick 20 raw takes from the corpus with a fixed seed. Prints ids and sources only; the texts go to a PRIVATE file
outside the repository (argv[1]), never to stdout. Strata: explanation, personal reflection, story, other expert genres."""
import json, random, pathlib, sys
root = pathlib.Path(__file__).resolve().parents[2] / "Analyz"
SEED = 20261008
rng = random.Random(SEED)
QUOTA = [("chemistry_by_olga", "explanation", 3), ("lermontova.career", "explanation", 3), ("SirDenisov", "explanation (business)", 2),
         ("vipsauna", "other (lifestyle/business)", 2), ("marysstories", "story", 4), ("ira_podrez", "story/reflection", 2), ("hadunkin", "personal reflection", 4)]
picked = []
for author, genre, n in QUOTA:
    if author == "hadunkin":
        cat = json.load(open(root / "hadunkin/_out/01_catalog_80plus.json", encoding="utf-8"))
        pool = [c for c in cat if 70 <= c["words"] <= 160 and not c.get("dupOf")]
        rows = [{"id": c["id"], "text": (root / "hadunkin" / c["file"]).read_text(encoding="utf-8", errors="ignore").strip(), "words": c["words"]} for c in pool]
    else:
        recs = json.load(open(root / f"Blogers2/{author}_combined.json", encoding="utf-8"))["records"]
        rows = [{"id": r["instagram_id"], "text": r["text"].strip(), "words": r["word_count"]} for r in recs if 70 <= r["word_count"] <= 160 and r["text"].strip()]
    rows.sort(key=lambda r: r["id"])
    for r in rng.sample(rows, n):
        picked.append({"n": 0, "id": r["id"], "source": author, "genre": genre, "words": r["words"], "text": r["text"]})
rng.shuffle(picked)
for i, p in enumerate(picked, 1):
    p["n"] = i
json.dump(picked, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for p in picked:
    print(p["n"], p["id"], p["source"], p["genre"], p["words"])
