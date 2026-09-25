import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { StateVersionError } from "../src/lib/ai/usage-guard";
import { createReel, createTake, updateReel } from "../src/lib/reels";
import { createThoughtFromText } from "../src/lib/thought-create";
import { applyThoughtState, getThoughtState } from "../src/lib/thought-state";

test("thought create seeds ThoughtState with the working take", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "Состояние",
    body: "Текст мысли для ThoughtState.",
    idempotencyKey: "v02-create-state",
  });
  const state = await getThoughtState(reel.id);
  assert.equal(state.workingTakeId, reel.workingTakeId);
  assert.equal(state.revision, 0);
  assert.equal(state.intent, "");
  assert.deepEqual(state.facts, []);
  assert.deepEqual(state.openGaps, []);
});

test("createReel seeds empty ThoughtState; first take becomes the pointer", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  const reel = await createReel({ title: "Пустая мысль" });
  const before = await getThoughtState(reel.id);
  assert.equal(before.workingTakeId, null);
  const take = await createTake(reel.id, { inputType: "text", bodyText: "первый дубль" });
  const after = await getThoughtState(reel.id);
  assert.equal(after.workingTakeId, take.id);
  assert.equal(after.revision, 1);
});

test("switching working take updates ThoughtState and bumps revision", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  const reel = await createReel({ title: "Смена дубля" });
  const take1 = await createTake(reel.id, { inputType: "text", bodyText: "один" });
  const take2 = await createTake(reel.id, { inputType: "text", bodyText: "два" });
  await updateReel(reel.id, { workingTakeId: take2.id });
  const state = await getThoughtState(reel.id);
  assert.equal(state.workingTakeId, take2.id);
  assert.ok(state.revision >= 2);
  assert.equal(take1.id !== take2.id, true);
});

test("reducer CAS rejects a stale revision and does not write dialogue", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "CAS",
    body: "Материал для ревизии состояния.",
    idempotencyKey: "v02-cas-state",
  });
  const first = await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: { intent: "донести тезис", facts: ["факт автора"], openGaps: ["кто аудитория"] },
  });
  assert.equal(first.revision, 1);
  await assert.rejects(
    () => applyThoughtState({ reelId: reel.id, expectedRevision: 0, patch: { intent: "устарело" } }),
    (error: unknown) => error instanceof StateVersionError,
  );
  const state = await getThoughtState(reel.id);
  assert.equal(state.intent, "донести тезис");
  assert.deepEqual(state.facts, ["факт автора"]);
  assert.equal(await prisma.dialogueMessage.count(), 0);
  const reelRow = await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } });
  assert.equal(reelRow.status, "idea");
});

test("database rejects a ThoughtState working take from another thought", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const a = await createThoughtFromText({
    title: "A",
    body: "Мысль A для FK.",
    idempotencyKey: "v02-fk-a",
  });
  const b = await createThoughtFromText({
    title: "B",
    body: "Мысль B для FK.",
    idempotencyKey: "v02-fk-b",
  });
  await assert.rejects(() =>
    prisma.thoughtState.update({
      where: { reelId: a.reel.id },
      data: { workingTakeId: b.reel.workingTakeId },
    }),
  );
});
