import assert from "node:assert/strict";
import { test } from "node:test";
import { GenerationGuard } from "../src/lib/generation-guard";
import { ReelEditorSession } from "../src/lib/reel-editor-session";
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
  session.dispose();
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
  session.dispose();
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
