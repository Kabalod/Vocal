import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

process.env.VOCAL_TURN_POLICY = "0"; // 09.10: these suites predate the turn policy; it is tested in turn-policy.test.ts

/**
 * Regression set "bad model answers": the real shapes of broken replies seen in the live runs of 2026-10-07, one fixture
 * per shape in tests/fixtures/bad-model-answers. Each goes through the mock model input and must not break the turn
 * (unless the shape is the turn's legitimate error), must not write anything invalid, and must be counted exactly.
 * No secrets and no transcript text: placeholders stand for ids, the wording is our own.
 */
type Fixture = {
  name: string;
  origin: string;
  author: string;
  responses: string[];
  setup: { gaps: { id: string; text: string; status: "open" | "resolved"; kind?: string }[] };
  expect: {
    turnFails: boolean;
    errorCode?: string;
    modelCalls: number;
    questionStartsWith?: string;
    questionIs?: string;
    questionIsNot?: string;
    questionHasNoId?: boolean;
    factsAdded: number;
    factText?: string;
    factSourceIsAuthorMessage?: boolean;
    factIdIsServerMade?: boolean;
    takeTaskStored?: boolean;
    gapsClosed: number;
    discarded: string[];
  };
};

const DIR = path.join(__dirname, "fixtures/bad-model-answers");
const fixtures: Fixture[] = readdirSync(DIR)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as Fixture);

test("bad-model-answers: the fixture set covers the shapes seen live", () => {
  assert.ok(fixtures.length >= 13);
  const names = new Set(fixtures.map((f) => f.name));
  for (const required of [
    "redirect-without-currentTask",
    "redirect-with-reason-instead-of-currentTask",
    "fact-without-sourceType",
    "fact-with-extra-key-id",
    "close-gap-without-fact",
    "suggest-take-with-missing-facts",
    "question-about-unknown-gap",
  ]) {
    assert.ok(names.has(required), `fixture ${required}`);
  }
  for (const f of fixtures) {
    assert.ok(f.origin.length > 10, `${f.name}: origin is recorded`);
    const text = JSON.stringify(f);
    assert.equal(/gsk_|api[_-]?key|Bearer /i.test(text), false, `${f.name}: no secrets`);
    assert.equal(/\bc[a-z0-9]{24}\b/.test(text), false, `${f.name}: no real ids`);
  }
});

