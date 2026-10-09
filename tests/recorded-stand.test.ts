import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

process.env.VOCAL_TURN_POLICY = "0"; // 09.10: these suites predate the turn policy; it is tested in turn-policy.test.ts

/**
 * "Claude as the model" stand: the answers are written in advance in tests/recorded/*.json (by Claude, on the real promptText) and
 * replayed through the real dialogue code, with no provider. It checks OUR code on the answers written; it does NOT prove how the
 * working model (Groq) behaves.
 */
type Turn = {
  author: string;
  expect: { questionIs?: string; questionStartsWith?: string; questionIsNot?: string; questionIsNotAlso?: string; discarded: string[]; factsAdded?: number; factText?: string; gapsClosed?: number };
};
type Scenario = { name: string; description: string; note: string; thought: { title: string; body: string }; answers: unknown[]; turns: Turn[] };

const DIR = path.join(__dirname, "recorded");
const scenarios: Scenario[] = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Scenario);

test("recorded stand: scenarios are present and say what they do not prove", () => {
  assert.deepEqual(scenarios.map((s) => s.name).sort(), ["false-redirect", "offtopic", "one-case-question", "repeat-after-dont-know", "take-proposal-repeat"]);
  for (const s of scenarios) assert.match(s.note, /НЕ доказывает поведение рабочей модели Groq/);
});

test("recorded stand: a request without a recorded answer is an error, never the mock or the provider", async () => {
  const { recordedComplete, resetRecordedStandForTests } = await import("../src/lib/ai/recorded");
  const file = path.join(mkdtempSync(path.join(tmpdir(), "stand-")), "answers.json");
  writeFileSync(file, JSON.stringify({ answers: [{ label: "dialogue", userContains: ["A"], response: { ok: 1 } }] }));
  resetRecordedStandForTests();
  const env = { NODE_ENV: "test", VOCAL_AI_RECORDED: file };
  assert.equal(recordedComplete({ label: "dialogue", system: "s", user: "xAx" }, env)?.text, '{"ok":1}');
  assert.throws(() => recordedComplete({ label: "dialogue", system: "s", user: "xAx" }, env), /RECORDED_ANSWER_MISSING/, "a one-shot answer is used up");
  assert.throws(() => recordedComplete({ label: "dialogue", system: "s", user: "B" }, env), /RECORDED_ANSWER_MISSING/);
  assert.equal(recordedComplete({ label: "dialogue", system: "s", user: "A" }, { NODE_ENV: "production", VOCAL_AI_RECORDED: file }), null, "ignored in production");
});

for (const scenario of scenarios) {
  test(`recorded stand: ${scenario.name}: ${scenario.description}`, async (t) => {
    const { prisma } = await withPostgresTestDb(t);
    const dir = mkdtempSync(path.join(tmpdir(), "stand-"));
    const file = path.join(dir, "answers.json");
    writeFileSync(file, JSON.stringify({ answers: scenario.answers }));
    process.env.VOCAL_AI_RECORDED = file;
    process.env.VOCAL_TAKE_DIAGNOSIS = "1";
    const { resetRecordedStandForTests, unusedRecordedAnswers } = await import("../src/lib/ai/recorded");
    resetRecordedStandForTests();
    t.after(async () => {
      delete process.env.VOCAL_AI_RECORDED;
      delete process.env.VOCAL_TAKE_DIAGNOSIS;
      await prisma.$disconnect();
      await resetPrismaClient();
    });
    const { createThoughtFromText } = await import("../src/lib/thought-create");
    const { sendDialogueMessage } = await import("../src/lib/dialogue");
    const { getThoughtState } = await import("../src/lib/thought-state");

    const made = await createThoughtFromText({ title: scenario.thought.title, body: scenario.thought.body, idempotencyKey: `stand-${scenario.name}` });
    const reelId = made.reel.id;
    const thread = async () => prisma.dialogueThread.findUniqueOrThrow({ where: { reelId } });
    const recentQuestions: string[] = [];
    let turnNo = 0;
    for (const turn of scenario.turns) {
      turnNo += 1;
      const before = await getThoughtState(reelId);
      const messagesBefore = await prisma.dialogueMessage.count({ where: { threadId: (await thread().catch(() => ({ id: "-" }))).id, role: "assistant", status: "done" } });
      // The default model function is used: with the stand variables set it answers from the file and never from the provider.
      const page = await sendDialogueMessage(reelId, { text: turn.author, idempotencyKey: `stand-${scenario.name}-${turnNo}` });
      const reply = page.messages.filter((m) => m.role === "assistant" && m.status !== "error").at(-1);
      assert.ok(reply, `turn ${turnNo}: the author got a reply`);
      assert.notEqual(page.messages.at(-1)?.status, "error", `turn ${turnNo}: no error is shown`);
      const e = turn.expect;
      if (e.questionIs) assert.equal(reply.body, e.questionIs, `turn ${turnNo}`);
      if (e.questionStartsWith) assert.ok(reply.body.startsWith(e.questionStartsWith), `turn ${turnNo}: ${reply.body}`);
      if (e.questionIsNot) assert.notEqual(reply.body, e.questionIsNot, `turn ${turnNo}`);
      if (e.questionIsNotAlso) assert.notEqual(reply.body, e.questionIsNotAlso, `turn ${turnNo}`);
      recentQuestions.push(reply.body);
      const after = await getThoughtState(reelId);
      const added = after.facts.filter((f) => !before.facts.some((old) => old.id === f.id));
      if (e.factsAdded !== undefined) assert.equal(added.length, e.factsAdded, `turn ${turnNo}: facts added`);
      if (e.factText) assert.equal(added[0]?.text, e.factText);
      if (added[0]) {
        const author = await prisma.dialogueMessage.findFirstOrThrow({ where: { role: "user", body: turn.author }, orderBy: { createdAt: "desc" } });
        assert.equal(added[0].sourceId, author.id, "the server set the source to the author's message");
      }
      if (e.gapsClosed !== undefined) {
        assert.equal(after.openGaps.filter((g) => g.status === "resolved").length - before.openGaps.filter((g) => g.status === "resolved").length, e.gapsClosed, `turn ${turnNo}: gaps closed`);
      }
      const rows = await prisma.dialogueMessage.findMany({ where: { threadId: (await thread()).id, role: "assistant", status: "done" }, orderBy: { createdAt: "asc" } });
      const reasons = (JSON.parse(rows[messagesBefore].payloadJson) as { discardedUpdates?: string[] }).discardedUpdates ?? [];
      assert.deepEqual([...reasons].sort(), [...e.discarded].sort(), `turn ${turnNo}: counters`);
    }
    assert.deepEqual(unusedRecordedAnswers(file), [], "every recorded one-shot answer was used: the scenario is written precisely");
    void recentQuestions;
  });
}
