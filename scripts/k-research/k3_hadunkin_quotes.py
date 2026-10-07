"""K3: how many quoted fragments in the hadunkin author summary appear verbatim in his transcripts? Counts only."""
import re, glob, pathlib
root = pathlib.Path(__file__).resolve().parents[2] / "Analyz" / "hadunkin"
def norm(t):
    t = t.lower().replace("ё", "е"); t = re.sub(r"[^a-zа-я0-9]+", " ", t); return re.sub(r"\s+", " ", t).strip()
corpus = norm(" ".join(pathlib.Path(f).read_text(encoding="utf-8", errors="ignore") for f in glob.glob(str(root / "*.txt"))))
files = [root / "_out/_author/01_corpus-hypotheses.md", root / "_out/_author/00_pilot-hypotheses.md"]
total = found = 0
for f in files:
    text = f.read_text(encoding="utf-8")
    for q in re.findall(r"«([^»]{20,})»", text):
        total += 1
        parts = [norm(p) for p in re.split(r"\.{3}|…", q) if len(norm(p)) >= 12]
        if parts and all(p in corpus for p in parts):
            found += 1
print(f"hadunkin quoted fragments (>=20 chars): {found}/{total} verbatim in transcripts")
