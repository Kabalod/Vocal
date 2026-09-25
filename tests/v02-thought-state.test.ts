import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import {
  applyIsolatedSchemaFiles,
  closePostgresTestDb,
  openPostgresTestDb,
  PRE_THOUGHT_STATE_MIGRATIONS,
  THOUGHT_STATE_MIGRATIONS,
  withPostgresTestDb,
} from "./helpers/postgres-test-db";
import { StateVersionError } from "../src/lib/ai/usage-guard";
import { runWithOwner } from "../src/lib/auth/session";
import { createReel, createTake, updateReel } from "../src/lib/reels";
import { createThoughtFromText } from "../src/lib/thought-create";
import {
  applyThoughtState,
  getThoughtState,
  ThoughtStateError,
  type ThoughtFact,
  type ThoughtGap,
} from "../src/lib/thought-state";

const ownerA = { id: "user-a", email: "a@vocal.local" };
const ownerB = { id: "user-b", email: "b@vocal.local" };

function noteFact(reelId: string, text = "факт автора"): ThoughtFact {
  return {
    id: "fact_note_1",
    text,
    sourceType: "initial_note",
    sourceId: reelId,
  };
}

function openGap(text = "кто аудитория"): ThoughtGap {
  return { id: "gap_audience", text, status: "open" };
}

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
    patch: {
      intent: "донести тезис",
      facts: [noteFact(reel.id)],
      openGaps: [openGap()],
    },
  });
  assert.equal(first.revision, 1);
  await assert.rejects(
    () => applyThoughtState({ reelId: reel.id, expectedRevision: 0, patch: { intent: "устарело" } }),
    (error: unknown) => error instanceof StateVersionError,
  );
  const state = await getThoughtState(reel.id);
  assert.equal(state.intent, "донести тезис");
  assert.equal(state.facts[0]?.id, "fact_note_1");
  assert.equal(state.facts[0]?.sourceType, "initial_note");
  assert.equal(state.facts[0]?.sourceId, reel.id);
  assert.equal(state.openGaps[0]?.id, "gap_audience");
  assert.equal(state.openGaps[0]?.status, "open");
  assert.equal(await prisma.dialogueMessage.count(), 0);
  const reelRow = await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } });
  assert.equal(reelRow.status, "idea");
});

test("facts require an author source on this thought", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "Источники",
    body: "Текст автора для факта.",
    idempotencyKey: "v02-fact-source",
  });
  const other = await createThoughtFromText({
    title: "Чужая",
    body: "Чужая мысль.",
    idempotencyKey: "v02-fact-other",
  });
  const thread = await prisma.dialogueThread.create({ data: { reelId: reel.id, scope: "reel" } });
  const userMessage = await prisma.dialogueMessage.create({
    data: {
      threadId: thread.id,
      role: "user",
      kind: "text",
      body: "Я снимаю для предпринимателей",
      status: "done",
    },
  });
  const assistantMessage = await prisma.dialogueMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      kind: "text",
      body: "Предположение модели",
      status: "done",
    },
  });
  const takeId = reel.workingTakeId;
  assert.ok(takeId);
  const revision = await prisma.transcriptRevision.findFirstOrThrow({ where: { takeId } });

  await assert.rejects(
    () =>
      applyThoughtState({
        reelId: reel.id,
        expectedRevision: 0,
        patch: { facts: ["предположение без источника"] as unknown as ThoughtFact[] },
      }),
    (error: unknown) => error instanceof ThoughtStateError && error.code === "THOUGHT_STATE_SHAPE",
  );

  await assert.rejects(
    () =>
      applyThoughtState({
        reelId: reel.id,
        expectedRevision: 0,
        patch: {
          facts: [
            {
              id: "fact_model",
              text: "предположение модели",
              sourceType: "dialogue_message",
              sourceId: assistantMessage.id,
            },
          ],
        },
      }),
    (error: unknown) => error instanceof ThoughtStateError && error.code === "THOUGHT_STATE_AUTHOR_SOURCE",
  );

  const otherRevision = await prisma.transcriptRevision.findFirstOrThrow({
    where: { takeId: other.reel.workingTakeId ?? "" },
  });
  await assert.rejects(
    () =>
      applyThoughtState({
        reelId: reel.id,
        expectedRevision: 0,
        patch: {
          facts: [
            {
              id: "fact_foreign",
              text: "не этот ролик",
              sourceType: "transcript_revision",
              sourceId: otherRevision.id,
            },
          ],
        },
      }),
    (error: unknown) => error instanceof ThoughtStateError && error.code === "THOUGHT_STATE_SOURCE",
  );

  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [
        {
          id: "fact_user",
          text: "для предпринимателей",
          sourceType: "dialogue_message",
          sourceId: userMessage.id,
        },
        {
          id: "fact_rev",
          text: "текст автора для факта",
          sourceType: "transcript_revision",
          sourceId: revision.id,
        },
      ],
    },
  });
  const state = await getThoughtState(reel.id);
  assert.equal(state.facts.length, 2);
  assert.equal(state.revision, 1);
});

