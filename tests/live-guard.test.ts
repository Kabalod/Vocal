import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import {
  assertLiveProviderCallAllowed,
  createXaiChatCompletion,
  getGroq,
  groqClientSeam,
  liveProviderCallsAllowed,
  resetGroq,
} from "../src/lib/groq";

// No network: every case either throws before a client exists or uses a fake client / a stubbed fetch.
const KEYS = ["NODE_ENV", "VOCAL_LIVE_TESTS", "GROQ_API_KEY", "XAI_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let fetchCalls = 0;

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  delete process.env.VOCAL_LIVE_TESTS;
  process.env.GROQ_API_KEY = "gsk_not_a_real_key";
  process.env.XAI_API_KEY = "xai_not_a_real_key";
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("network must not be reached in this test");
  }) as typeof fetch;
  groqClientSeam.client = null;
  resetGroq();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else (process.env as Record<string, string | undefined>)[key] = saved[key];
  }
  globalThis.fetch = realFetch;
  groqClientSeam.client = null;
  resetGroq();
});

test("under NODE_ENV=test without VOCAL_LIVE_TESTS=1 a real Groq client cannot be created, even with a key", () => {
  assert.equal(liveProviderCallsAllowed(), false);
  assert.throws(() => getGroq(), /VOCAL_LIVE_TESTS=1/);
  assert.throws(() => assertLiveProviderCallAllowed("test"), /заблокирован/);
});

test("the xAI chat call is blocked before fetch", async () => {
  await assert.rejects(createXaiChatCompletion({ model: "m", system: "s", user: "u" }), /VOCAL_LIVE_TESTS=1/);
  assert.equal(fetchCalls, 0);
});

test("a fake client through the seam still works (mocks are not blocked)", () => {
  const fake = { audio: {} } as never;
  groqClientSeam.client = fake;
  assert.equal(getGroq(), fake);
});

test("VOCAL_LIVE_TESTS=1 lifts the block; outside NODE_ENV=test nothing is blocked", () => {
  process.env.VOCAL_LIVE_TESTS = "1";
  assert.equal(liveProviderCallsAllowed(), true);
  delete process.env.VOCAL_LIVE_TESTS;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  assert.equal(liveProviderCallsAllowed(), true);
});

test("live-model test files skip unless VOCAL_LIVE_TESTS=1 and do not read the key from .env otherwise", () => {
  for (const file of ["tests/c00-classify-live.test.ts", "tests/c00-live-model.test.ts"]) {
    const src = readFileSync(path.resolve(file), "utf8");
    assert.match(src, /const LIVE = liveTestsEnabled\(\) &&/, file);
    assert.match(src, /if \(liveTestsEnabled\(\)\) loadLocalEnv\(\)/, file);
    assert.match(src, /t\.skip\(LIVE_SKIP_REASON\)/, file);
  }
});
