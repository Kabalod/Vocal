import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { assertPlainQuestion } from "./helpers/plain-question";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

process.env.VOCAL_QUESTION_GUARD = "0"; // 09.10 (H4): this suite predates the question guard (anchor, lexicon, repeats); it is tested in question-guard*.test.ts

test("R3: the guard sees service ids in author text and builds a neutral question", async () => {
  const { textLeaksServiceId, actionLeaksServiceId, neutralQuestionReply, GENERIC_NEUTRAL_QUESTION } = await import(
    "../src/lib/author-text-guard"
  );
  assert.equal(textLeaksServiceId("Что для вас главное?"), false);
  assert.equal(textLeaksServiceId("Вернёмся к cmgx4k2p90001abcdefghijkl?"), true);
  assert.equal(textLeaksServiceId("Как в fact_cmgx4k2p90001abcd?"), true);
  assert.equal(textLeaksServiceId("Закроем gap_no_episode?"), true);
  assert.equal(textLeaksServiceId("Про craft_example_a?"), true);
  assert.equal(textLeaksServiceId("Это про reel-identifier-77?", ["reel-identifier-77"]), true);
  assert.equal(textLeaksServiceId("Слово чай.", ["ab"]), false, "very short ids are not searched");

  const ok = { action: "ask_question", question: "Почему так?", gapId: "gap_no_episode", whyUnknown: "нет ответа" } as const;
  assert.equal(actionLeaksServiceId(ok as never), false, "gapId is a service field by design");
  const sufficient = { action: "content_sufficient", checkedInTranscript: "cmgx4k2p90001abcdefghijkl", whyNoGaps: "замысел донесён" };
  assert.equal(actionLeaksServiceId(sufficient as never), false, "checkedInTranscript is a reference by design");
  assert.equal(actionLeaksServiceId({ ...sufficient, whyNoGaps: "см. cmgx4k2p90001abcdefghijkl" } as never), true);
  assert.equal(actionLeaksServiceId({ ...ok, whyUnknown: "см. fact_abc123456" } as never), true);

  const typed = neutralQuestionReply([
    { id: "gap_no_mechanism", text: "x", status: "open", kind: "no_mechanism" },
    { id: "old", text: "y", status: "resolved" },
  ]);
  assertPlainQuestion(String(typed.question), "typed no_mechanism");
  assert.match(String(typed.question), /происходит/);
  assert.equal(typed.gapId, "gap_no_mechanism");
  const none = neutralQuestionReply([]);
  assert.equal(none.question, GENERIC_NEUTRAL_QUESTION);
  assert.ok(none.clarificationReason);
});

test("R3: an answer with a cuid in the question never reaches the author; the thought state is unchanged", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { applyThoughtState, getThoughtState } = await import("../src/lib/thought-state");
  const { askQuestionJson } = await import("./helpers/agent-action-json");

  const made = await createThoughtFromText({ title: "Утечка id", body: "Я вчера не дописал отчёт.", idempotencyKey: "r3g-create" });
  const reelId = made.reel.id;
  await applyThoughtState({
    reelId,
    expectedRevision: 0,
    patch: { openGaps: [{ id: "gap_no_episode", text: "Нет случая.", status: "open", kind: "no_episode" }] },
  });
  const before = await getThoughtState(reelId);
  const leak = `Что вы думаете про ${reelId}?`;
  const questions = async (page: { messages: { kind: string; body: string }[] }) =>
    page.messages.filter((row) => row.kind === "question").map((row) => row.body);

  // 1. The first answer leaks, the single regeneration is clean: the author sees the regenerated question.
  let calls = 0;
  const recovers = async () => {
    calls += 1;
    return {
      text: askQuestionJson(calls === 1 ? leak : "О каком случае вы говорите?"),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  };
  const first = await sendDialogueMessage(reelId, { text: "уточни", idempotencyKey: "r3g-1" }, recovers as never);
  assert.equal(calls, 2, "exactly one regeneration");
  assert.deepEqual(await questions(first), ["О каком случае вы говорите?"]);

  // 2. Both answers leak: a neutral question about the open gap, and the leaking update is dropped.
  let calls2 = 0;
  const alwaysLeaks = async () => {
    calls2 += 1;
    const userRow = await prisma.dialogueMessage.findFirstOrThrow({ where: { role: "user" }, orderBy: { createdAt: "desc" } });
    return {
      text: JSON.stringify({
        ...JSON.parse(askQuestionJson(leak)),
        thoughtUpdate: {
          fact: { text: "Выдуманный факт из ответа с утечкой", sourceType: "dialogue_message", sourceId: userRow.id },
          closeGapIds: ["gap_no_episode"],
        },
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  };
  const second = await sendDialogueMessage(reelId, { text: "уточни ещё", idempotencyKey: "r3g-2" }, alwaysLeaks as never);
  assert.equal(calls2, 2, "one regeneration, then the neutral question without a third call");
  const shown = await questions(second);
  assertPlainQuestion(shown.at(-1), "neutral after a leak");
  assert.match(shown.at(-1) ?? "", /какой случай/);
  assert.equal(shown.some((body) => body.includes(reelId)), false);

  const after = await getThoughtState(reelId);
  assert.deepEqual(after.facts, before.facts, "no fact was added");
  assert.deepEqual(after.openGaps, before.openGaps, "the gap stays open");
  assert.equal(after.position, before.position);

  // 3. Replaying the same key returns the stored neutral question without a model call.
  const replay = await sendDialogueMessage(reelId, { text: "уточни ещё", idempotencyKey: "r3g-2" }, (async () => {
    throw new Error("replay must not call the model");
  }) as never);
  assert.equal((await questions(replay)).at(-1), shown.at(-1), "the stored neutral question is returned");
});
