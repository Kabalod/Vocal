import assert from "node:assert/strict";
import { test } from "node:test";
import { AiBudgetError, AiPausedError, assertDailyTokenBudget, RateLimitedError } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const env = process.env as Record<string, string | undefined>;
const reply = (json: Record<string, unknown>, tokens = 10) => ({ text: JSON.stringify(json), usage: { promptTokens: tokens, completionTokens: tokens } });
const askModel = (question = "Что было дальше с этой историей?") => async () =>
  reply({ action: "ask_question", question, clarificationReason: "нужно уточнение", whyUnknown: "мало данных", thoughtUpdate: { fact: null, closeGapIds: [] } });

async function setup(t: Parameters<typeof withPostgresTestDb>[0], overrides: Record<string, string> = {}) {
  const { prisma } = await withPostgresTestDb(t);
  const saved: Record<string, string | undefined> = {};
  const set = { VOCAL_QUOTA: "on", VOCAL_TURN_POLICY: "0", ...overrides };
  for (const [k, v] of Object.entries(set)) { saved[k] = env[k]; env[k] = v; }
  t.after(async () => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete env[k]; else env[k] = v; }
    const { resetRequestRateForTests } = await import("../src/lib/quota");
    resetRequestRateForTests();
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const quota = await import("../src/lib/quota");
  quota.resetRequestRateForTests();
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  let n = 0;
  const create = (key?: string) => createThoughtFromText({ title: "Мысль", body: "Я начал ходить на рынок рано утром.", idempotencyKey: key ?? `quota-${(n += 1)}-${Math.random()}` });
  return { prisma, quota, create };
}

test("J1: quota exhausted: the 3rd thought of a 2-thought period answers 402 QUOTA_EXHAUSTED with the end of the period; existing thoughts stay readable", async (t) => {
  const { prisma, quota, create } = await setup(t);
  await assert.rejects(create(), (e: unknown) => e instanceof quota.QuotaExhaustedError && e.status === 402 && e.code === "QUOTA_EXHAUSTED" && e.periodEnd === null, "no paid period: refused");
  const status = await quota.renewPeriod("local", { limit: 2 });
  assert.equal(status.thoughtsLimit, 2);
  const first = await create();
  await create();
  await assert.rejects(create(), (e: unknown) => e instanceof quota.QuotaExhaustedError && e.periodEnd instanceof Date);
  const after = await quota.getQuotaStatus();
  assert.deepEqual([after.thoughtsUsed, after.remaining, after.canCreate], [2, 0, false]);
  assert.equal(await prisma.reel.count(), 2, "the refused creation left nothing behind");
  const { getReel } = await import("../src/lib/reels");
  assert.equal((await getReel(first.reel.id))?.id, first.reel.id, "an existing thought is still readable");
  const { quotaErrorResponse } = await import("../src/lib/quota-http");
  const response = quotaErrorResponse(new quota.QuotaExhaustedError(new Date("2026-11-01T00:00:00Z")));
  assert.equal(response?.status, 402);
  assert.deepEqual(await response?.json(), { error: "Лимит мыслей на оплаченный период исчерпан. Продлите тариф, чтобы создавать новые мысли.", code: "QUOTA_EXHAUSTED", periodEnd: "2026-11-01T00:00:00.000Z" });
});

test("J1: an expired period (or one that has not started) refuses, the period is [start, end)", async (t) => {
  const { prisma, quota, create } = await setup(t);
  const hour = 3_600_000;
  await prisma.userQuota.create({ data: { ownerUserId: "local", periodStart: new Date(Date.now() - 48 * hour), periodEnd: new Date(Date.now() - hour), thoughtsLimit: 100, thoughtsUsed: 0 } });
  await assert.rejects(create(), (e: unknown) => e instanceof quota.QuotaExhaustedError, "expired");
  await prisma.userQuota.update({ where: { ownerUserId: "local" }, data: { periodStart: new Date(Date.now() + hour), periodEnd: new Date(Date.now() + 48 * hour) } });
  await assert.rejects(create(), (e: unknown) => e instanceof quota.QuotaExhaustedError, "not started");
  // the end is exclusive: at exactly periodEnd the period is over, one millisecond before it is not
  const end = new Date(Date.now() + 5 * hour);
  await prisma.userQuota.update({ where: { ownerUserId: "local" }, data: { periodStart: new Date(Date.now() - hour), periodEnd: end } });
  const { prisma: _p } = { prisma };
  void _p;
  await prisma.$transaction(async (tx) => {
    await assert.rejects(quota.consumeThoughtSlot(tx, "local", end), (e: unknown) => e instanceof quota.QuotaExhaustedError);
  });
  await prisma.$transaction(async (tx) => {
    await quota.consumeThoughtSlot(tx, "local", new Date(end.getTime() - 1));
  });
  assert.equal((await quota.getQuotaStatus()).thoughtsUsed, 1);
});

