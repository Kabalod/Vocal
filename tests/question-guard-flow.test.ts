import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { assertPlainQuestion } from "./helpers/plain-question";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

type Turn = { role: "user" | "assistant"; kind?: string; text: string };
const answersOf = (id: string): string[] =>
  (JSON.parse(readFileSync(path.join(__dirname, "fixtures", "transcript-run3", `${id}.json`), "utf8")) as { turns: Turn[] }).turns.filter((t) => t.role === "user").map((t) => t.text);

const reply = (json: Record<string, unknown>) => ({ text: JSON.stringify(json), usage: { promptTokens: 1, completionTokens: 1 } });
const idOf = (user: string) => /Текущее сообщение автора: (\S+?)\./.exec(user)?.[1] ?? "";
const ask = (question: string, fact?: string) => async (args: { user: string }) =>
  reply({
    action: "ask_question",
    question,
    clarificationReason: "нужно уточнение",
    whyUnknown: "мало данных",
    thoughtUpdate: { fact: fact ? { text: fact, sourceType: "dialogue_message", sourceId: idOf(args.user) } : null, closeGapIds: [] },
  });
const suggest = (fact: string) => async (args: { user: string }) =>
  reply({
    action: "suggest_take",
    mainIdea: "Идея",
    takeTask: "Снять дубль",
    evidenceRefs: [`fact_${idOf(args.user)}`],
    thoughtUpdate: { fact: { text: fact, sourceType: "dialogue_message", sourceId: idOf(args.user) }, closeGapIds: [] },
  });

async function setup(t: Parameters<typeof withPostgresTestDb>[0], title: string, body: string) {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const made = await createThoughtFromText({ title, body, idempotencyKey: `qg-${title}` });
  let n = 0;
  const say = async (text: string, model: (args: { user: string }) => Promise<ReturnType<typeof reply>>) => {
    n += 1;
    const page = await sendDialogueMessage(made.reel.id, { text, idempotencyKey: `qg-${title}-${n}` }, model as never);
    return page.messages.filter((m) => m.role === "assistant" && m.status === "done").at(-1)?.body ?? "";
  };
  const marks = async () => {
    const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId: made.reel.id } });
    const rows = await prisma.dialogueMessage.findMany({ where: { threadId: thread.id, role: "assistant", status: "done" }, orderBy: { createdAt: "asc" } });
    return rows.map((row) => (JSON.parse(row.payloadJson) as { discardedUpdates?: string[] }).discardedUpdates ?? []);
  };
  return { reelId: made.reel.id, say, marks };
}

test("G1 (P4 sequence): a question on the topic the author already answered is replaced by another question", async (t) => {
  const answers = answersOf("P4");
  const s = await setup(t, "Рынок и сметана", "Я начал ходить на рынок в шесть утра и стал меньше выбрасывать продуктов.");
  const first = await s.say("уточни", ask("Как ранний поход на рынок помогает вам меньше выбрасывать продукты?"));
  assert.equal(first, "Как ранний поход на рынок помогает вам меньше выбрасывать продукты?");
  const second = await s.say(answers[1], ask("Как ранний поход на рынок и покупка сметаны развесом помогают вам сократить количество выбрасываемых продуктов?"));
  assert.doesNotMatch(second, /помогают вам сократить/, "the repeat is not shown");
  assertPlainQuestion(second, "replacement");
  assert.ok(second.split(/\s+/).length <= 15);
  assert.ok((await s.marks()).flat().includes("policy_topic_repeat"));
});

