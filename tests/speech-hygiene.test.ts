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
  await sendDialogueMessage(reelId, { text: "Я встаю в шесть утра (факт 2), когда ещё темно, и в пункте 3 всё ясно.", idempotencyKey: "sh-marks-1" }, askWithFact("Я встаю в шесть утра (факт 2), когда ещё темно") as never);
  const stored = await prisma.dialogueMessage.findFirstOrThrow({ where: { role: "user", body: { contains: "шесть утра" } } });
  assert.equal(stored.body, "Я встаю в шесть утра, когда ещё темно, и в пункте 3 всё ясно.", "only the exact (факт N) is cut (H9)");
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
  assert.deepEqual(built.viewingChanges, ["Правок в тексте нет, он собран из ваших слов."]);
});

test("I2: a fact goes into the build with a short verbatim quote; a replaced fact gets no quote; the switch turns it off", async (t) => {
  const { reelId } = await setup(t, "Цитаты");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { collectV05SourceTexts } = await import("../src/lib/v05-script");
  const { applyThoughtState, getThoughtState } = await import("../src/lib/thought-state");
  const answer = "ну как бы я я встаю в шесть утра по вторникам и четвергам и иду на рынок пока там тихо потом беру сметану развесную потому что в банке она жидкая";
  await sendDialogueMessage(reelId, { text: answer, idempotencyKey: "sh-quote-1" }, askWithFact("Я встаю в шесть утра и иду на рынок, где тихо.") as never);
  const withQuote = await collectV05SourceTexts(reelId);
  const factText = withQuote.texts.find((item) => item.label === "Факт мысли")?.text ?? "";
  assert.match(factText, /^Я встаю в шесть утра и иду на рынок, где тихо\.\nСлова автора: «/);
  assert.ok(!/ну как бы|я я/.test(factText), "the quote is cleaned of fillers and repeats");
  const quoted = factText.split("Слова автора: «")[1].replace(/»$/, "");
  assert.ok(quoted.split(/\s+/).length <= 31, "short");
  for (const word of quoted.toLowerCase().replace(/[.…]/g, "").split(/\s+/)) assert.ok(answer.includes(word), `in the author's own words: ${word}`);
  process.env.VOCAL_FACT_QUOTES = "0";
  try {
    const off = await collectV05SourceTexts(reelId);
    assert.equal(off.texts.find((item) => item.label === "Факт мысли")?.text, "Я встаю в шесть утра и иду на рынок, где тихо.");
  } finally {
    delete process.env.VOCAL_FACT_QUOTES;
  }
  // the author replaces the fact: the quote of the retracted wording does not come back
  const state = await getThoughtState(reelId);
  await applyThoughtState({
    reelId,
    expectedRevision: state.revision,
    patch: { facts: [{ ...state.facts[0], text: "Теперь я хожу на рынок после обеда, чтобы не вставать рано." }] },
  });
  const replaced = await collectV05SourceTexts(reelId);
  assert.equal(replaced.texts.find((item) => item.label === "Факт мысли")?.text, "Теперь я хожу на рынок после обеда, чтобы не вставать рано.", "no quote of the old wording");
});

test("I2 live finding: an answer that opens with 'не помню' is not build material", async (t) => {
  const { reelId } = await setup(t, "Не помню");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { collectV05SourceTexts } = await import("../src/lib/v05-script");
  const { startsWithDontKnow } = await import("../src/lib/author-speech");
  assert.equal(startsWithDontKnow("Честно говоря, я не помню, кому именно рассказываю эту историю, в моих записях нет зрителей"), true);
  assert.equal(startsWithDontKnow("Я помню, что тётя Люба сказала брать сметану развесную"), false);
  await sendDialogueMessage(reelId, { text: "Честно говоря, я не помню, кому именно рассказываю эту историю и в моих записях нет ни зрителей ни людей", idempotencyKey: "sh-dk-1" }, askWithFact(null) as never);
  await sendDialogueMessage(reelId, { text: "Я хожу на рынок в шесть утра по вторникам и четвергам, там тихо и продавцы рассказывают, что привезли", idempotencyKey: "sh-dk-2" }, askWithFact(null) as never);
  const sources = await collectV05SourceTexts(reelId);
  const answers = sources.texts.filter((item) => item.label === "Ответ автора").map((item) => item.text);
  assert.equal(answers.length, 1);
  assert.match(answers[0], /рынок/);
});