for (const fixture of fixtures) {
  test(`bad-model-answers: ${fixture.name}`, async (t) => {
    const { prisma } = await withPostgresTestDb(t);
    t.after(async () => {
      await prisma.$disconnect();
      await resetPrismaClient();
    });
    const { createThoughtFromText } = await import("../src/lib/thought-create");
    const { sendDialogueMessage } = await import("../src/lib/dialogue");
    const { applyThoughtState, getThoughtState } = await import("../src/lib/thought-state");

    const made = await createThoughtFromText({ title: "Плохие ответы", body: "Я чуть не отказался от первого заказа.", idempotencyKey: `bad-${fixture.name}` });
    const reelId = made.reel.id;
    await applyThoughtState({ reelId, expectedRevision: 0, patch: { openGaps: fixture.setup.gaps as never } });

    // An earlier author message and question exist (so "older message", "repeat" and "pending gap" are real situations).
    await sendDialogueMessage(reelId, { text: "Расскажу подробнее.", idempotencyKey: "bad-prior" }, (async () => ({
      text: JSON.stringify({ action: "ask_question", question: "Как всё началось?", clarificationReason: "нужно начало", whyUnknown: "не сказано", thoughtUpdate: { fact: null, closeGapIds: [] } }),
      usage: { promptTokens: 1, completionTokens: 1 },
    })) as never);
    const older = await prisma.dialogueMessage.findFirstOrThrow({ where: { role: "user" }, orderBy: { createdAt: "asc" } });
    const before = await getThoughtState(reelId);
    const resolvedBefore = before.openGaps.filter((g) => g.status === "resolved").length;

    let calls = 0;
    const model = (async () => {
      const author = await prisma.dialogueMessage.findFirstOrThrow({ where: { role: "user" }, orderBy: { createdAt: "desc" } });
      const raw = fixture.responses[Math.min(calls, fixture.responses.length - 1)]
        .replaceAll("__AUTHOR__", author.id)
        .replaceAll("__OLDER__", older.id)
        .replaceAll("__REEL__", reelId);
      calls += 1;
      return { text: raw, usage: { promptTokens: 1, completionTokens: 1 } };
    }) as never;

    const e = fixture.expect;
    let page: Awaited<ReturnType<typeof sendDialogueMessage>> | null = null;
    let failure: unknown = null;
    try {
      page = await sendDialogueMessage(reelId, { text: fixture.author, idempotencyKey: `bad-turn-${fixture.name}` }, model);
    } catch (error) {
      failure = error;
    }

    assert.equal(calls, e.modelCalls, "model calls");
    const after = await getThoughtState(reelId);
    const author = await prisma.dialogueMessage.findFirstOrThrow({ where: { role: "user" }, orderBy: { createdAt: "desc" } });

    // A failed turn is either thrown (a validation error) or stored as an error message in the dialogue (provider/parse errors).
    const storedError = page?.messages.at(-1)?.status === "error";
    if (e.turnFails) {
      assert.ok(failure || storedError, "the turn is the legitimate error");
      if (e.errorCode) assert.equal((failure as { code?: string } | null)?.code, e.errorCode);
      assert.deepEqual(after.facts, before.facts, "nothing invalid is written");
      assert.deepEqual(after.openGaps, before.openGaps);
    } else {
      assert.equal(failure, null, `the turn must not fail: ${failure instanceof Error ? failure.message : ""}`);
      assert.equal(storedError, false, "and no error message is shown to the author");
      const questions = (page?.messages ?? []).filter((m) => m.kind === "question" || m.role === "assistant");
      const shown = (page?.messages ?? []).filter((m) => m.role === "assistant" && m.status !== "error").at(-1)?.body ?? "";
      void questions;
      if (e.questionStartsWith) assert.ok(shown.startsWith(e.questionStartsWith), `question starts with the fixed phrase: ${shown}`);
      if (e.questionIs) assert.equal(shown, e.questionIs);
      if (e.questionIsNot) assert.notEqual(shown, e.questionIsNot.replaceAll("__REEL__", reelId));
      if (e.questionIsNot) assert.equal(shown.includes(e.questionIsNot.replaceAll("__REEL__", reelId)), false);
      if (e.questionHasNoId) assert.equal(shown.includes(reelId), false, "no service id reaches the author");
      assert.ok(shown.length > 0, "the author always gets a reply");
    }

    const added = after.facts.filter((f) => !before.facts.some((old) => old.id === f.id));
    assert.equal(added.length, e.factsAdded, "facts added");
    if (e.factText) assert.equal(added[0]?.text, e.factText);
    if (e.factSourceIsAuthorMessage) {
      assert.equal(added[0]?.sourceType, "dialogue_message");
      assert.equal(added[0]?.sourceId, author.id, "the server set the source to the author's current message");
    }
    if (e.factIdIsServerMade) assert.equal(added[0]?.id, `fact_${author.id}`);
    assert.equal(after.openGaps.filter((g) => g.status === "resolved").length - resolvedBefore, e.gapsClosed, "gaps closed");
    if (e.takeTaskStored === false) assert.equal(after.takeTask, before.takeTask, "an invalid take task is never stored");

    const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId } });
    const last = await prisma.dialogueMessage.findFirst({ where: { threadId: thread.id, role: "assistant", status: "done" }, orderBy: { createdAt: "desc" } });
    const priorCount = 1;
    const reasons = (await prisma.dialogueMessage.findMany({ where: { threadId: thread.id, role: "assistant", status: "done" }, orderBy: { createdAt: "asc" } }))
      .slice(priorCount)
      .flatMap((m) => (JSON.parse(m.payloadJson) as { discardedUpdates?: string[] }).discardedUpdates ?? []);
    void last;
    assert.deepEqual([...reasons].sort(), [...e.discarded].sort(), "counters");
  });
}
