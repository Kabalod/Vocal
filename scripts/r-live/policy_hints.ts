// Offline: how many Vocal questions in a dialogues markdown would the hint detector (alternatives / assumed role) and the echo
// detector flag? Prints counts only. Usage: tsx policy_hints.ts <dialogues.md> ...
import { readFileSync } from "node:fs";
import { questionEchoesAuthor, questionNeedsHintCheck } from "../../src/lib/turn-policy";

for (const file of process.argv.slice(2)) {
  let questions = 0, hints = 0, echoes = 0;
  const flagged: string[] = [];
  for (const block of readFileSync(file, "utf8").split(/\n## /).slice(1)) {
    const answers: string[] = [];
    for (const m of block.matchAll(/\*\*Автор:\*\* (.*)|\*\*Vocal\*\* \(question\): (.*)/g)) {
      if (m[1] !== undefined) { answers.push(m[1]); continue; }
      if (answers.length === 0) continue;
      const q = m[2];
      if (q.startsWith("Я понял так:")) continue;
      questions += 1;
      const kind = questionNeedsHintCheck(q, answers.join(" "));
      if (kind) { hints += 1; flagged.push(`${kind}: ${q.slice(0, 110)}`); }
      if (questionEchoesAuthor(q, answers.slice(-1))) echoes += 1;
    }
  }
  console.log(`${file.split("/").pop()}: questions=${questions} hints=${hints} echoes=${echoes}`);
  for (const f of flagged) console.log(`   ${f}`);
}