test("G2/G4: a forbidden word gets one regeneration, then a fixed question for the genre", async (t) => {
  const answers = answersOf("P6");
  const s = await setup(t, "Поезд", "Я решил проехать двое суток на поезде без телефона, потому что в вагоне не оказалось розетки.");
  const { applyThoughtState } = await import("../src/lib/thought-state");
  await applyThoughtState({ reelId: s.reelId, expectedRevision: 0, patch: { intent: "Показать, как поездка без телефона меняет внимание" } }); // goal named: no viewer-effect question in this test
  await s.say("уточни", ask("А что вы взяли в дорогу?"));
  let calls = 0;
  const regenerated = await s.say(answers[1], async (args) => {
    calls += 1;
    return calls === 1 ? ask("Какой вывод вы сделали из поездки?")(args) : ask("А что сказала бабушка про картошку?")(args);
  });
  assert.equal(calls, 2);
  assert.equal(regenerated, "А что сказала бабушка про картошку?");
  calls = 0;
  const fallback = await s.say(answers[2], async (args) => {
    calls += 1;
    return ask("Какой механизм делает поездку без телефона запоминающейся?")(args);
  });
  assert.equal(calls, 2, "one regeneration only");
  assertPlainQuestion(fallback, "fixed question");
  assert.ok(fallback.split(/\s+/).length <= 15);
  const marks = (await s.marks()).flat();
  assert.ok(marks.includes("policy_lexicon_regenerated") && marks.includes("policy_lexicon_fallback"));
});

test("G6 (P3/P5 pattern): the build is offered once; again only after two new accepted facts; a shown take proposal counts as an offer", async (t) => {
  const a = answersOf("P3");
  const s = await setup(t, "Цена", "Я долго думала, что отказ от дешёвого заказа это потеря, а оказалось наоборот.");
  const { applyThoughtState } = await import("../src/lib/thought-state");
  await applyThoughtState({ reelId: s.reelId, expectedRevision: 0, patch: { intent: "Показать, что назвать цену сразу выгоднее" } }); // goal named: no viewer-effect question in this test
  const fact = (text: string) => text.split(/\s+/).slice(0, 14).join(" ");
  await s.say(a[1], ask("Что было потом?", fact(a[1])));
  await s.say(a[2], ask("А что сказал клиент?", fact(a[2])));
  const offer = await s.say(a[3], suggest(fact(a[3])));
  assert.match(offer, /^Пока у нас так:\n— /, "first offer");
  assert.ok(offer.split(/\s+/).length <= 45);
  const suppressed = await s.say(a[4], suggest(fact(a[4])));
  assert.doesNotMatch(suppressed, /Пока у нас так|Для следующего дубля/, "one new fact since the offer: no second offer, no take proposal");
  assertPlainQuestion(suppressed, "instead of the second offer");
  const again = await s.say(a[5], suggest(fact(a[5])));
  assert.match(again, /^Пока у нас так:/, "two new accepted facts: the offer comes again");
  const marks = (await s.marks()).flat();
  assert.equal(marks.filter((m) => m === "policy_understanding_offer").length, 2);
  assert.ok(marks.includes("policy_offer_suppressed"));
});

test("H7: 'уточни' is a command, not speech: the prompt says so and a question about the word itself is regenerated", async (t) => {
  const s = await setup(t, "Тетради по ночам", "Я перестала проверять тетради по ночам и впервые за пять лет выспалась.");
  const prompts: string[] = [];
  let calls = 0;
  const shown = await s.say("уточни", async (args) => {
    calls += 1;
    prompts.push(args.user);
    return calls === 1 ? ask("Что ты имел в виду, сказав «уточни»?")(args) : ask("Что изменилось в ваших вечерах без тетрадей?")(args);
  });
  assert.equal(calls, 2);
  assert.equal(shown, "Что изменилось в ваших вечерах без тетрадей?");
  assert.ok(prompts[0].includes("автор просит задать первый уточняющий вопрос по материалу дубля"), "the command is described, not shown as an answer");
  assert.ok(prompts[0].includes("это команда"), "marked as a command in the prompt");
});

test("H3 flow (P4 pattern): after 'не помню' a relative of the closed question is not asked", async (t) => {
  const s = await setup(t, "Рынок и сметана", "Я начал ходить на рынок в шесть утра, там соседка Марина каждый раз говорит про воздух.");
  await s.say("уточни", ask("Что именно сказала соседка Марина про воздух в эти ранние часы?"));
  const next = await s.say("не помню", ask("Какой комментарий Марина обычно делала о воздухе в эти ранние часы?"));
  assert.doesNotMatch(next, /Марина|комментар/, "the relative of the closed question is replaced");
  assertPlainQuestion(next, "replacement");
  assert.ok((await s.marks()).flat().includes("policy_topic_repeat"));
});
