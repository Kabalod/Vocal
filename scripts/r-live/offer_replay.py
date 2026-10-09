"""I1 offline replay (no model): in how many dialogues of h1-B-* the build would have been offered, under the old and the new state G.
Approximations: accepted facts = facts the model PROPOSED up to the turn (raw log); units = author answers so far (all are 50+ words);
effect asked = the viewer-effect question was shown, answered = the author's next message exists. Usage: offer_replay.py <dir> [variant]"""
import json, re, sys, glob, os
d = sys.argv[1]; variant = sys.argv[2] if len(sys.argv) > 2 else "B"
EFFECT = re.compile(r"человек должен сделать после ролика|зрител.*(почувствовать|сделать)", re.I)
old_total = new_total = 0; total = 0; actual = 0
rows = []
for seed in (1, 2, 3):
    md = open(os.path.join(d, f"h1-{variant}-{seed}.md"), encoding="utf-8").read()
    raw = [json.loads(l) for l in open(os.path.join(d, f"h1-{variant}-{seed}-raw.jsonl"), encoding="utf-8")]
    res = json.load(open(os.path.join(d, f"h1-{variant}-{seed}.json")))
    for block in re.split(r"\n## ", md)[1:]:
        pid = block.split(".")[0]
        total += 1
        seq = []
        for m in re.finditer(r"\*\*Автор:\*\* (.*)|\*\*Vocal\*\* \((\w+)\): (.*)", block):
            seq.append(("u", m.group(1)) if m.group(1) is not None else ("v", m.group(3)))
        calls = [r for r in raw if r["dialogue"] == pid and r["label"] == "dialogue"]
        facts = 0; action = False; effect_asked_turn = None
        old_at = new_at = None
        turn = 0
        for idx, (k, text) in enumerate(seq):
            if k == "u":
                turn += 1
                # the call that answered this author message
                call = calls[turn - 1] if turn - 1 < len(calls) else None
                if call:
                    try:
                        j = json.loads(call["text"])
                        if (j.get("thoughtUpdate") or {}).get("fact"): facts += 1
                        if j.get("action") == "suggest_take": action = True
                    except Exception: pass
            else:
                if effect_asked_turn is None and EFFECT.search(text): effect_asked_turn = turn
            effect_answered = effect_asked_turn is not None and turn > effect_asked_turn
            units = turn - 1  # the first message is the command
            if units >= 2:
                if old_at is None and action and effect_answered: old_at = turn
                if new_at is None and (facts >= 3 or effect_answered or action): new_at = turn
        pr = next((r for r in res["results"] if r["persona"] == pid), {})
        was = pr.get("firstOfferTurn")
        actual += 1 if was is not None else 0
        old_total += 1 if old_at is not None else 0; new_total += 1 if new_at is not None else 0
        rows.append((seed, pid, was, old_at, new_at))
for r in rows: print(f"seed {r[0]} {r[1]}: actual offer turn={r[2]} old-rule replay={r[3]} new-rule replay={r[4]}")
print(f"TOTAL {total} dialogues: actual offers {actual}; old rule replay {old_total}; new rule replay {new_total}")