test("user B cannot read or change user A's ThoughtState", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  const created = await runWithOwner(ownerA, () =>
    createThoughtFromText({
      title: "Мысль A",
      body: "Только для владельца A.",
      idempotencyKey: "v02-owner-a",
    }),
  );
  await runWithOwner(ownerA, async () => {
    await applyThoughtState({
      reelId: created.reel.id,
      expectedRevision: 0,
      patch: { intent: "замысел A", facts: [noteFact(created.reel.id)], openGaps: [openGap()] },
    });
  });
  await runWithOwner(ownerB, async () => {
    await assert.rejects(
      () => getThoughtState(created.reel.id),
      (error: unknown) => error instanceof ThoughtStateError && error.code === "THOUGHT_STATE_NOT_FOUND",
    );
    await assert.rejects(
      () =>
        applyThoughtState({
          reelId: created.reel.id,
          expectedRevision: 1,
          patch: { intent: "взлом" },
        }),
      (error: unknown) => error instanceof ThoughtStateError && error.code === "THOUGHT_STATE_NOT_FOUND",
    );
  });
  await runWithOwner(ownerA, async () => {
    const state = await getThoughtState(created.reel.id);
    assert.equal(state.intent, "замысел A");
    assert.equal(state.revision, 1);
    assert.equal(state.facts[0]?.id, "fact_note_1");
  });
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

test("database rejects ThoughtState owner different from Reel owner", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "Владелец",
    body: "Проверка FK владельца.",
    idempotencyKey: "v02-owner-fk",
  });
  await assert.rejects(() =>
    prisma.thoughtState.update({
      where: { reelId: reel.id },
      data: { ownerUserId: "other-owner" },
    }),
  );
});

test("migration 6 backfills ThoughtState for existing reels", async (t) => {
  const previous = {
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  };
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  const db = await openPostgresTestDb(process.env, PRE_THOUGHT_STATE_MIGRATIONS);
  t.after(async () => {
    await closePostgresTestDb(db);
    if (previous.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = previous.TEST_DATABASE_URL;
    if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.DATABASE_URL;
    if (previous.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else (process.env as { NODE_ENV?: string }).NODE_ENV = previous.NODE_ENV;
    await resetPrismaClient();
  });
  await resetPrismaClient();

  const empty = await db.prisma.reel.create({
    data: { title: "Без дубля", ownerUserId: "local", status: "idea" },
  });
  const withTake = await db.prisma.reel.create({
    data: { title: "С дублем", ownerUserId: "local", status: "idea" },
  });
  const take = await db.prisma.take.create({
    data: {
      reelId: withTake.id,
      number: 1,
      inputType: "text",
      bodyText: "уже существовал",
      mediaStatus: "ready",
    },
  });
  await db.prisma.reel.update({
    where: { id: withTake.id },
    data: { workingTakeId: take.id },
  });

  applyIsolatedSchemaFiles(db.baseUrl, db.schema, THOUGHT_STATE_MIGRATIONS, { createSchema: false });

  const emptyState = await db.prisma.thoughtState.findUniqueOrThrow({ where: { reelId: empty.id } });
  assert.equal(emptyState.ownerUserId, empty.ownerUserId);
  assert.equal(emptyState.workingTakeId, null);
  assert.equal(emptyState.revision, 0);
  const takeState = await db.prisma.thoughtState.findUniqueOrThrow({ where: { reelId: withTake.id } });
  assert.equal(takeState.ownerUserId, withTake.ownerUserId);
  assert.equal(takeState.workingTakeId, take.id);
});
