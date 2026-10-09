import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_MAX_TOKENS, createWithJsonBudget, isJsonBudgetError, RETRY_MAX_TOKENS } from "../src/lib/ai/complete";
import { budgetRecentText, RECENT_TEXT_CHAR_BUDGET } from "../src/lib/dialogue";

const budgetError = () =>
  Object.assign(new Error(`400 {"error":{"message":"Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details.","type":"invalid_request_error","code":"json_validate_failed","failed_generation":"max completion tokens reached before generating a valid document"}}`), { status: 400 });

test("E1: the live 400 (max completion tokens before a valid document) is retried once with a larger output budget", async () => {
  const seen: number[] = [];
  const result = await createWithJsonBudget(async (max) => {
    seen.push(max);
    if (max === BASE_MAX_TOKENS) throw budgetError();
    return "ok";
  });
  assert.equal(result, "ok");
  assert.deepEqual(seen, [BASE_MAX_TOKENS, RETRY_MAX_TOKENS]);
});

test("E1: other 400s and a second failure are not retried more than once", async () => {
  let calls = 0;
  await assert.rejects(createWithJsonBudget(async () => { calls += 1; throw Object.assign(new Error("400 bad request: model not found"), { status: 400 }); }));
  assert.equal(calls, 1, "a 400 that is not a JSON-budget failure is not retried");
  calls = 0;
  await assert.rejects(createWithJsonBudget(async () => { calls += 1; throw budgetError(); }));
  assert.equal(calls, 2, "one retry only");
  assert.equal(isJsonBudgetError(Object.assign(new Error("429"), { status: 429 })), false);
});

test("E1: the recent history is cut by a character budget, newest kept, not by a fixed message count", () => {
  const long = "слово ".repeat(150); // 900 characters
  const rows = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", body: `${i} ${long}` })); // newest first
  const text = budgetRecentText(rows);
  assert.ok(text.length <= RECENT_TEXT_CHAR_BUDGET + 1000, "within the budget");
  assert.ok(text.includes("0 слово"), "the newest message is kept");
  assert.ok(!text.includes("19 слово"), "the oldest are dropped when the budget is spent");
  const short = budgetRecentText(Array.from({ length: 20 }, (_, i) => ({ role: "user", body: `m${i}` })));
  assert.equal(short.split("\n").length, 20, "short messages: all of the last twenty fit");
});
