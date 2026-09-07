import assert from "node:assert/strict";
import { test } from "node:test";
import { GenerationGuard } from "../src/lib/generation-guard";
import {
  leaveReelEditor,
  mountReelWorkspaceEffects,
  ReelEditorSession,
  runReactStrictModeEffects,
} from "../src/lib/reel-editor-session";
import { ReelError } from "../src/lib/reels";
import type { ReelDto, UpdateReelInput } from "../src/types/reel";

function reel(partial: Partial<ReelDto> & Pick<ReelDto, "id" | "title" | "initialNote" | "updatedAt">): ReelDto {
  return {
    status: "idea",
    selectedTakeId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    takes: [],
    takeCount: 0,
    hasScript: false,
    ...partial,
  };
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("delayed note save does not overwrite newer draft", async () => {
  let resolveSave: ((value: ReelDto) => void) | undefined;
  const session = new ReelEditorSession(
    async () =>
      new Promise<ReelDto>((resolve) => {
        resolveSave = resolve;
      }),
    async () => {
      throw new Error("load should not run");
    },
  );
  const base = reel({
    id: "r1",
    title: "T",
    initialNote: "",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  session.hydrate(base);
  session.setNote("раз");
  session.requestSave();
  await tick();
  session.setNote("раз два");
  assert.equal(session.draftNote, "раз два");
  resolveSave?.(
    reel({
      id: "r1",
      title: "T",
      initialNote: "раз",
      updatedAt: "2026-01-01T00:00:01.000Z",
    }),
  );
  await tick();
  await tick();
  assert.equal(session.draftNote, "раз два");
  assert.equal(session.confirmed?.initialNote, "раз");
  assert.equal(session.isDirty(), true);
});

test("title then note save sequentially with updated version", async () => {
  const calls: UpdateReelInput[] = [];
  const resolvers: Array<(value: ReelDto) => void> = [];
  const session = new ReelEditorSession(
    async (patch) => {
      calls.push(patch);
      return new Promise<ReelDto>((resolve) => resolvers.push(resolve));
    },
    async () => {
      throw new Error("load should not run");
    },
  );
  session.hydrate(
    reel({ id: "r1", title: "A", initialNote: "n0", updatedAt: "t0" }),
  );
  session.setTitle("B");
  session.requestSave();
  await tick();
  session.setNote("n1");
  session.requestSave();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedUpdatedAt, "t0");
  assert.equal(calls[0].title, "B");
  resolvers[0](
    reel({ id: "r1", title: "B", initialNote: "n0", updatedAt: "t1" }),
  );
  await tick();
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].expectedUpdatedAt, "t1");
  assert.equal(calls[1].initialNote, "n1");
  resolvers[1](
    reel({ id: "r1", title: "B", initialNote: "n1", updatedAt: "t2" }),
  );
  await tick();
  assert.equal(session.saveState, "saved");
  assert.equal(session.draftNote, "n1");
  assert.equal(session.draftTitle, "B");
});

test("network error keeps draft and allows retry", async () => {
  let fail = true;
  const session = new ReelEditorSession(
    async (patch) => {
      if (fail) {
        throw Object.assign(new Error("offline"), { code: "NETWORK", status: 0 });
      }
      return reel({
        id: "r1",
        title: patch.title ?? "T",
        initialNote: "ok",
        updatedAt: "t2",
      });
    },
    async () => {
      throw new Error("unused");
    },
  );
  session.hydrate(reel({ id: "r1", title: "T", initialNote: "", updatedAt: "t0" }));
  session.setNote("черновик");
  session.requestSave();
  await tick();
  await tick();
  assert.equal(session.saveState, "error");
  assert.equal(session.draftNote, "черновик");
  fail = false;
  session.retry();
  await tick();
  await tick();
  assert.equal(session.saveState, "saved");
  assert.equal(session.draftNote, "черновик");
});

test("409 keeps draft and does not apply server text", async () => {
  const session = new ReelEditorSession(
    async () => {
      throw new ReelError("conflict", "STALE", 409);
    },
    async () =>
      reel({
        id: "r1",
        title: "сервер",
        initialNote: "чужой текст",
        updatedAt: "t9",
      }),
  );
  session.hydrate(reel({ id: "r1", title: "T", initialNote: "", updatedAt: "t0" }));
  session.setNote("мой черновик");
  session.requestSave();
  await tick();
  await tick();
  assert.equal(session.saveState, "error");
  assert.equal(session.conflict, true);
  assert.equal(session.draftNote, "мой черновик");
  assert.equal(session.confirmed?.updatedAt, "t9");
  assert.equal(session.confirmed?.initialNote, "чужой текст");
});

test("generation guard ignores stale list responses", () => {
  const guard = new GenerationGuard();
  const first = guard.begin();
  const second = guard.begin();
  const applied: string[] = [];
  if (first.isCurrent()) applied.push("first");
  if (second.isCurrent()) applied.push("second");
  assert.deepEqual(applied, ["second"]);
});

