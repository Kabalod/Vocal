// Offline replay (no model, no DB writes): runs decideTurnPolicy over recorded dialogues to show where each rule would have fired.
// ASSUMPTION (an upper bound, not the real state): every author answer of 5+ words that is not "не знаю"/a command/an end phrase/
// off-topic became an accepted fact. Usage: tsx policy_replay.ts <dialogues.md>   Prints rule names and turn numbers, never texts.
import { readFileSync } from "node:fs";
import { decideTurnPolicy, isCommandText, isDontKnow, isEndPhrase, wordCount, type PolicyTurn } from "../../src/lib/turn-policy";

const OFF = ["А какая сегодня погода?", "Расскажи анекдот.", "Кто выиграл матч вчера?", "Кстати, какой сегодня курс доллара?", "Расскажи что-нибудь смешное."];
const text = readFileSync(process.argv[2], "utf8");
for (const block of text.split(/\n## /).slice(1)) {
  const title = block.split("\n")[0].slice(0, 44);
  const lines = [...block.matchAll(/\*\*Автор:\*\* (.*)|\*\*Vocal\*\* \((\w+)\): (.*)/g)];
  const turns: PolicyTurn[] = [];
  const facts: { id: string; sourceId: string; text: string }[] = [];
  const fired: string[] = [];
  let n = 0;
  let uid = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i];
    if (m[1] !== undefined) {
      uid += 1;
      const id = `u${uid}`;
      turns.push({ role: "user", id, body: m[1], marks: [], action: "" });
      const next = lines[i + 1];
      if (!next || next[1] !== undefined) continue;
      const kind = next[2] === "text" ? "suggest_take" : "ask_question";
      const accepted = wordCount(m[1]) >= 5 && !isDontKnow(m[1]) && !isCommandText(m[1]) && !isEndPhrase(m[1]) && !OFF.includes(m[1]);
      const decision = decideTurnPolicy({
        turns,
        state: { facts: [...facts, ...(accepted ? [{ id: `f${uid}`, sourceId: id, text: m[1] }] : [])].slice(0, accepted ? undefined : facts.length), position: "", intent: "", takeTask: "", openGaps: [] },
        reply: { kind, hasFact: accepted, hasSignal: false, serverMade: OFF.includes(m[1]) },
        understanding: facts.length + (accepted ? 1 : 0) > 0 ? "Я понял так: …. Собрать сценарий?" : null,
      });
      n += 1;
      if (accepted) facts.push({ id: `f${uid}`, sourceId: id, text: m[1] });
      if (decision) {
        fired.push(`turn ${n}: ${decision.kind} ${decision.marks.join("+")}`);
        turns.push({ role: "assistant", id: `a${uid}`, body: "", marks: decision.marks, action: "ask_question" });
      } else turns.push({ role: "assistant", id: `a${uid}`, body: "", marks: [], action: kind });
    }
  }
  console.log(`${title.padEnd(46)} author turns=${n} facts~${facts.length}  ${fired.length ? fired.join("; ") : "no rule fires"}`);
}
