"""K3: are the evidence quotes of the verifiable authors verbatim? Script only, ids and counts printed, no text."""
import json, re, sys, pathlib
root = pathlib.Path(__file__).resolve().parents[2] / "Analyz"
PAIRS = {  # author: (evidence file, combined transcripts)
    "chemistry_by_olga": ("Done/Chemistry_by_olga/semantic-evidence.json", "Blogers2/chemistry_by_olga_combined.json"),
    "marysstories": ("Done/Marysstories/semantic-evidence.json", "Blogers2/marysstories_combined.json"),
    "ira_podrez": ("Done/ira_podrez_analysis/semantic-evidence.json", "Blogers2/ira_podrez_combined.json"),
    "lermontova.career": ("Done/lermontova_career_analysis/semantic-evidence.json", "Blogers2/lermontova.career_combined.json"),
}
def norm(text):
    text = text.lower().replace("ё", "е")
    text = re.sub(r"[^a-zа-я0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()
def pieces(quote):
    # Evidence quotes may contain ellipses between fragments: every fragment must be verbatim.
    parts = re.split(r"\.{3}|…|\s/\s|\s\|\s", quote)
    return [norm(p) for p in parts if len(norm(p)) >= 6]
total = ok = 0
bad = []
for author, (ev, combined) in PAIRS.items():
    items = json.load(open(root / ev, encoding="utf-8"))["items"]
    records = {r["instagram_id"]: norm(r["text"]) for r in json.load(open(root / combined, encoding="utf-8"))["records"]}
    a_ok = a_total = 0
    for it in items:
        a_total += 1
        text = records.get(it["instagram_id"])
        frags = pieces(it["quote"])
        if text is not None and frags and all(f in text for f in frags):
            a_ok += 1
        else:
            bad.append((author, it["instagram_id"], "no transcript" if text is None else "fragment not found"))
    print(f"{author}: {a_ok}/{a_total} verbatim")
    total += a_total; ok += a_ok
print(f"TOTAL {ok}/{total}")
for b in bad: print("  mismatch:", *b)
