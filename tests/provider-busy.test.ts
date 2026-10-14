import assert from "node:assert/strict";
import { test } from "node:test";
import { AiBudgetError, ProviderBusyError } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { groqClientSeam, groqRetryAfterMs, retryClock, withRetry } from "../src/lib/groq";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const env = process.env as Record<string, string | undefined>;

function rateLimit(retryAfter?: string, message = "Rate limit reached for model `openai/gpt-oss-120b` ... tokens per minute (TPM): Limit 8000, Used 7800, Requested 900. Please try again in 5s.") {
  return Object.assign(new Error(`429 ${message}`), { status: 429, headers: retryAfter === undefined ? {} : { "retry-after": retryAfter } });
}

const goodAnswer = {
  choices: [{ message: { content: JSON.stringify({ action: "ask_question", question: "Что было дальше с этим рынком?", clarificationReason: "нужно уточнение", whyUnknown: "мало данных", thoughtUpdate: { fact: null, closeGapIds: [] } }) } }],
  usage: { prompt_tokens: 20, completion_tokens: 10 },
};

/** Installs a fake provider client whose answers come from `script` (an Error is thrown, anything else returned). */
function fakeProvider(script: Array<Error | typeof goodAnswer>) {
  const state = { calls: 0 };
  groqClientSeam.client = {
    chat: {
      completions: {
        create: async () => {
          const step = script[Math.min(state.calls, script.length - 1)];
          state.calls += 1;
          if (step instanceof Error) throw step;
          return step;
        },
      },
    },
  } as never;
  return state;
}

function pauses() {
  const waited: number[] = [];
  const original = retryClock.sleep;
  retryClock.sleep = async (ms) => { waited.push(ms); };
  return { waited, restore: () => { retryClock.sleep = original; } };
}

test("withRetry: 429 then success on the 2nd attempt, pause from Retry-After", async (t) => {
  const p = pauses();
  t.after(p.restore);
  let calls = 0;
  const value = await withRetry(async () => { calls += 1; if (calls === 1) throw rateLimit("3"); return "ok"; }, { retries: 3 });
  assert.equal(value, "ok");
  assert.equal(calls, 2);
  assert.deepEqual(p.waited, [3750]);
});

test("withRetry: no Retry-After → exponential pauses, at most 3 attempts, total wait inside the budget", async (t) => {
  const p = pauses();
  t.after(p.restore);
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls += 1; throw rateLimit(undefined, "Too many requests"); }, { retries: 3 }), (e: unknown) => (e as { status?: number }).status === 429);
  assert.equal(calls, 3);
  assert.deepEqual(p.waited, [2000, 4000]);
  assert.ok(p.waited.reduce((a, b) => a + b, 0) <= 60_000);
});

test("withRetry: a pause the 60 s budget cannot cover (daily limit) is not waited for", async (t) => {
  const p = pauses();
  t.after(p.restore);
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls += 1; throw rateLimit("7200"); }, { retries: 3 }));
  assert.equal(calls, 1, "gave up at once");
  assert.deepEqual(p.waited, []);
  // two 40 s pauses: the first fits, the second would pass 60 s in total
  calls = 0;
  await assert.rejects(withRetry(async () => { calls += 1; throw rateLimit("39"); }, { retries: 3 }));
  assert.equal(calls, 2);
  assert.deepEqual(p.waited, [39_750]);
  assert.equal(groqRetryAfterMs(rateLimit("2")), 2750);
});

