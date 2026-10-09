// H2 (offline, no model): the effect of normalizeTranscript on author answers the model returned NO fact for (from a run's md + raw log).
// Usage: tsx normalize_effect.ts <dialogues.md> <raw.jsonl>   Prints counts and two short examples of our own simulated author.
import { readFileSync } from "node:fs";
import { normalizeTranscript } from "../../src/lib/author-speech";
import { fillersIn } from "./script-metrics-lib";

const md = readFileSync(process.argv[2], "utf8");
const raw = readFileSync(process.argv[3], "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { dialogue: string; label: string; text: string });
let answers = 0, rejected = 0, wordsBefore = 0, wordsAfter = 0, fillersBefore = 0, fillersAfter = 0, sentBefore = 0, sentAfter = 0;
const examples: string[] = [];
for (const block of md.split(/\n## /).slice(1)) {
  const id = block.split(".")[0];
  const said = [...block.matchAll(/\*\*Автор:\*\* (.*)/g)].map((m) => m[1]);
  const calls = raw.filter((r) => r.dialogue === id && r.label === "dialogue");
  calls.forEach((call, i) => {
    const text = said[i];
    if (!text) return;
    answers += 1;
    let fact = false;
    try { fact = Boolean((JSON.parse(call.text) as { thoughtUpdate?: { fact?: unknown } }).thoughtUpdate?.fact); } catch { /* none */ }
    if (fact) return;
    rejected += 1;
    const norm = normalizeTranscript(text);
    wordsBefore += text.split(/\s+/).length; wordsAfter += norm.split(/\s+/).length;
    fillersBefore += fillersIn(text); fillersAfter += fillersIn(norm);
    sentBefore += Math.max(1, (text.match(/[.!?…]/g) ?? []).length); sentAfter += Math.max(1, (norm.match(/[.!?…]/g) ?? []).length);
    if (examples.length < 2 && text.split(/\s+/).length > 30) examples.push(`BEFORE: ${text.slice(0, 260)}\nAFTER:  ${norm.slice(0, 260)}`);
  });
}
console.log(`answers=${answers} rejected(no fact)=${rejected}`);
console.log(`words ${wordsBefore} -> ${wordsAfter} (${wordsBefore - wordsAfter} cut); fillers ${fillersBefore} -> ${fillersAfter}; sentences ${sentBefore} -> ${sentAfter} (per answer ${(sentBefore / rejected).toFixed(1)} -> ${(sentAfter / rejected).toFixed(1)})`);
for (const e of examples) console.log(e);
