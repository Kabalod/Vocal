"""Offline tuning of the turn-policy thresholds on recorded dialogues (no model). Prints counts only, never author texts.
Usage: policy_tune.py <dialogues.md> ...   Dialogue file format: '## n. title', '**Автор:** text', '**Vocal** (kind): text'."""
import re, sys
def load(p):
    out = []
    for d in re.split(r"\n## ", open(p, encoding="utf-8").read())[1:]:
        title = d.split("\n")[0]
        turns = []
        for m in re.finditer(r"\*\*Автор:\*\* (.*)|\*\*Vocal\*\* \((\w+)\): (.*)", d):
            if m.group(1) is not None: turns.append(("u", m.group(1)))
            else: turns.append(("a", m.group(3)))
        out.append((title, turns))
    return out
def toks(s): return {w for w in re.sub(r"[^a-zа-я0-9\s]", " ", s.lower().replace("ё", "е")).split() if len(w) >= 4}
def jac(a, b):
    A, B = toks(a), toks(b); sh = len(A & B)
    return sh / (len(A | B)) if A and B else 0
def contain(q, ans):  # share of the question's content words that the author's last answer already contains
    Q, A = toks(q), toks(ans)
    return len(Q & A) / len(Q) if Q else 0
files = sys.argv[1:]
print("== A5: author answer lengths in words (commands skipped)")
for f in files:
    for title, turns in load(f):
        ans = [len(t.split()) for k, t in turns if k == "u" and t.strip().lower() not in ("уточни",)]
        print(f"{f.split('/')[-1][:28]:28} {title[:30]:30} {ans}")
print("== A9: consecutive question pairs by Jaccard (>=0.4), count per threshold")
for f in files:
    for th in (0.7, 0.6, 0.55, 0.5):
        n = 0; tot = 0
        for title, turns in load(f):
            qs = [t for k, t in turns if k == "a"]
            tot += max(0, len(qs) - 1)
            n += sum(1 for a, b in zip(qs, qs[1:]) if jac(a, b) >= th)
        print(f"{f.split('/')[-1][:28]:28} th={th} flagged={n}/{tot}")
print("== A8: question echoes the author's last answer (share of question words found in that answer)")
for f in files:
    vals = []
    for title, turns in load(f):
        last = None
        for k, t in turns:
            if k == "u": last = t
            elif last is not None: vals.append(contain(t, last))
    for th in (0.8, 0.7, 0.6, 0.5):
        print(f"{f.split('/')[-1][:28]:28} th={th} flagged={sum(1 for v in vals if v >= th)}/{len(vals)}")
