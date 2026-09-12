import assert from "node:assert/strict";
import { test } from "node:test";
import { DraftSaveError, ScriptDraftSaveSession } from "../src/lib/script-draft-save";

test("failed leave or finalize unlocks buttons so the same text can be retried", async () => {
  let fail = true;
  let calls = 0;
  const session = new ScriptDraftSaveSession({
    patch: async (input) => {
      calls += 1;
      if (fail) throw new Error("network down");
      return {
        draft: {
          body: input.body,
          updatedAt: "t1",
          saveToken: input.expectedSaveToken + 1,
        },
      };
    },
  });
  session.hydrate({ body: "старый текст", updatedAt: "t0", saveToken: 1 }, false);
  session.mode = "draft";
  session.body = "правка без автосохранения";
  assert.equal(session.mode, "draft");
  assert.equal(session.buttonsDisabled, false);

  await session.backToReady();
  assert.equal(calls, 1);
  assert.equal(session.mode, "draft");
  assert.equal(session.body, "правка без автосохранения");
  assert.equal(session.saving, false);
  assert.equal(session.finalizing, false);
  assert.equal(session.buttonsDisabled, false);
  assert.match(session.error ?? "", /network down/);

  fail = false;
  await session.backToReady();
  assert.equal(calls, 2);
  assert.equal(session.mode, "ready");
  assert.equal(session.saving, false);
  assert.equal(session.buttonsDisabled, false);
  assert.equal(session.error, null);

  const finalizeSession = new ScriptDraftSaveSession({
    patch: async () => {
      throw new Error("500");
    },
  });
  finalizeSession.hydrate({ body: "черновик", updatedAt: "t0", saveToken: 1 }, false);
  finalizeSession.mode = "draft";
  finalizeSession.body = "тот же текст повторно";
  await finalizeSession.finalize(async () => {
    throw new Error("finalize should not run after patch fail");
  });
  assert.equal(finalizeSession.mode, "draft");
  assert.equal(finalizeSession.body, "тот же текст повторно");
  assert.equal(finalizeSession.saving, false);
  assert.equal(finalizeSession.finalizing, false);
  assert.equal(finalizeSession.buttonsDisabled, false);
});

test("overlapping saves wait in one queue and still clear saving", async () => {
  let release!: () => void;
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = 0;
  const session = new ScriptDraftSaveSession({
    patch: async (input) => {
      started += 1;
      if (started === 1) await first;
      return {
        draft: { body: input.body, updatedAt: `t${started}`, saveToken: input.expectedSaveToken + 1 },
      };
    },
  });
  session.hydrate({ body: "a", updatedAt: "t0", saveToken: 1 }, false);
  session.body = "b";
  const one = session.save();
  const two = session.save();
  await Promise.resolve();
  assert.equal(session.saving, true);
  assert.equal(session.buttonsDisabled, true);
  assert.equal(started, 1);
  release();
  await Promise.all([one, two]);
  assert.equal(session.saving, false);
  assert.equal(session.buttonsDisabled, false);
  assert.ok(started <= 2);
});

test("stale patch keeps local body and unlocks buttons", async () => {
  const session = new ScriptDraftSaveSession({
    patch: async () => {
      throw new DraftSaveError("stale", "STALE");
    },
    onStale: async () => ({ updatedAt: "t9", saveToken: 9 }),
  });
  session.hydrate({ body: "сервер", updatedAt: "t0", saveToken: 1 }, false);
  session.body = "локальная правка";
  await assert.rejects(() => session.save(), /не потерян/);
  assert.equal(session.body, "локальная правка");
  assert.equal(session.expectedSaveToken, 9);
  assert.equal(session.saving, false);
  assert.equal(session.buttonsDisabled, false);
});
