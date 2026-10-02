import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ScriptDraftComposer } from "../src/components/ScriptDraftComposer";
import { DraftSaveError, ScriptDraftSaveSession } from "../src/lib/script-draft-save";

function composerMarkup(session: ScriptDraftSaveSession, handlers: { onFinalize?: () => void; onBackToReady?: () => void }) {
  const snap = session.getSnapshot();
  return renderToStaticMarkup(
    createElement(ScriptDraftComposer, {
      draftBody: snap.body,
      saving: snap.saving,
      finalizing: snap.finalizing,
      status: snap.status,
      expectedUpdatedAt: snap.expectedUpdatedAt,
      onBodyChange: (body) => session.setBody(body),
      onFinalize: handlers.onFinalize ?? (() => undefined),
      onBackToReady: handlers.onBackToReady ?? (() => undefined),
      onDelete: () => undefined,
    }),
  );
}

test("new session hydrates nonempty server draft into the textarea", () => {
  const session = new ScriptDraftSaveSession({
    patch: async (input) => ({
      draft: { body: input.body, updatedAt: "t1", saveToken: input.expectedSaveToken + 1 },
    }),
  });
  assert.equal(session.body, "");
  session.hydrate({ body: "серверный черновик", updatedAt: "t0", saveToken: 1 }, false);
  assert.equal(session.body, "серверный черновик");
  assert.equal(session.savedBody, "серверный черновик");
  assert.equal(session.hasUnsavedLocalEdits(), false);
});

test("clean session replaces textarea with a newer server draft", () => {
  const session = new ScriptDraftSaveSession({
    patch: async (input) => ({
      draft: { body: input.body, updatedAt: "t2", saveToken: input.expectedSaveToken + 1 },
    }),
  });
  session.hydrate({ body: "первый сервер", updatedAt: "t0", saveToken: 1 }, false);
  session.hydrate({ body: "второй сервер", updatedAt: "t1", saveToken: 2 }, false);
  assert.equal(session.body, "второй сервер");
  assert.equal(session.savedBody, "второй сервер");
  assert.equal(session.hasUnsavedLocalEdits(), false);
});

test("generate hydrate keeps unsaved local textarea edits", () => {
  const session = new ScriptDraftSaveSession({
    patch: async (input) => ({
      draft: { body: input.body, updatedAt: "t1", saveToken: input.expectedSaveToken + 1 },
    }),
  });
  session.hydrate({ body: "сервер до генерации", updatedAt: "t0", saveToken: 1 }, false);
  session.setBody("пользователь меняет textarea");
  assert.equal(session.hasUnsavedLocalEdits(), true);
  session.hydrate({ body: "новая версия с сервера", updatedAt: "t2", saveToken: 2 }, false);
  assert.equal(session.body, "пользователь меняет textarea");
  assert.equal(session.savedBody, "новая версия с сервера");
  assert.equal(session.hasUnsavedLocalEdits(), true);
});

test("queued save(B) uses token after PATCH A ack, not the enqueue-time token", async () => {
  let releaseA!: () => void;
  const holdA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  const sentTokens: number[] = [];
  const session = new ScriptDraftSaveSession({
    patch: async (input) => {
      sentTokens.push(input.expectedSaveToken);
      if (input.body === "A") await holdA;
      return {
        draft: {
          body: input.body,
          updatedAt: `t${input.expectedSaveToken}`,
          saveToken: input.expectedSaveToken + 1,
        },
      };
    },
  });
  session.hydrate({ body: "init", updatedAt: "t0", saveToken: 1 }, false);
  session.setBody("A");
  const saveA = session.save();
  await Promise.resolve();
  await Promise.resolve();
  session.setBody("B");
  const saveB = session.save();
  releaseA();
  await saveA;
  await saveB;
  assert.deepEqual(sentTokens, [1, 2]);
  assert.equal(session.body, "B");
  assert.equal(session.savedBody, "B");
  assert.equal(session.expectedSaveToken, 3);
  assert.equal(session.error, null);
  assert.equal(session.hasUnsavedLocalEdits(), false);
});

test("PATCH ack keeps newer local body unsaved after sent A", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const session = new ScriptDraftSaveSession({
    patch: async (input) => {
      await hold;
      return { draft: { body: input.body, updatedAt: "t1", saveToken: input.expectedSaveToken + 1 } };
    },
  });
  session.hydrate({ body: "init", updatedAt: "t0", saveToken: 1 }, false);
  session.setBody("A");
  const pending = session.save();
  await Promise.resolve();
  session.setBody("B");
  release();
  await pending;
  assert.equal(session.body, "B");
  assert.equal(session.savedBody, "A");
  assert.equal(session.expectedSaveToken, 2);
  assert.equal(session.hasUnsavedLocalEdits(), true);
});