async function setupThought(t: Parameters<typeof withPostgresTestDb>[0]) {
  const { prisma } = await withPostgresTestDb(t);
  const saved = { policy: env.VOCAL_TURN_POLICY, mock: env.VOCAL_AI_MOCK };
  env.VOCAL_TURN_POLICY = "0";
  delete env.VOCAL_AI_MOCK;
  const p = pauses();
  t.after(async () => {
    p.restore();
    groqClientSeam.client = null;
    if (saved.policy === undefined) delete env.VOCAL_TURN_POLICY; else env.VOCAL_TURN_POLICY = saved.policy;
    if (saved.mock !== undefined) env.VOCAL_AI_MOCK = saved.mock;
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const made = await createThoughtFromText({ title: "Мысль", body: "Я начал ходить на рынок рано утром.", idempotencyKey: `busy-${Math.random()}` });
  return { prisma, p, reelId: made.reel.id };
}

test("dialogue: 429 on the first attempt, success on the second: one turn, no error bubble", async (t) => {
  const { prisma, p, reelId } = await setupThought(t);
  const provider = fakeProvider([rateLimit("1"), goodAnswer]);
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const page = await sendDialogueMessage(reelId, { text: "Я хожу туда по утрам.", idempotencyKey: "busy-ok-1" });
  assert.equal(provider.calls, 2);
  assert.deepEqual(p.waited, [1750]);
  assert.equal(page.messages.filter((m) => m.role === "assistant" && m.status === "done" && m.kind === "question").length, 1);
  assert.equal(page.messages.filter((m) => m.kind === "error").length, 0);
  assert.equal(await prisma.dialogueMessage.count({ where: { role: "user" } }), 1);
});

test("dialogue: 429 three times: a clear message, the author's text is kept, a re-send with the same key makes no second turn", async (t) => {
  const { prisma, p, reelId } = await setupThought(t);
  const provider = fakeProvider([rateLimit("2")]);
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const send = () => sendDialogueMessage(reelId, { text: "Я хожу туда по утрам.", idempotencyKey: "busy-fail-1" });

  await assert.rejects(send(), (e: unknown) =>
    e instanceof ProviderBusyError && e instanceof AiBudgetError && e.status === 503 && e.code === "AI_BUSY" && e.longWait === false &&
    e.message === "Vocal сейчас занят. Повторю через минуту.");
  assert.equal(provider.calls, 3, "three attempts, no more");
  assert.deepEqual(p.waited, [2750, 2750]);
  assert.equal(await prisma.dialogueMessage.count({ where: { role: "user", idempotencyKey: "busy-fail-1" } }), 1, "the author's message is kept");
  assert.equal(await prisma.aiCall.count({ where: { kind: "dialogue", status: "done" } }), 0);
  assert.ok((await prisma.aiCall.count({ where: { status: "rate_limited" } })) >= 1, "the refusal is recorded apart from done/error");
  const charged = await prisma.aiCall.aggregate({ where: { status: { in: ["done", "error"] } }, _sum: { promptTokens: true, completionTokens: true } });
  assert.equal((charged._sum.promptTokens ?? 0) + (charged._sum.completionTokens ?? 0), 0, "a provider refusal costs the author nothing");

  // the provider recovers; the author presses "Повторить": same key
  groqClientSeam.client = null;
  fakeProvider([goodAnswer]);
  const page = await send();
  assert.equal(await prisma.dialogueMessage.count({ where: { role: "user", idempotencyKey: "busy-fail-1" } }), 1, "no second user message");
  assert.equal(page.messages.filter((m) => m.role === "assistant" && m.status === "done" && m.kind === "question").length, 1, "one turn");
  const turnCalls = await prisma.aiCall.findMany({ where: { kind: "dialogue", turnKey: { not: null } } });
  assert.equal(turnCalls.length, 1, "one AiCall per turnKey");
  assert.equal(turnCalls[0].status, "done");

  // and a further repeat of the same send is a replay, not a third turn
  const again = await send();
  assert.equal(again.messages.filter((m) => m.role === "assistant" && m.kind === "question" && m.status === "done").length, 1);
  assert.equal(await prisma.aiCall.count({ where: { kind: "dialogue", turnKey: { not: null } } }), 1);
});

test("dialogue: a daily-limit 429 (long Retry-After) is not waited for and does not promise \"a minute\"", async (t) => {
  const { p, reelId } = await setupThought(t);
  const provider = fakeProvider([rateLimit("14400")]);
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  await assert.rejects(sendDialogueMessage(reelId, { text: "Я хожу туда по утрам.", idempotencyKey: "busy-day-1" }), (e: unknown) =>
    e instanceof ProviderBusyError && e.longWait === true && e.code === "AI_BUSY" && !/через минуту/.test(e.message));
  assert.equal(provider.calls, 1);
  assert.deepEqual(p.waited, []);
});

test("speech: 429 from the provider is ProviderBusyError and is not charged to the daily speech seconds", async (t) => {
  const { prisma } = await setupThought(t);
  const { meteredTranscribe } = await import("../src/lib/ai/gateway");
  const { sttSecondsUsedToday } = await import("../src/lib/ai/usage-guard");
  await assert.rejects(
    meteredTranscribe("/nonexistent.mp3", (async () => { throw rateLimit("2"); }) as never, { seconds: 30 }),
    (e: unknown) => e instanceof ProviderBusyError,
  );
  assert.equal(await sttSecondsUsedToday(), 0);
  assert.equal(await prisma.aiCall.count({ where: { kind: "stt", status: "rate_limited" } }), 1);
});
