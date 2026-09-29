import assert from "node:assert/strict";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import type { PrismaClient } from "@prisma/client";
import { PROFILE_DIALOGUE_KIND } from "../src/lib/ai/profile";
import { ownerUserId, portraitProfileId } from "../src/lib/auth/session";
import { parseV04ModelReply } from "../src/lib/v04-action";
import { commitV04ProfileTurn, parseV04ResultEnvelope } from "../src/lib/v04-commit";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

function observationJson(evidenceMessageIds: string[]) {
  return JSON.stringify({
    kind: "apply_update",
    category: "concreteness",
    value: "high",
    scope: "global",
    evidenceType: "behavioral_observation",
    evidenceMessageIds,
    confidence: 0.9,
    operation: "add_observation",
  });
}

async function latestUser(prisma: PrismaClient) {
  const user = await prisma.dialogueMessage.findFirst({
    where: { role: "user" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(user);
  return user;
}

async function acceptedEvents(prisma: PrismaClient) {
  const calls = await prisma.aiCall.findMany({
    where: { kind: PROFILE_DIALOGUE_KIND, profileId: portraitProfileId() },
  });
  return calls.map((call) => parseV04ResultEnvelope(call.resultJson)).filter((envelope) => envelope?.event);
}

test("V04-05 replays the same idempotency key without a second event", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { startProfileDialogue, sendProfileMessage } = await import("../src/lib/profile-dialogue");
  await startProfileDialogue();
  let modelCalls = 0;
  const complete = async () => {
    modelCalls += 1;
    const user = await latestUser(prisma);
    return { text: observationJson([user.id]), usage: { promptTokens: 1, completionTokens: 1 } };
  };

  await Promise.all([
    sendProfileMessage({ text: "Иду от примера.", idempotencyKey: "v04-05-same-key" }, complete),
    sendProfileMessage({ text: "Иду от примера.", idempotencyKey: "v04-05-same-key" }, complete),
  ]);
  await sendProfileMessage({ text: "Иду от примера.", idempotencyKey: "v04-05-same-key" }, complete);

  assert.equal(modelCalls, 1);
  assert.equal((await acceptedEvents(prisma)).length, 1);
  assert.equal(await prisma.dialogueMessage.count({ where: { role: "user" } }), 1);
});

test("V04-05 retries commit on a done AiCall without a second event", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { startProfileDialogue, sendProfileMessage } = await import("../src/lib/profile-dialogue");
  await startProfileDialogue();
  await sendProfileMessage(
    { text: "Иду от примера.", idempotencyKey: "v04-05-retry-seed" },
    async () => {
      const user = await latestUser(prisma);
      return { text: observationJson([user.id]), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );
  const call = await prisma.aiCall.findFirstOrThrow({
    where: { kind: PROFILE_DIALOGUE_KIND, status: "done" },
    orderBy: { createdAt: "desc" },
  });
  const processing = await prisma.dialogueMessage.findFirstOrThrow({
    where: { role: "assistant", status: "done" },
    orderBy: { createdAt: "desc" },
  });
  const user = await prisma.dialogueMessage.findFirstOrThrow({
    where: { role: "user" },
    orderBy: { createdAt: "desc" },
  });
  const before = call.resultJson;
  await commitV04ProfileTurn({
    prisma,
    callId: call.id,
    processingId: processing.id,
    userMessageId: user.id,
    profileId: portraitProfileId(),
    ownerUserId: ownerUserId(),
    action: parseV04ModelReply(JSON.parse(observationJson([user.id])) as unknown),
    rawText: observationJson([user.id]),
    promptTokens: 1,
    completionTokens: 1,
  });
  const after = await prisma.aiCall.findUniqueOrThrow({ where: { id: call.id } });
  assert.equal(after.resultJson, before);
  assert.equal((await acceptedEvents(prisma)).length, 1);
});

test("V04-05 serializes concurrent turns and rereads journal weights", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { startProfileDialogue, sendProfileMessage } = await import("../src/lib/profile-dialogue");
  await startProfileDialogue();

  let enteredA: () => void;
  let enteredB: () => void;
  const aReady = new Promise<void>((resolve) => {
    enteredA = resolve;
  });
  const bReady = new Promise<void>((resolve) => {
    enteredB = resolve;
  });
  const bothReady = Promise.all([aReady, bReady]);

  const sendA = sendProfileMessage(
    { text: "Первое наблюдение.", idempotencyKey: "v04-05-weight-a" },
    async () => {
      const user = await latestUser(prisma);
      enteredA();
      await bothReady;
      return { text: observationJson([user.id]), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );
  const sendB = aReady.then(() =>
    sendProfileMessage(
      { text: "Второе наблюдение.", idempotencyKey: "v04-05-weight-b" },
      async () => {
        const user = await latestUser(prisma);
        enteredB();
        await bothReady;
        return { text: observationJson([user.id]), usage: { promptTokens: 1, completionTokens: 1 } };
      },
    ),
  );
  await Promise.all([sendA, sendB]);

  const weights = (await acceptedEvents(prisma))
    .map((envelope) => envelope?.event?.applyResult.systemWeight)
    .sort((left, right) => (left ?? 0) - (right ?? 0));
  assert.deepEqual(weights, [1, 2]);
});

test("V04-05 rejects a second concurrent event for the same evidence id", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { startProfileDialogue, sendProfileMessage } = await import("../src/lib/profile-dialogue");
  await startProfileDialogue();

  let sourceId = "";
  let enteredA: () => void;
  let enteredB: () => void;
  const aReady = new Promise<void>((resolve) => {
    enteredA = resolve;
  });
  const bReady = new Promise<void>((resolve) => {
    enteredB = resolve;
  });
  const bothReady = Promise.all([aReady, bReady]);

  const sendA = sendProfileMessage(
    { text: "Одно основание.", idempotencyKey: "v04-05-id-a" },
    async () => {
      const user = await latestUser(prisma);
      sourceId = user.id;
      enteredA();
      await bothReady;
      return { text: observationJson([user.id]), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );
  const sendB = aReady.then(() =>
    sendProfileMessage(
      { text: "Тот же источник другим ходом.", idempotencyKey: "v04-05-id-b" },
      async () => {
        enteredB();
        await bothReady;
        return { text: observationJson([sourceId]), usage: { promptTokens: 1, completionTokens: 1 } };
      },
    ),
  );
  await Promise.all([sendA, sendB]);

  assert.equal((await acceptedEvents(prisma)).length, 1);
  assert.ok(sourceId);
});