test("ScriptEditor binds composer to session snapshot, not a late finally", () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/components/ScriptEditor.tsx"), "utf8");
  assert.match(source, /useSyncExternalStore/);
  assert.match(source, /ScriptDraftComposer/);
  assert.match(source, /snap\.saving/);
  assert.match(source, /snap\.finalizing/);
  assert.equal(source.includes(".finally(() => syncSession())"), false);
});

function draftButtons(html: string) {
  const buttons = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)];
  const attrs = (label: RegExp) => buttons.find((item) => label.test(item[2] ?? ""))?.[1] ?? "";
  const disabled = (label: RegExp) => /\sdisabled(?:=""|=true)?(?:\s|>|$)/.test(attrs(label));
  return {
    finalizeDisabled: disabled(/Завершить версию|Завершаем/),
    backDisabled: disabled(/К готовым версиям/),
    savingLabel: html.includes("Сохраняем…"),
  };
}

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
  assert.equal(session.saving, true);
  assert.equal(session.buttonsDisabled, true);
  await Promise.resolve();
  await Promise.resolve();
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

test("ScriptDraftComposer disables during in-flight PATCH and finalize, then unlocks for retry", async () => {
  let release!: (error?: Error) => void;
  let hang = new Promise<void>((resolve, reject) => {
    release = (error) => (error ? reject(error) : resolve());
  });
  let failNext = true;
  let patches = 0;
  const session = new ScriptDraftSaveSession({
    patch: async (input) => {
      patches += 1;
      await hang;
      if (failNext) throw new Error("500");
      return {
        draft: { body: input.body, updatedAt: "t1", saveToken: input.expectedSaveToken + 1 },
      };
    },
  });
  session.hydrate({ body: "старый", updatedAt: "t0", saveToken: 1 }, false);
  session.enterDraft();
  session.setBody("правка без автосохранения");

  let html = composerMarkup(session, {});
  session.subscribe(() => {
    html = composerMarkup(session, {
      onFinalize: () => {
        void session.finalize(async () => undefined);
      },
      onBackToReady: () => {
        void session.backToReady();
      },
    });
  });

  const firstLeave = session.backToReady();
  let buttons = draftButtons(html);
  assert.equal(session.getSnapshot().saving, true);
  assert.equal(buttons.backDisabled, true);
  assert.equal(buttons.finalizeDisabled, true);
  assert.equal(buttons.savingLabel, true);

  release(new Error("500"));
  await firstLeave;
  html = composerMarkup(session, {});
  buttons = draftButtons(html);
  assert.equal(session.mode, "draft");
  assert.equal(session.body, "правка без автосохранения");
  assert.equal(buttons.backDisabled, false);
  assert.equal(buttons.finalizeDisabled, false);
  assert.equal(session.getSnapshot().buttonsDisabled, false);

  failNext = false;
  hang = new Promise<void>((resolve, reject) => {
    release = (error) => (error ? reject(error) : resolve());
  });
  const retry = session.backToReady();
  assert.equal(draftButtons(composerMarkup(session, {})).backDisabled, true);
  release();
  await retry;
  assert.equal(session.mode, "ready");
  assert.equal(patches, 2);

  hang = new Promise<void>((resolve, reject) => {
    release = (error) => (error ? reject(error) : resolve());
  });
  const finalizeSession = new ScriptDraftSaveSession({
    patch: async (input) => {
      await hang;
      return {
        draft: { body: input.body, updatedAt: "t2", saveToken: input.expectedSaveToken + 1 },
      };
    },
  });
  finalizeSession.hydrate({ body: "черновик", updatedAt: "t0", saveToken: 1 }, false);
  finalizeSession.enterDraft();
  finalizeSession.setBody("текст для завершения");
  let submits = 0;
  const firstFinalize = finalizeSession.finalize(async () => {
    submits += 1;
  });
  const during = composerMarkup(finalizeSession, {});
  assert.equal(finalizeSession.getSnapshot().finalizing, true);
  assert.equal(draftButtons(during).finalizeDisabled, true);
  assert.equal(draftButtons(during).backDisabled, true);
  await finalizeSession.finalize(async () => {
    submits += 1;
  });
  assert.equal(submits, 0);
  release();
  await firstFinalize;
  assert.equal(submits, 1);
  assert.equal(finalizeSession.finalizing, false);
});