test("I2b: at most two quotes per script; the script has no Latin look-alikes and no repeated sentence, without a new model call", async (t) => {
  const { reelId } = await setup(t, "Две цитаты");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { collectV05SourceTexts, generateV05Script, MAX_FACT_QUOTES } = await import("../src/lib/v05-script");
  assert.equal(MAX_FACT_QUOTES, 2);
  const answers = [
    "Я встаю в шесть утра по вторникам и четвергам и иду на рынок пока там тихо и почти нет людей",
    "Тётя Люба на углу продаёт сметану и советует брать развесную потому что в банке она слишком жидкая",
    "Первые две недели я переплатил за красивую форель потому что она лежала на самом видном месте",
    "Теперь я сначала смотрю что есть на прилавках и только потом решаю что готовить на ужин",
  ];
  for (const [i, text] of answers.entries()) await sendDialogueMessage(reelId, { text, idempotencyKey: `sh-q2-${i}` }, askWithFact(text) as never);
  const sources = await collectV05SourceTexts(reelId);
  const quoted = sources.texts.filter((item) => item.label === "Факт мысли" && item.text.includes("Слова автора:"));
  assert.equal(quoted.length, 2, "four facts, two quotes");
  let calls = 0;
  const built = await generateV05Script(reelId, { idempotencyKey: "sh-q2-build" }, (async () => {
    calls += 1;
    return reply({
      script: "Тётя Любa советует брать сметану развесную, потому что в банке она жидкая. Я хожу на рынок в шесть утра. Тётя Люба всегда советует брать развесную сметану, в банке она слишком жидкая.",
      changes: ["Убрал лишнее."],
    });
  }) as never);
  assert.equal(calls, 1, "the repeat is removed on the server, no second call");
  assert.equal(built.viewing?.body, "Тётя Люба советует брать сметану развесную, потому что в банке она жидкая. Я хожу на рынок в шесть утра.");
});

test("I2b: an answer 'не помню имя, но это было в мае' keeps its useful remainder in the build input", async (t) => {
  const { reelId } = await setup(t, "Остаток");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { collectV05SourceTexts } = await import("../src/lib/v05-script");
  await sendDialogueMessage(reelId, { text: "Не помню имя, но это было в мае на рынке у входа, там продавали первую клубнику", idempotencyKey: "sh-rest-1" }, askWithFact(null) as never);
  const answers = (await collectV05SourceTexts(reelId)).texts.filter((item) => item.label === "Ответ автора").map((item) => item.text);
  assert.equal(answers.length, 1);
  assert.match(answers[0], /^Это было в мае на рынке/);
});

test("K1: a fact from 'я не помню, о чём именно речь…' is not stored; a normal fact after it is", async (t) => {
  const { reelId } = await setup(t, "Не помню");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { getThoughtState } = await import("../src/lib/thought-state");
  const unknown = "Честно говоря, я не помню, о чём именно речь в этом ролике.";
  await sendDialogueMessage(reelId, { text: unknown, idempotencyKey: "k1-1" }, askWithFact(unknown) as never);
  assert.equal((await getThoughtState(reelId)).facts.length, 0, "an answer of not knowing gives no fact");
  const known = "Тётя Люба продаёт сметану развесную, в банке она слишком жидкая.";
  await sendDialogueMessage(reelId, { text: known, idempotencyKey: "k1-2" }, askWithFact(known) as never);
  assert.deepEqual((await getThoughtState(reelId)).facts.map((f) => f.text), [known]);
});

test("K1: 'не помню имя, но это было в мае…' keeps only its useful remainder as the fact; 'нет ни …' gives none", async (t) => {
  const { prisma, reelId } = await setup(t, "Остаток факта");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { getThoughtState } = await import("../src/lib/thought-state");
  const mixed = "Не помню имя, но это было в мае на рынке у входа, там продавали первую клубнику";
  await sendDialogueMessage(reelId, { text: mixed, idempotencyKey: "k1-3" }, askWithFact(mixed) as never);
  assert.deepEqual((await getThoughtState(reelId)).facts.map((f) => f.text), ["Это было в мае на рынке у входа, там продавали первую клубнику"]);
  const none = "Нет ни записей, ни фото, ничего подходящего у меня не осталось";
  await sendDialogueMessage(reelId, { text: none, idempotencyKey: "k1-4" }, askWithFact(none) as never);
  assert.equal((await getThoughtState(reelId)).facts.length, 1, "no second fact");
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId } });
  const rows = await prisma.dialogueMessage.findMany({ where: { threadId: thread.id, role: "assistant", status: "done" }, orderBy: { createdAt: "asc" } });
  const marks = rows.map((r) => (JSON.parse(r.payloadJson) as { discardedUpdates?: string[] }).discardedUpdates ?? []);
  assert.deepEqual(marks.map((m) => m.includes("fact_dontknow")), [true, true]);
});