test("react strict effect remount still applies in-flight save", async () => {
  let resolveSave: ((value: ReelDto) => void) | undefined;
  const session = new ReelEditorSession(
    async () =>
      new Promise<ReelDto>((resolve) => {
        resolveSave = resolve;
      }),
    async () => {
      throw new Error("load should not run");
    },
  );
  session.hydrate(reel({ id: "r1", title: "T", initialNote: "", updatedAt: "t0" }));
  session.setNote("после remount");
  session.requestSave();
  await tick();
  runReactStrictModeEffects(() =>
    mountReelWorkspaceEffects(
      session,
      () => {},
      () => {},
      null,
    ),
  );
  resolveSave?.(
    reel({
      id: "r1",
      title: "T",
      initialNote: "после remount",
      updatedAt: "t1",
    }),
  );
  await tick();
  await tick();
  assert.equal(session.saveState, "saved");
  assert.equal(session.isDirty(), false);
  assert.equal(session.confirmed?.updatedAt, "t1");
  assert.equal(session.draftNote, "после remount");
});

test("409 does not auto-save a draft queued during the conflicting request", async () => {
  const calls: UpdateReelInput[] = [];
  let rejectSave: ((error: unknown) => void) | undefined;
  const session = new ReelEditorSession(
    async (patch) => {
      calls.push(patch);
      return new Promise<ReelDto>((_resolve, reject) => {
        rejectSave = reject;
      });
    },
    async () =>
      reel({
        id: "r1",
        title: "T",
        initialNote: "сервер",
        updatedAt: "t9",
      }),
  );
  session.hydrate(reel({ id: "r1", title: "T", initialNote: "", updatedAt: "t0" }));
  session.setNote("раз");
  session.requestSave();
  await tick();
  session.setNote("раз два");
  session.requestSave();
  assert.equal(calls.length, 1);
  rejectSave?.(new ReelError("conflict", "STALE", 409));
  await tick();
  await tick();
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(session.conflict, true);
  assert.equal(session.saveState, "error");
  assert.equal(session.draftNote, "раз два");
  assert.equal(session.confirmed?.updatedAt, "t9");
  session.requestSave();
  await tick();
  assert.equal(calls.length, 1);
});

test("leave waits for delayed save and stays on network error", async () => {
  let fail = false;
  let resolveSave: ((value: ReelDto) => void) | undefined;
  const session = new ReelEditorSession(
    async (patch) => {
      if (fail) {
        throw Object.assign(new Error("offline"), { code: "NETWORK", status: 0 });
      }
      return new Promise<ReelDto>((resolve) => {
        resolveSave = resolve;
      }).then(() =>
        reel({
          id: "r1",
          title: "T",
          initialNote: patch.initialNote ?? "",
          updatedAt: "t1",
        }),
      );
    },
    async () => {
      throw new Error("unused");
    },
  );
  session.hydrate(reel({ id: "r1", title: "T", initialNote: "", updatedAt: "t0" }));
  session.setNote("уход");
  session.requestSave();
  await tick();
  let navigated = false;
  const leaving = leaveReelEditor(
    session,
    () => {
      navigated = true;
    },
    () => {},
  );
  assert.equal(navigated, false);
  resolveSave?.(reel({ id: "r1", title: "T", initialNote: "уход", updatedAt: "t1" }));
  assert.equal(await leaving, true);
  assert.equal(navigated, true);
  assert.equal(session.saveState, "saved");

  session.setNote("офлайн");
  fail = true;
  navigated = false;
  const blocked = await leaveReelEditor(
    session,
    () => {
      navigated = true;
    },
    () => {},
  );
  assert.equal(blocked, false);
  assert.equal(navigated, false);
  assert.equal(session.draftNote, "офлайн");
  assert.equal(session.saveState, "error");
});

test("delayed create reloads the current filter, not the one from POST start", async () => {
  const guard = new GenerationGuard();
  const applied: string[] = [];
  const pending: Array<{ query: string; resume: () => void }> = [];

  function makeLoad(query: string) {
    return async () => {
      const req = guard.begin();
      await new Promise<void>((resolve) => {
        pending.push({ query, resume: resolve });
      });
      if (req.isCurrent()) applied.push(query);
    };
  }

  const loadRef = { current: makeLoad("open") };
  let finishPost: (() => void) | undefined;
  const post = new Promise<void>((resolve) => {
    finishPost = resolve;
  });

  const onCreate = async () => {
    await post;
    await loadRef.current();
  };

  const creating = onCreate();
  loadRef.current = makeLoad("archived");
  const filterReload = loadRef.current();
  finishPost?.();
  await tick();
  const openLoads = pending.filter((item) => item.query === "open");
  const archivedLoads = pending.filter((item) => item.query === "archived");
  assert.equal(openLoads.length, 0);
  for (const item of archivedLoads) item.resume();
  await creating;
  await filterReload;
  assert.deepEqual(applied, ["archived"]);
});
