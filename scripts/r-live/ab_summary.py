"""Summary of rich-author runs by question-rules variant. Usage: ab_summary.py <glob-dir> (reads <dir>/h1-<variant>-<seed>.json)."""
import glob, json, os, re, statistics, sys
d = sys.argv[1]
runs = {}
for f in sorted(glob.glob(os.path.join(d, "h1-*-*.json"))):
    m = re.search(r"h1-([ABC])-(\d+)\.json$", f)
    if not m: continue
    j = json.load(open(f)); runs.setdefault(m.group(1), []).append((int(m.group(2)), j))
def agg(j):
    r = [x for x in j["results"] if not x.get("notExecuted")]
    calls = sum(x["dialogueCalls"] for x in r); facts = sum(x["factCalls"] for x in r)
    return dict(
        dialogues=len(r), calls=calls, factCalls=facts, factShare=facts / calls if calls else 0,
        accepted=sum(x["acceptedFactsInState"] for x in r), shown=sum(x["shownQuestions"] for x in r),
        repeats=sum(x["leftoverRepeats"] for x in r), problems=sum(x["leftoverProblems"] for x in r),
        over15=sum(x["over15"] for x in r), ty=sum(x["tyInQuestions"] for x in r),
        offers=sum(1 for x in r if x["firstOfferTurn"] is not None), interceptTopic=sum(x["guardTopicRepeat"] for x in r),
        regen=sum(x["guardLexiconRegenerated"] for x in r), fallback=sum(x["guardLexiconFallback"] for x in r),
        words=sum(x["questionWordsAvg"] * x["shownQuestions"] for x in r) / max(1, sum(x["shownQuestions"] for x in r)),
        tokens=j["spentTokens"], phraseRaw=sum(int(x["phrasesRaw"].split("/")[0]) for x in r if x["phrasesRaw"]), phraseTot=sum(int(x["phrasesRaw"].split("/")[1]) for x in r if x["phrasesRaw"]),
        failures=len(j["failures"]),
    )
print("| вариант | прогон (зерно) | факт-вызовов / вызовов | доля | принято фактов (на диалог) | повторы темы | нарушения G2 | длиннее 15 слов | «ты»/род | дошли до сборки | перехвачено G1 | перегенерации / шаблоны G2 | сбои провайдера | токены |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
for v in "ABC":
    allc = allf = 0
    shares = []
    for seed, j in runs.get(v, []):
        a = agg(j); shares.append(a["factShare"]); allc += a["calls"]; allf += a["factCalls"]
        print(f"| {v} | {seed} | {a['factCalls']}/{a['calls']} | {a['factShare']*100:.0f} % | {a['accepted']} ({a['accepted']/a['dialogues']:.1f}) | {a['repeats']} из {a['shown']} | {a['problems']} | {a['over15']} | {a['ty']} | {a['offers']} из {a['dialogues']} | {a['interceptTopic']} | {a['regen']} / {a['fallback']} | {a['failures']} | {a['tokens']:,} |".replace(",", " "))
    if shares:
        print(f"| **{v} всего** | {len(shares)} | {allf}/{allc} | **{100*allf/allc:.0f} %** (разброс {100*min(shares):.0f}–{100*max(shares):.0f} %) | | | | | | | | | | |")