test("J1: renewal resets thoughtsUsed and starts a new period at the payment date", async (t) => {
  const { quota, create } = await setup(t);
  await quota.renewPeriod("local", { limit: 1 });
  await create();
  await assert.rejects(create(), (e: unknown) => e instanceof quota.QuotaExhaustedError);
  const paidAt = new Date(Date.now() + 10 * 24 * 3_600_000);
  const renewed = await quota.renewPeriod("local", { now: paidAt, days: 30 });
  assert.equal(renewed.thoughtsUsed, 0);
  assert.equal(renewed.thoughtsLimit, 1, "the limit is kept");
  assert.equal(renewed.periodStart, paidAt.toISOString());
  assert.equal(renewed.periodEnd, new Date(paidAt.getTime() + 30 * 24 * 3_600_000).toISOString());
  const fresh = await quota.renewPeriod("local");
  assert.equal(fresh.canCreate, true);
  await create();
  assert.equal((await quota.getQuotaStatus()).thoughtsUsed, 1);
});

test("J1: a thought is counted once: a replay of its key, the dialogue, the script and parallel creations do not spend more", async (t) => {
  const { quota, create } = await setup(t, { VOCAL_RATE_PER_MINUTE: "1000" });
  await quota.renewPeriod("local", { limit: 3 });
  const made = await create("quota-key-1");
  assert.equal((await quota.getQuotaStatus()).thoughtsUsed, 1);
  const replay = await create("quota-key-1");
  assert.equal(replay.created, false);
  assert.equal((await quota.getQuotaStatus()).thoughtsUsed, 1, "the same key does not spend twice");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  await sendDialogueMessage(made.reel.id, { text: "Я хожу туда по вторникам.", idempotencyKey: "quota-dlg-1" }, askModel() as never);
  const { acceptAuthorAnswer } = await import("./helpers/author-fact");
  await acceptAuthorAnswer(made.reel.id);
  const { generateV05Script } = await import("../src/lib/v05-script");
  await generateV05Script(made.reel.id, { idempotencyKey: "quota-gen-1" }, (async () => reply({ script: "Я хожу на рынок.", changes: ["Убрал лишнее."] })) as never);
  await generateV05Script(made.reel.id, { idempotencyKey: "quota-gen-2" }, (async () => reply({ script: "Я хожу на рынок рано.", changes: ["Уточнил время."] })) as never);
  assert.equal((await quota.getQuotaStatus()).thoughtsUsed, 1, "dialogue, script and repeated generation spend nothing");
  // the last two slots: three parallel creations, exactly two succeed
  const results = await Promise.allSettled([create(), create(), create()]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  assert.ok(results.some((r) => r.status === "rejected" && r.reason instanceof quota.QuotaExhaustedError));
  assert.equal((await quota.getQuotaStatus()).thoughtsUsed, 3);
});

test("J1: the per-thought ceiling: after 8 questions the model is not called and the author is offered the script", async (t) => {
  const { quota, create } = await setup(t, { VOCAL_RATE_PER_MINUTE: "1000" });
  await quota.renewPeriod("local");
  const made = await create();
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  let calls = 0;
  const questions = ["Что вы покупаете первым?", "Кто стоит рядом?", "Сколько там людей?", "Как пахнет утром?", "Что говорит продавец?", "Куда вы идёте потом?", "Зачем вам сметана?", "Когда вы возвращаетесь?"];
  const model = (async () => { calls += 1; return askModel(questions[(calls - 1) % questions.length])(); }) as never;
  let last = "";
  for (let i = 1; i <= 8; i += 1) {
    const page = await sendDialogueMessage(made.reel.id, { text: `Ответ автора номер ${i}, я хожу туда по утрам.`, idempotencyKey: `quota-ceil-${i}` }, model);
    last = page.messages.filter((m) => m.role === "assistant" && m.status === "done").at(-1)?.body ?? "";
  }
  assert.equal(calls, 8);
  assert.equal(last, "Когда вы возвращаетесь?");
  const ninth = await sendDialogueMessage(made.reel.id, { text: "Ещё одно сообщение автора.", idempotencyKey: "quota-ceil-9" }, model);
  assert.equal(calls, 8, "no model call past the ceiling");
  assert.equal(ninth.messages.filter((m) => m.role === "assistant" && m.status === "done").at(-1)?.body, quota.CEILING_REPLY);
  assert.match(quota.CEILING_REPLY, /сгенерировать сценарий/i);
  const tenth = await sendDialogueMessage(made.reel.id, { text: "И ещё одно.", idempotencyKey: "quota-ceil-10" }, model);
  assert.equal(calls, 8);
  assert.equal(tenth.messages.filter((m) => m.role === "assistant" && m.status === "done").at(-1)?.body, quota.CEILING_REPLY);
});

test("J1: the per-thought token ceiling (about 40k) stops the model too", async (t) => {
  const { quota, create } = await setup(t, { VOCAL_RATE_PER_MINUTE: "1000", VOCAL_THOUGHT_TOKEN_CEILING: "1000" });
  await quota.renewPeriod("local");
  const made = await create();
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  let calls = 0;
  const heavy = (async () => { calls += 1; return reply({ action: "ask_question", question: "Что было дальше с рынком?", clarificationReason: "нужно уточнение", whyUnknown: "мало данных", thoughtUpdate: { fact: null, closeGapIds: [] } }, 600); }) as never;
  await sendDialogueMessage(made.reel.id, { text: "Я хожу на рынок утром.", idempotencyKey: "quota-tok-1" }, heavy);
  const second = await sendDialogueMessage(made.reel.id, { text: "Там тихо и мало людей.", idempotencyKey: "quota-tok-2" }, heavy);
  assert.equal(calls, 1, "1200 tokens spent against a ceiling of 1000: the second turn does not call the model");
  assert.equal(second.messages.filter((m) => m.role === "assistant" && m.status === "done").at(-1)?.body, quota.CEILING_REPLY);
});

test("J1: request rate per minute, the global switch, and the daily token limit only for owners", async (t) => {
  const { prisma, quota, create } = await setup(t, { VOCAL_RATE_PER_MINUTE: "3" });
  await quota.renewPeriod("local");
  await create(); await create(); await create();
  await assert.rejects(create(), (e: unknown) => e instanceof RateLimitedError && e.status === 429 && e.code === "RATE_LIMITED" && e instanceof AiBudgetError);
  quota.resetRequestRateForTests();
  quota.checkRequestRate("local", 1_000_000);
  quota.checkRequestRate("local", 1_000_100);
  quota.checkRequestRate("local", 1_000_200);
  assert.throws(() => quota.checkRequestRate("local", 1_030_000), RateLimitedError);
  quota.checkRequestRate("local", 1_061_000); // a minute later the window has moved on

  // daily token limit: off for an ordinary author, on for an owner
  await prisma.aiCall.create({ data: { kind: "dialogue", model: "m", status: "done", promptText: "", inputSnapshotJson: "{}", promptTokens: 500, completionTokens: 500, ownerUserId: "local" } });
  env.VOCAL_DAILY_TOKEN_LIMIT = "100";
  await assertDailyTokenBudget(); // ordinary user: no per-user daily limit
  env.VOCAL_OWNER_USER_IDS = "local";
  await assert.rejects(assertDailyTokenBudget(), AiBudgetError, "the owner/dev contour keeps the daily limit");
  delete env.VOCAL_OWNER_USER_IDS;
  delete env.VOCAL_DAILY_TOKEN_LIMIT;

  // global switch
  env.VOCAL_GLOBAL_DAILY_TOKEN_CAP = "500";
  await assert.rejects(assertDailyTokenBudget(), (e: unknown) => e instanceof AiPausedError && e.status === 503 && e.code === "AI_PAUSED");
  env.VOCAL_GLOBAL_DAILY_TOKEN_CAP = "0";
  await assertDailyTokenBudget();
  delete env.VOCAL_GLOBAL_DAILY_TOKEN_CAP;
});

test("J1: outside production without VOCAL_QUOTA=on nothing is enforced; owners are exempt", async (t) => {
  const { quota, create } = await setup(t, { VOCAL_QUOTA: "off" });
  await create();
  assert.equal((await quota.getQuotaStatus()).enforced, false);
  env.VOCAL_QUOTA = "on";
  env.VOCAL_OWNER_USER_IDS = "local";
  await create();
  assert.equal((await quota.getQuotaStatus()).exempt, true);
  delete env.VOCAL_OWNER_USER_IDS;
  await assert.rejects(create(), (e: unknown) => e instanceof quota.QuotaExhaustedError);
});
