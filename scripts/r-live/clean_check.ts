// Offline check, no model: applies stripStyleFillers to the Vocal replies of a dialogues markdown written by style-ab.ts and
// prints the share of replies with dictionary words before and after. Usage: tsx clean_check.ts <file.md> [--list]
import { readFileSync } from "node:fs";
import { stripStyleFillers } from "../../src/lib/author-text-guard";

const WORDS: Record<string, RegExp> = {
  "по вашему мнению": /по вашему мнению/i,
  "по-вашему": /по[- ]вашему(?! мнению)/i,
  "пожалуйста": /пожалуйста/i,
  "конкретн*": /конкретн\S*/i,
  "вывод/урок/позиция/тезис": /вывод\S*|урок\S*|позици\S*|тезис\S*/i,
};
const RETURN = "Это в сторону от нашей мысли, давайте вернёмся к ней.";
const text = readFileSync(process.argv[2], "utf8");
const replies = [...text.matchAll(/\*\*Vocal\*\* \((?:question|text)\): (.*)/g)].map((m) => m[1]);
const cleaned = replies.map((r) => (r.startsWith(RETURN) ? `${RETURN} ${stripStyleFillers(r.slice(RETURN.length).trim())}` : stripStyleFillers(r)));
const count = (list: string[], re: RegExp) => list.filter((r) => re.test(r)).length;
const any = (list: string[]) => list.filter((r) => Object.values(WORDS).some((re) => re.test(r))).length;
const three = /по вашему мнению|по[- ]вашему|пожалуйста/i;
console.log(`replies=${replies.length}  changed=${replies.filter((r, i) => r !== cleaned[i]).length}`);
for (const [name, re] of Object.entries(WORDS)) console.log(`  ${name.padEnd(28)} before ${count(replies, re)}  after ${count(cleaned, re)}`);
console.log(`  три вычищаемых слова         before ${count(replies, three)} (${((100 * count(replies, three)) / replies.length).toFixed(0)}%)  after ${count(cleaned, three)}`);
console.log(`  любое из слов словаря        before ${any(replies)} (${((100 * any(replies)) / replies.length).toFixed(0)}%)  after ${any(cleaned)} (${((100 * any(cleaned)) / replies.length).toFixed(0)}%)`);
if (process.argv.includes("--list")) replies.forEach((r, i) => { if (r !== cleaned[i]) console.log(`- ${r}\n  -> ${cleaned[i]}`); });
