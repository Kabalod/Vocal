import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { assertPlainQuestion } from "./helpers/plain-question";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const LONG = "Это было в прошлом году, я тогда впервые решил не отвечать сразу и подождал целый день, а потом ответил спокойно и по делу.";
type Json = Record<string, unknown>;
const idOf = (user: string) => /Текущее сообщение автора: (\S+?)\./.exec(user)?.[1] ?? "";
const reply = (json: Json) => ({ text: JSON.stringify(json), usage: { promptTokens: 1, completionTokens: 1 } });
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

async function setup(t: Parameters<typeof withPostgresTestDb>[0], title = "Тема дубля") {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const made = await createThoughtFromText({ title, body: "Я перестал отвечать на письма сразу.", idempotencyKey: `tp-${title}` });
  let n = 0;
  const say = async (text: string, model: (args: { user: string }) => Promise<ReturnType<typeof reply>>) => {
    n += 1;
    const page = await sendDialogueMessage(made.reel.id, { text, idempotencyKey: `tp-${title}-${n}` }, model as never);
    const last = page.messages.filter((m) => m.role === "assistant" && m.status === "done").at(-1);
    return { body: last?.body ?? "", kind: last?.kind ?? "" };
  };
  const marks = async () => {
    const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId: made.reel.id } });
    const rows = await prisma.dialogueMessage.findMany({ where: { threadId: thread.id, role: "assistant", status: "done" }, orderBy: { createdAt: "asc" } });
    return rows.map((row) => (JSON.parse(row.payloadJson) as { discardedUpdates?: string[] }).discardedUpdates ?? []);
  };
  return { prisma, reelId: made.reel.id, say, marks };
}

test("A1/A2: a thin dialogue does not build a script and does not call the model; the notice comes at the second useless answer, once", async (t) => {
  const { prisma, reelId, say } = await setup(t, "Тонкий");
  const { NO_FACT_NOTICE, THIN_BLOCK_REASON, THIN_NEXT_QUESTION } = await import("../src/lib/turn-policy");
  const { evaluateScriptReadiness, generateV05Script, ScriptReadinessError } = await import("../src/lib/v05-script");
  const before = await evaluateScriptReadiness(reelId);
  assert.equal(before.ready, false);
  assert.equal(before.blockReason, THIN_BLOCK_REASON, "state Н without dialogue: why the button is blocked");
  assert.equal(before.nextQuestion?.text, THIN_NEXT_QUESTION);
  assertPlainQuestion(THIN_NEXT_QUESTION, "button question");

  const first = await say("Да, так и есть.", ask("Что вы имеете в виду?"));
  assert.equal(first.body, "Что вы имеете в виду?", "one useless answer: no notice yet");
  const second = await say("Ну, примерно так.", ask("А что было дальше?"));
  assert.equal(second.body, NO_FACT_NOTICE, "second useless answer: the notice");
  assert.equal((NO_FACT_NOTICE.match(/\?/g) ?? []).length, 1);
  const third = await say("Не знаю, как сказать.", ask("Что вы чувствовали?"));
  assert.equal(third.body, "Что вы чувствовали?", "not repeated until a new fact");
  assert.equal((await evaluateScriptReadiness(reelId)).blockReason, NO_FACT_NOTICE, "the button shows the same text");

  let called = 0;
  await assert.rejects(
    generateV05Script(reelId, { idempotencyKey: "tp-thin-build" }, (async () => {
      called += 1;
      return reply({ script: "x", changes: ["y"] });
    }) as never),
    (error: unknown) => error instanceof ScriptReadinessError,
  );
  assert.equal(called, 0, "no model call");
  assert.equal(await prisma.scriptVersion.count({ where: { reelId, kind: { not: "from_take" } } }), 0, "no ScriptVersion (the saved base, kind from_take, stays)");

  await say(LONG, ask("Что было потом?", LONG));
  assert.equal((await evaluateScriptReadiness(reelId)).ready, true, "one accepted fact opens the button");
  const a = await say("Ну да.", ask("И что тогда?"));
  const b = await say("Просто так.", ask("И как вам это?"));
  assert.equal(b.body, NO_FACT_NOTICE, "after a fact the counter starts again");
  assert.equal(a.body, "И что тогда?");
});

test("A3: two 'не знаю' in a row: the request is not repeated, a pause is offered once", async (t) => {
  const { say } = await setup(t, "Незнаю");
  const { DONT_KNOW_PAUSE } = await import("../src/lib/turn-policy");
  await say(LONG, ask("Что было дальше?", LONG));
  const { NO_FACT_NOTICE } = await import("../src/lib/turn-policy");
  const first = await say("Не знаю.", ask("Приведите пример?"));
  assert.equal(first.body, "Приведите пример?");
  const second = await say("Не знаю.", ask("А ещё пример?"));
  assert.equal(second.body, NO_FACT_NOTICE, "two useless answers: the notice comes first");
  const third = await say("Не знаю.", ask("Ещё раз пример?"));
  assert.equal(third.body, DONT_KNOW_PAUSE, "the request for an example is not repeated: a pause is offered");
  assertPlainQuestion(DONT_KNOW_PAUSE, "pause");
  const fourth = await say("Не знаю.", ask("И ещё пример?"));
  assert.notEqual(fourth.body, DONT_KNOW_PAUSE, "the pause is offered once");
});

