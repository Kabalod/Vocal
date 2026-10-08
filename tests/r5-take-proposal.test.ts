import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const PHRASE = "Для следующего дубля у вас уже есть опора. Запишите его или соберите сценарий.";

test("08.10: suggest_take shows the fixed sentence, keeps takeTask in the state, and a repeated proposal becomes a question", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { applyThoughtState, getThoughtState, candidateFactId } = await import("../src/lib/thought-state");

  const made = await createThoughtFromText({ title: "Отчёт", body: "Я не дописал отчёт.", idempotencyKey: "r5-prop" });
  const reelId = made.reel.id;
  await applyThoughtState({ reelId, expectedRevision: 0, patch: { openGaps: [{ id: "gap_no_mechanism", text: "Нет причины.", status: "open", kind: "no_mechanism" }] } });

  const proposal = (text: string) => async (args: { user: string }) => {
    const id = /Текущее сообщение автора: (\S+?)\./.exec(args.user)?.[1] ?? "";
    return {
      text: JSON.stringify({
        action: "suggest_take",
        mainIdea: "Дверь защищает время",
        takeTask: "Закрывать дверь на два часа утром",
        evidenceRefs: [candidateFactId(id)],
        thoughtUpdate: { fact: { text, sourceType: "dialogue_message", sourceId: id }, closeGapIds: [] },
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  };
  const first = await sendDialogueMessage(reelId, { text: "Теперь я закрываю дверь на два часа утром.", idempotencyKey: "r5-prop-1" }, proposal("Теперь я закрываю дверь на два часа утром.") as never);
  const firstReply = first.messages.filter((m) => m.role === "assistant").at(-1);
  assert.equal(firstReply?.body, PHRASE, "the author sees the fixed sentence");
  assert.ok(!first.messages.some((m) => m.body.includes("Закрывать дверь")), "takeTask is not shown");
  assert.equal((await getThoughtState(reelId)).takeTask, "Закрывать дверь на два часа утром", "takeTask stays in the state for the script");

  const second = await sendDialogueMessage(reelId, { text: "Это помогает дописывать до обеда.", idempotencyKey: "r5-prop-2" }, proposal("Это помогает дописывать до обеда.") as never);
  const secondReply = second.messages.filter((m) => m.role === "assistant").at(-1);
  assert.equal(secondReply?.kind, "question", "a repeated proposal is replaced by a question");
  assert.equal(secondReply?.body, "Почему, по-вашему, так получается?", "about the open gap");
  const state = await getThoughtState(reelId);
  assert.equal(state.facts.length, 2, "the author's second fact is kept");
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId } });
  const rows = await prisma.dialogueMessage.findMany({ where: { threadId: thread.id, role: "assistant", status: "done" }, orderBy: { createdAt: "asc" } });
  assert.deepEqual((JSON.parse(rows[1].payloadJson) as { discardedUpdates?: string[] }).discardedUpdates, ["proposal_repeat_replaced"]);

  const third = await sendDialogueMessage(reelId, { text: "И мне стало спокойнее.", idempotencyKey: "r5-prop-3" }, proposal("И мне стало спокойнее.") as never);
  assert.equal(third.messages.filter((m) => m.role === "assistant").at(-1)?.body, PHRASE, "after a question a proposal is allowed again");
});

test("08.10: a fact accepted from the author's answer is in the thought state and in the next turn's prompt", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { getThoughtState } = await import("../src/lib/thought-state");
  const made = await createThoughtFromText({ title: "Кофе", body: "Я перестал пить кофе по утрам.", idempotencyKey: "r5-fact" });
  const reelId = made.reel.id;
  const fact = "К четвергу я заметил, что просыпаюсь без будильника.";
  await sendDialogueMessage(reelId, { text: fact, idempotencyKey: "r5-fact-1" }, (async (args: { user: string }) => {
    const id = /Текущее сообщение автора: (\S+?)\./.exec(args.user)?.[1] ?? "";
    return {
      text: JSON.stringify({ action: "ask_question", question: "Что изменилось в днях после этого?", clarificationReason: "нужно уточнение", whyUnknown: "мало деталей", thoughtUpdate: { fact: { text: fact, sourceType: "dialogue_message", sourceId: id }, closeGapIds: [] } }),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  }) as never);
  assert.ok((await getThoughtState(reelId)).facts.some((f) => f.text === fact), "the fact is in the thought state");
  let nextPrompt = "";
  await sendDialogueMessage(reelId, { text: "Дальше стало легче.", idempotencyKey: "r5-fact-2" }, (async (args: { user: string }) => {
    nextPrompt = args.user;
    return { text: JSON.stringify({ action: "ask_question", question: "Что стало легче?", clarificationReason: "нужно уточнение", whyUnknown: "мало деталей", thoughtUpdate: { fact: null, closeGapIds: [] } }), usage: { promptTokens: 1, completionTokens: 1 } };
  }) as never);
  assert.ok(nextPrompt.includes(fact), "the accepted fact is sent to the model on the next turn");
});
