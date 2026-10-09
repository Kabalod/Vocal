// Offline: replays G1/G2 over the questions of a recorded fixture dialogue (tests/fixtures/transcript-run3/*.json): how many
// questions the guards would stop, and question lengths. Usage: tsx guard_replay.ts P1 P2 ...
import { readFileSync } from "node:fs";
import path from "node:path";
import { detectGenre, questionProblem, topicRepeat } from "../../src/lib/question-guard";
import { isSubstantiveAnswer } from "../../src/lib/turn-policy";

type Turn = { role: "user" | "assistant"; kind?: string; text: string };
const totals = { q: 0, repeat: 0, problem: 0, either: 0, words: 0, over15: 0 };
for (const id of process.argv.slice(2)) {
  const f = JSON.parse(readFileSync(path.join(__dirname, "../../tests/fixtures/transcript-run3", `${id}.json`), "utf8")) as { take: string; turns: Turn[] };
  const genre = detectGenre([f.take, ...f.turns.filter((t) => t.role === "user").map((t) => t.text)]);
  const past: { q: string; answered: boolean }[] = [];
  let q = 0, repeat = 0, problem = 0, either = 0, words = 0, over15 = 0;
  f.turns.forEach((turn, i) => {
    if (turn.role !== "assistant" || turn.kind !== "question" || /^(Я понял так|Пока у нас так)/.test(turn.text)) return;
    const before = f.turns.slice(0, i).filter((t) => t.role === "user" && t.text !== "уточни").map((t) => t.text);
    const r = topicRepeat({ question: turn.text, answeredQuestions: past.filter((p) => p.answered).map((p) => p.q), allQuestions: past.map((p) => p.q), authorTexts: before });
    const p = questionProblem(turn.text, { genre, lastAnswer: before[before.length - 1] });
    q += 1; if (r) repeat += 1; if (p) problem += 1; if (r || p) either += 1;
    const w = turn.text.split(/\s+/).length; words += w; if (w > 15) over15 += 1;
    const next = f.turns.slice(i + 1).find((t) => t.role === "user");
    past.push({ q: turn.text, answered: Boolean(next) && isSubstantiveAnswer(next!.text, turn.text) });
  });
  console.log(`${id}: questions=${q} topic repeats=${repeat} lexicon/length/genre problems=${problem} stopped=${either} avg words=${(words / q).toFixed(1)} over 15 words=${over15}`);
  totals.q += q; totals.repeat += repeat; totals.problem += problem; totals.either += either; totals.words += words; totals.over15 += over15;
}
console.log(`TOTAL questions=${totals.q} repeats=${totals.repeat} problems=${totals.problem} stopped=${totals.either} avg words=${(totals.words / totals.q).toFixed(1)} over 15 words=${totals.over15}`);