test("A4: 'хочу закончить' in state Н asks once, 'да' creates nothing; in state Д it offers the build", async (t) => {
  const { prisma, reelId, say } = await setup(t, "Конец");
  const { END_ASK_THIN, END_ACK } = await import("../src/lib/turn-policy");
  const first = await say("Хочу закончить.", ask("Расскажите ещё?"));
  assert.equal(first.body, END_ASK_THIN);
  assertPlainQuestion(END_ASK_THIN, "end ask");
  const yes = await say("Да.", ask("Расскажите ещё?"));
  assert.equal(yes.body, END_ACK);
  assert.equal(await prisma.scriptVersion.count({ where: { reelId, kind: { not: "from_take" } } }), 0, "nothing is created");
  assert.notEqual((await prisma.reel.findUniqueOrThrow({ where: { id: reelId } })).status, "done", "the thought is not finished");

  const second = await setup(t, "Конец Д");
  await second.say(LONG, ask("Что было потом?", LONG));
  const end = await second.say("Хватит.", ask("Расскажите ещё?"));
  assert.match(end.body, /^Пока у нас так:/);
  assert.ok(end.body.endsWith("Собрать сценарий?"));
  assert.equal((end.body.match(/\?/g) ?? []).length, 1);
});

test("A5: the dryness hint comes after two short answers, once; long answers never trigger it", async (t) => {
  const dry = await setup(t, "Сухой");
  const { DRYNESS_HINT } = await import("../src/lib/turn-policy");
  const { applyThoughtState } = await import("../src/lib/thought-state");
  await applyThoughtState({ reelId: dry.reelId, expectedRevision: 0, patch: { intent: "Показать, что привычка держится на первом шаге" } }); // goal named: the viewer-effect question stays out of this test
  await dry.say("Было в марте.", ask("Что было?", "Было в марте."));
  const second = await dry.say("Я начал бегать.", ask("Что дальше?"));
  assert.equal(second.body, `${DRYNESS_HINT} Что дальше?`, "two short answers in a row");
  const third = await dry.say("Стало легче.", ask("А потом?", "Стало легче."));
  assert.equal(third.body, "А потом?", "once per thought");

  const rich = await setup(t, "Развёрнутый");
  await applyThoughtState({ reelId: rich.reelId, expectedRevision: 0, patch: { intent: "Показать, как работает пауза перед ответом" } }); // goal named: no viewer-effect question here
  await rich.say(LONG, ask("Что было?", LONG));
  const r2 = await rich.say(`${LONG} Потом я рассказал об этом друзьям.`, ask("Что дальше?"));
  assert.equal(r2.body, "Что дальше?", "long answers: no hint");
  assert.equal((await rich.marks()).flat().includes("policy_dryness_hint"), false);
});

test("A6/A7: effect question once, then the build is offered once; 'не знаю' on the effect is not asked again", async (t) => {
  const s = await setup(t, "Готов");
  const { EFFECT_QUESTION } = await import("../src/lib/turn-policy");
  await s.say(LONG, ask("Что было потом?", LONG));
  const second = await s.say(`${LONG} И мне стало спокойнее.`, ask("Что дальше?", `${LONG} спокойнее.`));
  assert.equal(second.body, EFFECT_QUESTION, "case and main thought are there: the effect is asked");
  assertPlainQuestion(EFFECT_QUESTION, "effect");
  const third = await s.say("Не знаю.", suggest("Нет ответа"));
  assert.notEqual(third.body, EFFECT_QUESTION, "not asked again");
  assert.match(third.body, /^Пока у нас так:/, "the effect is skipped, the build is offered");
  const fourth = await s.say("Нет, это всё.", ask("Что ещё?"));
  assert.doesNotMatch(fourth.body, /Собрать сценарий/, "the offer is not repeated until a new fact");
  assert.equal((await s.marks()).flat().filter((m) => m === "policy_effect_ask").length, 1);
});

test("A7: the effect is not asked when the goal is already named", async (t) => {
  const s = await setup(t, "Цель названа");
  const { applyThoughtState } = await import("../src/lib/thought-state");
  await applyThoughtState({ reelId: s.reelId, expectedRevision: 0, patch: { intent: "Зритель должен перестать бояться первого шага" } });
  await s.say(LONG, ask("Что было потом?", LONG));
  const second = await s.say(`${LONG} И мне стало спокойнее.`, ask("Что дальше?", `${LONG} спокойнее.`));
  assert.equal(second.body, "Что дальше?");
});

test("long answers do not lose a fact named before the 12-message window", async (t) => {
  const s = await setup(t, "Окно");
  const early = "Первый заказ был на сайт для кофейни, и я не взял предоплату.";
  await s.say(early, ask("Что было потом?", early));
  let prompt = "";
  for (let i = 0; i < 14; i += 1) {
    const text = `${LONG} Шаг ${i}.`;
    await s.say(text, async (args) => {
      prompt = args.user;
      return ask(`Вопрос ${i}?`, i % 2 === 0 ? text : undefined)(args);
    });
  }
  assert.ok(prompt.includes(early), "the early fact is in the prompt of the 15th turn, outside the 12-message window");
});

test("rich-author finding: long answers without an accepted fact count as material: no notice, the button opens, 'хватит' offers the build", async (t) => {
  const s = await setup(t, "Длинные без фактов");
  const { NO_FACT_NOTICE } = await import("../src/lib/turn-policy");
  const { evaluateScriptReadiness } = await import("../src/lib/v05-script");
  const a = await s.say(LONG, ask("Что было потом?"));
  const b = await s.say(`${LONG} Потом я рассказал об этом друзьям и они удивились.`, ask("Что вы почувствовали?"));
  const c = await s.say(`${LONG} И с тех пор я так делаю всегда, когда пишу важные письма.`, ask("Что изменилось?"));
  for (const r of [a, b, c]) assert.notEqual(r.body, NO_FACT_NOTICE, "the model accepted no fact, but the answers were substantive");
  assert.equal((await evaluateScriptReadiness(s.reelId)).ready, true, "a substantive answer is enough for the button");
  const end = await s.say("Хватит.", ask("Что ещё?"));
  assert.match(end.body, /^Пока у нас так:/);
});
