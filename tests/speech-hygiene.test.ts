import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { acceptAuthorAnswer } from "./helpers/author-fact";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const reply = (json: Record<string, unknown>) => ({ text: JSON.stringify(json), usage: { promptTokens: 1, completionTokens: 1 } });
const idOf = (user: string) => /Текущее сообщение автора: (\S+?)\./.exec(user)?.[1] ?? "";
const askWithFact = (fact: string | null) => async (args: { user: string }) =>
  reply({
    action: "ask_question",
    question: "Что было потом?",
    clarificationReason: "нужно уточнение",
    whyUnknown: "мало данных",
    thoughtUpdate: { fact: fact ? { text: fact, sourceType: "dialogue_message", sourceId: idOf(args.user) } : null, closeGapIds: [] },
  });

async function setup(t: Parameters<typeof withPostgresTestDb>[0], title: string) {
  const { prisma } = await withPostgresTestDb(t);
  process.env.VOCAL_TURN_POLICY = "0";
  t.after(async () => {
    delete process.env.VOCAL_TURN_POLICY;
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const made = await createThoughtFromText({ title, body: "Я ходил утром на рынок.", idempotencyKey: `sh-${title}` });
  return { prisma, reelId: made.reel.id };
}

test("E5: service markers are cut from the author's message before it is stored and before the fact", async (t) => {
  const { prisma, reelId } = await setup(t, "Метки");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { getThoughtState } = await import("../src/lib/thought-state");
  await sendDialogueMessage(reelId, { text: "Я встаю в шесть утра (факт 2), когда ещё темно (пункт 3).", idempotencyKey: "sh-marks-1" }, askWithFact("Я встаю в шесть утра (факт 2), когда ещё темно") as never);
  const stored = await prisma.dialogueMessage.findFirstOrThrow({ where: { role: "user", body: { contains: "шесть утра" } } });
  assert.equal(stored.body, "Я встаю в шесть утра, когда ещё темно.");
  const facts = (await getThoughtState(reelId)).facts;
  assert.equal(facts.length, 1);
  assert.doesNotMatch(facts[0].text, /факт|пункт/i);
});

test("E7: a fact carries no speech fillers", async (t) => {
  const { reelId } = await setup(t, "Паразиты в факте");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { getThoughtState } = await import("../src/lib/thought-state");
  await sendDialogueMessage(reelId, { text: "ну как бы я вышел на рынок и там было тихо", idempotencyKey: "sh-fill-1" }, askWithFact("ну как бы я вышел на рынок и там было тихо") as never);
  assert.equal((await getThoughtState(reelId)).facts[0].text, "Я вышел на рынок и там было тихо");
});

test("E4: a fact that repeats an earlier answer or an accepted fact instead of the current message is not stored", async (t) => {
  const { prisma, reelId } = await setup(t, "Дубль факта");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { getThoughtState } = await import("../src/lib/thought-state");
  const first = "Я встаю в шесть утра по вторникам и четвергам и иду на рынок, пока там тихо.";
  await sendDialogueMessage(reelId, { text: first, idempotencyKey: "sh-dup-1" }, askWithFact(first) as never);
  // 1. the model attaches the earlier text to a new, different message
  await sendDialogueMessage(reelId, { text: "Продавцы рассказывают, что привезли сегодня.", idempotencyKey: "sh-dup-2" }, askWithFact("Я встаю в шесть утра по вторникам и четвергам и иду на рынок") as never);
  // 2. a genuinely new fact from the current message is kept
  await sendDialogueMessage(reelId, { text: "Тётя Люба продаёт сметану развесную, в банке она жидкая.", idempotencyKey: "sh-dup-3" }, askWithFact("Тётя Люба продаёт сметану развесную, в банке она жидкая.") as never);
  const facts = (await getThoughtState(reelId)).facts;
  assert.equal(facts.length, 2, "the duplicate was dropped, the new fact kept");
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId } });
  const rows = await prisma.dialogueMessage.findMany({ where: { threadId: thread.id, role: "assistant", status: "done" }, orderBy: { createdAt: "asc" } });
  const marks = rows.map((r) => (JSON.parse(r.payloadJson) as { discardedUpdates?: string[] }).discardedUpdates ?? []);
  assert.deepEqual(marks.map((m) => m.includes("fact_duplicate")), [false, true, false]);
});

test("E2/E3/E7: the build input carries the author's cleaned answers; the stored script has no fillers; 'what changed' describes edits", async (t) => {
  const { prisma, reelId } = await setup(t, "Сборка с речью");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { generateV05Script } = await import("../src/lib/v05-script");
  await acceptAuthorAnswer(reelId);
  // a long answer the model did not turn into a fact
  await sendDialogueMessage(reelId, { text: "ну как бы я я вышел на улицу и там было очень тихо только дворник мёл листья и я подумал что так бы и жить без спешки", idempotencyKey: "sh-build-1" }, askWithFact(null) as never);
  let prompt = "";
  const built = await generateV05Script(reelId, { idempotencyKey: "sh-build" }, (async (args: { user: string }) => {
    prompt = args.user;
    return reply({
      script: "Ну как бы я вышел на улицу.\nТам было тихо ну как бы.",
      changes: ["Внедрила правило не работать после девяти", "Убрал слова-паразиты, потому что в речи они мешают", "Перешла на дневные смены"],
    });
  }) as never);
  assert.ok(prompt.includes("Я вышел на улицу и там было очень тихо"), "the author's answer reaches the build input, cleaned of 'ну как бы' and the repeated 'я'");
  assert.ok(!prompt.includes("ну как бы я я"), "the raw filler stream is not sent");
  assert.equal(built.viewing?.body, "Я вышел на улицу.\nТам было тихо.", "fillers cut from the stored script, line breaks kept");
  assert.deepEqual(built.viewingChanges, ["Убрал слова-паразиты, потому что в речи они мешают"], "only the item that describes an edit of the text stays");
  const versions = await prisma.scriptVersion.count({ where: { reelId, kind: { not: "from_take" } } });
  assert.equal(versions, 1);
});

test("E3: if the model describes only the author's life, the honest fallback is stored instead of a false 'what changed'", async (t) => {
  const { reelId } = await setup(t, "Плохие правки");
  const { generateV05Script } = await import("../src/lib/v05-script");
  await acceptAuthorAnswer(reelId);
  const built = await generateV05Script(reelId, { idempotencyKey: "sh-bad-changes" }, (async () => reply({ script: "Я хожу на рынок.", changes: ["Внедрила правило", "Перешла на новый график"] })) as never);
  assert.deepEqual(built.viewingChanges, ["Текст собран из ваших слов; список правок модель не дала."]);
});
