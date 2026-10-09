// Offline E2 metrics on a rich-author dialogues markdown (no model): author phrases and facts found in the script, raw and cleaned.
// Usage: tsx script_metrics.ts <dialogues.md> [<raw.jsonl with the model's dialogue answers>]
// Facts: when a raw file is given, the facts the model PROPOSED (thoughtUpdate.fact) are used as an approximation of accepted facts.
import { readFileSync } from "node:fs";
import { factShares, fillersIn, phraseShares } from "./script-metrics-lib";

const md = readFileSync(process.argv[2], "utf8");
const raw = process.argv[3] ? readFileSync(process.argv[3], "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { dialogue: string; label: string; text: string }) : [];
const totals = { pr: [0, 0], pc: [0, 0], fr: [0, 0], fc: [0, 0], fill: 0 };
for (const block of md.split(/\n## /).slice(1)) {
  const id = block.split(".")[0];
  const answers = [...block.matchAll(/\*\*Автор:\*\* (.*)/g)].map((m) => m[1]).slice(1);
  const script = block.match(/\*\*Сценарий:\*\*\n\n([\s\S]*?)(?:\n\n\*\*Что изменено|\n\n\*\*Скрытая)/)?.[1] ?? "";
  if (!script) { console.log(`${id}: no script`); continue; }
  const facts = raw
    .filter((r) => r.dialogue === id && r.label === "dialogue")
    .flatMap((r) => { try { const f = (JSON.parse(r.text) as { thoughtUpdate?: { fact?: { text?: string } | null } }).thoughtUpdate?.fact; return f?.text ? [f.text] : []; } catch { return []; } });
  const p = phraseShares(answers, script);
  const f = factShares(facts, script);
  console.log(`${id}: phrases raw ${p.raw.found}/${p.raw.total} clean ${p.clean.found}/${p.clean.total}; facts raw ${f.raw.found}/${f.raw.total} clean ${f.clean.found}/${f.clean.total}; fillers in script ${fillersIn(script)}`);
  totals.pr[0] += p.raw.found; totals.pr[1] += p.raw.total; totals.pc[0] += p.clean.found; totals.pc[1] += p.clean.total;
  totals.fr[0] += f.raw.found; totals.fr[1] += f.raw.total; totals.fc[0] += f.clean.found; totals.fc[1] += f.clean.total; totals.fill += fillersIn(script);
}
const pct = (x: number[]) => `${x[0]}/${x[1]} = ${x[1] ? Math.round((100 * x[0]) / x[1]) : 0}%`;
console.log(`TOTAL phrases raw ${pct(totals.pr)}, clean ${pct(totals.pc)}; facts raw ${pct(totals.fr)}, clean ${pct(totals.fc)}; fillers in scripts ${totals.fill}`);
