import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

async function discardedReasons(prisma: import("@prisma/client").PrismaClient, reelId: string) {
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId } });
  const rows = await prisma.dialogueMessage.findMany({ where: { threadId: thread.id, role: "assistant", status: "done" } });
  return rows.flatMap((row) => (JSON.parse(row.payloadJson) as { discardedUpdates?: string[] }).discardedUpdates ?? []);
}

test("R5: an invalid redirect_to_task does not fail the turn; the author is returned to the first open gap without a model call", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { applyThoughtState, getThoughtState } = await import("../src/lib/thought-state");

  const made = await createThoughtFromText({ title: "Оффтоп", body: "Я чуть не отказался от первого клиента.", idempotencyKey: "r5-off" });
  const reelId = made.reel.id;
  await applyThoughtState({
    reelId,
    expectedRevision: 0,
    patch: { openGaps: [{ id: "gap_no_thesis", text: "Нет вывода.", status: "open", kind: "no_thesis" }] },
  });
  const before = await getThoughtState(reelId);

  // The three shapes seen live: no currentTask at all, an extra key instead of currentTask, an update next to it.
  const shapes: Record<string, unknown>[] = [
    { action: "redirect_to_task" },
    { action: "redirect_to_task", reason: "Вы отклонились от темы." },
    { action: "redirect_to_task", currentTask: "вернуться", extra: true, thoughtUpdate: { fact: null, closeGapIds: [] } },
  ];
  for (const [index, shape] of shapes.entries()) {
    let calls = 0;
    const page = await sendDialogueMessage(reelId, { text: "А какая сегодня погода?", idempotencyKey: `r5-off-${index}` }, (async () => {
      calls += 1;
      return { text: JSON.stringify(shape), usage: { promptTokens: 1, completionTokens: 1 } };
    }) as never);
    assert.equal(calls, 1, "no regeneration: the model already said the message is off topic");
    assert.equal(page.messages.at(-1)?.kind, "question");
    if (index === 0) {
      assert.equal(
        page.messages.at(-1)?.body,
        "Это в сторону от нашей мысли, давайте вернёмся к ней. Какую одну мысль вы хотите, чтобы зритель унёс?",
        "the fixed phrase, then a neutral question about the first open gap",
      );
    } else {
      assert.notEqual(page.messages.at(-1)?.body, page.messages.at(-2 - (page.messages.at(-2)?.role === "user" ? 0 : 1))?.body ?? "", "a second return does not repeat the first question");
    }
  }
  const questions = (await prisma.dialogueMessage.findMany({ where: { role: "assistant", kind: "question", status: "done" }, orderBy: { createdAt: "asc" } })).map((m) => m.body);
  assert.equal(questions.length, 3);
  assert.equal(questions[0], "Это в сторону от нашей мысли, давайте вернёмся к ней. Какую одну мысль вы хотите, чтобы зритель унёс?");
  assert.ok(questions.every((q) => q.startsWith("Это в сторону от нашей мысли, давайте вернёмся к ней.")), "every return starts with the fixed phrase");
  assert.notEqual(questions[1], questions[0], "the second return is varied");
  assert.notEqual(questions[2], questions[1], "and the third differs from the second");
  const after = await getThoughtState(reelId);
  assert.deepEqual(after.facts, before.facts);
  assert.deepEqual(after.openGaps, before.openGaps);
  const reasons = await discardedReasons(prisma, reelId);
  assert.equal(reasons.filter((reason) => reason === "redirect_invalid").length, 3, "each invalid redirect is counted");
  assert.ok(reasons.every((reason) => reason === "redirect_invalid" || reason === "question_repeat_replaced"), "the only other reason is the variety replacement");

  const replay = await sendDialogueMessage(reelId, { text: "А какая сегодня погода?", idempotencyKey: "r5-off-0" }, (async () => {
    throw new Error("replay must not call the model");
  }) as never);
  assert.equal(replay.messages.filter((m) => m.kind === "question").length, 3);
  assert.ok(replay.messages.some((m) => m.body === questions[0]), "the stored first reply is returned");
});

test("R5: a valid redirect_to_task is untouched, and an invalid question that is not a redirect still regenerates once", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const made = await createThoughtFromText({ title: "Оффтоп 2", body: "Мысль про кофе.", idempotencyKey: "r5-off2" });
  const ok = await sendDialogueMessage(made.reel.id, { text: "Кто выиграл матч?", idempotencyKey: "r5-off2-a" }, (async () => ({
    text: JSON.stringify({ action: "redirect_to_task", currentTask: "вернуться к мысли про кофе" }),
    usage: { promptTokens: 1, completionTokens: 1 },
  })) as never);
  assert.ok(ok.messages.some((m) => m.body === "вернуться к мысли про кофе"));
  assert.deepEqual(await discardedReasons(prisma, made.reel.id), []);

  let calls = 0;
  await sendDialogueMessage(made.reel.id, { text: "уточни", idempotencyKey: "r5-off2-b" }, (async () => {
    calls += 1;
    return {
      text: calls === 1 ? JSON.stringify({ action: "ask_question", question: "" }) : JSON.stringify({ action: "ask_question", question: "Что главное?", clarificationReason: "нужно уточнение", whyUnknown: "мало данных" }),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  }) as never);
  assert.equal(calls, 2);
});
