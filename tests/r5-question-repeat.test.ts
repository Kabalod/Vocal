import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { assertPlainQuestion } from "./helpers/plain-question";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

test("R5: near-duplicate detection catches a verbatim and a lightly reworded repeat, not a different question", async () => {
  const { questionsAreNearDuplicates } = await import("../src/lib/author-text-guard");
  const q = "Почему, по вашему мнению, постановка целей помогает вам двигаться вперёд и не топтаться на месте?";
  assert.equal(questionsAreNearDuplicates(q, q), true);
  assert.equal(
    questionsAreNearDuplicates(
      "Можете объяснить, какой механизм делает глутамат натрия не вызывающим зависимость?",
      "Можете объяснить, какой именно механизм делает глутамат натрия не вызывающим зависимость?",
    ),
    true,
  );
  assert.equal(questionsAreNearDuplicates(q, "Расскажите подробнее о случае, который показывает, как это работает."), false);
  assert.equal(questionsAreNearDuplicates("Кому вы это говорите в кадре?", "Какой один случай вы бы рассказали?"), false);
});

test("R5: a repeated question is regenerated once; a second repeat becomes a neutral question about another gap", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { applyThoughtState, getThoughtState } = await import("../src/lib/thought-state");
  const { askQuestionJson } = await import("./helpers/agent-action-json");

  const made = await createThoughtFromText({ title: "Повтор", body: "Мысль про цели.", idempotencyKey: "r5-rep" });
  const reelId = made.reel.id;
  await applyThoughtState({
    reelId,
    expectedRevision: 0,
    patch: {
      openGaps: [
        { id: "gap_no_mechanism", text: "Нет причины.", status: "open", kind: "no_mechanism" },
        { id: "gap_no_thesis", text: "Нет вывода.", status: "open", kind: "no_thesis" },
      ],
    },
  });
  const before = await getThoughtState(reelId);
  const FIRST = "Почему, по вашему мнению, цели помогают двигаться вперёд?";
  const SHOWN_FIRST = "Почему цели помогают двигаться вперёд?"; // stripStyleFillers(FIRST): what the author sees
  const ask = (text: string, key: string, replies: string[], gapId?: string) => {
    let call = 0;
    const calls = { n: 0 };
    return {
      calls,
      run: () =>
        sendDialogueMessage(reelId, { text, idempotencyKey: key }, (async () => {
          calls.n += 1;
          const reply = replies[Math.min(call, replies.length - 1)];
          call += 1;
          const base = JSON.parse(askQuestionJson(reply)) as Record<string, unknown>;
          return { text: JSON.stringify(gapId ? { ...base, gapId } : base), usage: { promptTokens: 1, completionTokens: 1 } };
        }) as never),
    };
  };
  const bodies = async () =>
    (await prisma.dialogueMessage.findMany({ where: { role: "assistant", kind: "question", status: "done" }, orderBy: { createdAt: "asc" } })).map((m) => m.body);
  const reasons = async () =>
    (await prisma.dialogueMessage.findMany({ where: { role: "assistant", status: "done" } })).flatMap(
      (m) => (JSON.parse(m.payloadJson) as { discardedUpdates?: string[] }).discardedUpdates ?? [],
    );

  // 1. the first question is never a repeat.
  const first = ask("уточни", "r5-rep-1", [FIRST], "gap_no_mechanism");
  await first.run();
  assert.deepEqual(await bodies(), [SHOWN_FIRST], "the filler is cut from the shown text (09.10)");
  assert.equal(first.calls.n, 1);

  // 2. a verbatim repeat is regenerated once, and the new question is shown.
  const second = ask("не знаю", "r5-rep-2", [FIRST, "Какой один случай показывает, как цели помогают вам?"], "gap_no_mechanism");
  await second.run();
  assert.equal(second.calls.n, 2);
  assert.equal((await bodies()).at(-1), "Какой один случай показывает, как цели помогают вам?");

  // 3. a second repeat is replaced by a neutral question about another gap, without a third model call.
  const third = ask("да", "r5-rep-3", [FIRST, FIRST], "gap_no_mechanism");
  await third.run();
  assert.equal(third.calls.n, 2, "one regeneration only");
  const last = (await bodies()).at(-1);
  assert.notEqual(last, SHOWN_FIRST);
  assertPlainQuestion(last, "other gap");
  assert.match(last ?? "", /^Что зритель должен унести из ролика/, "the question of the other open gap");

  // 4. the state is untouched and the repeats are counted.
  const after = await getThoughtState(reelId);
  assert.deepEqual(after.facts, before.facts);
  assert.deepEqual(after.openGaps, before.openGaps);
  assert.deepEqual((await reasons()).sort(), ["question_repeat_regenerated", "question_repeat_replaced"]);

  // 5. a question that only matches the third-last one is allowed.
  const fourth = ask("хорошо", "r5-rep-4", [FIRST], "gap_no_mechanism");
  await fourth.run();
  assert.equal(fourth.calls.n, 1);
  assert.equal((await bodies()).at(-1), SHOWN_FIRST);

  // 6. replay returns the stored reply without a model call.
  const replay = await sendDialogueMessage(reelId, { text: "да", idempotencyKey: "r5-rep-3" }, (async () => {
    throw new Error("replay must not call the model");
  }) as never);
  assert.ok(replay.messages.some((m) => m.body === last), "the stored reply is returned");
});
