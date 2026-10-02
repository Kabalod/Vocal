import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyScriptGenerateResult,
  beginScriptGeneratePost,
  retryScriptGenerateKey,
} from "../src/lib/v05-generate-keys";

test("lost generate response retries the posted key", () => {
  let n = 0;
  const makeKey = () => `K${++n}`;
  let state = { postedKey: "K0", nextExplicitKey: "K1" };
  state = beginScriptGeneratePost(state, "K1");
  assert.equal(state.postedKey, "K1");
  const lost = applyScriptGenerateResult(state, { ok: false, networkError: true, makeKey });
  assert.equal(lost.fault, "error");
  assert.equal(retryScriptGenerateKey(lost.state, lost.fault), "K1");
});

test("confirmed conflict rotates the next explicit key", () => {
  let n = 1;
  const makeKey = () => `K${++n}`;
  let state = beginScriptGeneratePost({ postedKey: "K0", nextExplicitKey: "K1" }, "K1");
  const conflict = applyScriptGenerateResult(state, { ok: false, code: "SNAPSHOT_CONFLICT", makeKey });
  assert.equal(conflict.fault, "conflict");
  assert.equal(retryScriptGenerateKey(conflict.state, conflict.fault), "K2");
  state = beginScriptGeneratePost(conflict.state, conflict.state.nextExplicitKey);
  assert.equal(state.postedKey, "K2");
  const lost = applyScriptGenerateResult(state, { ok: false, networkError: true, makeKey });
  assert.equal(retryScriptGenerateKey(lost.state, lost.fault), "K2");
});

test("AI_INFLIGHT keeps the same key", () => {
  const state = beginScriptGeneratePost({ postedKey: "K0", nextExplicitKey: "K9" }, "K9");
  const inflight = applyScriptGenerateResult(state, {
    ok: false,
    code: "AI_INFLIGHT",
    makeKey: () => "K-new",
  });
  assert.equal(inflight.fault, "inflight");
  assert.equal(inflight.state.postedKey, "K9");
  assert.equal(inflight.state.nextExplicitKey, "K9");
  assert.equal(retryScriptGenerateKey(inflight.state, inflight.fault), "K9");
});
