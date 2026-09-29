import assert from "node:assert/strict";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { LLM_MODEL } from "../src/lib/config";
import { PROFILE_DIALOGUE_KIND } from "../src/lib/ai/profile";
import { ownerUserId, portraitProfileId } from "../src/lib/auth/session";
import { V04ActionError, parseV04ModelReply } from "../src/lib/v04-action";
import { persistProfilePayload, readStoredProfilePayload } from "../src/lib/profile";
import { buildPortrait } from "../src/lib/profile-portrait";
import { emptyProfileFields } from "../src/types/profile";
import { commitV04ProfileTurn, parseV04ResultEnvelope } from "../src/lib/v04-commit";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

function weakObservationJson(evidenceMessageIds: string[]) {
  return JSON.stringify({
    kind: "apply_update",
    category: "concreteness",
    value: "high",
    scope: "global",
    evidenceType: "behavioral_observation",
    evidenceMessageIds,
    confidence: 0.4,
    operation: "add_observation",
  });
}

function replaceExplicitJson(evidenceMessageIds: string[]) {
  return JSON.stringify({
    kind: "apply_update",
    category: "blog_goal",
    value: "говорить своими словами",
    scope: "global",
    evidenceType: "explicit_statement",
    evidenceMessageIds,
    confidence: 0.9,
    operation: "replace_explicit",
  });
}

test("V04-02 writes honest no-slice events and defers direct replace_explicit", async (t) => {
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
  const started = await startProfileDialogue();
  const revisionsBefore = await prisma.profileRevision.count({ where: { profileId: portraitProfileId() } });
  const assistantId = started.dialogue.messages.find((item) => item.role === "assistant")?.id;
  assert.ok(assistantId);

  const afterWeak = await sendProfileMessage(
    { text: "Обычно иду от примера.", idempotencyKey: "v04-02-weak" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return { text: weakObservationJson([user.id]), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );
  assert.match(afterWeak.dialogue.messages.at(-1)?.body ?? "", /не меняет/);
  const weakCall = await prisma.aiCall.findFirst({
    where: { kind: PROFILE_DIALOGUE_KIND, status: "done" },
    orderBy: { createdAt: "desc" },
  });
  const weakEnvelope = parseV04ResultEnvelope(weakCall?.resultJson);
  assert.equal(weakEnvelope?.event?.operation, "add_observation");
  assert.equal(weakEnvelope?.event?.applyResult.displaySliceChanged, false);
  assert.equal(weakEnvelope?.event?.applyResult.newRevisionId, null);
  assert.equal(weakEnvelope?.deferred, undefined);
  assert.equal(
    await prisma.profileRevision.count({ where: { profileId: portraitProfileId() } }),
    revisionsBefore,
  );

  const afterReplace = await sendProfileMessage(
    { text: "Хочу говорить своими словами.", idempotencyKey: "v04-02-replace" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return { text: replaceExplicitJson([user.id]), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );
  assert.match(afterReplace.dialogue.messages.at(-1)?.body ?? "", /не меняю отображаемый портрет/);
  const replaceCall = await prisma.aiCall.findFirst({
    where: { kind: PROFILE_DIALOGUE_KIND, status: "done" },
    orderBy: { createdAt: "desc" },
  });
  const replaceEnvelope = parseV04ResultEnvelope(replaceCall?.resultJson);
  assert.equal(replaceEnvelope?.kind, "apply_update");
  assert.equal(replaceEnvelope?.event, null);
  assert.equal(replaceEnvelope?.deferred, true);
  assert.equal(
    await prisma.profileRevision.count({ where: { profileId: portraitProfileId() } }),
    revisionsBefore,
  );

  const again = await sendProfileMessage(
    { text: "Обычно иду от примера.", idempotencyKey: "v04-02-weak" },
    async () => {
      throw new Error("model must not run on the same idempotency key");
    },
  );
  assert.equal(again.dialogue.messages.filter((item) => item.role === "user").length, 2);

  const afterNoChange = await sendProfileMessage(
    { text: "Спасибо, это приятно слышать.", idempotencyKey: "v04-02-no-change" },
    async () => ({
      text: JSON.stringify({ kind: "no_change", reasonCode: "praise_or_support" }),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  assert.match(afterNoChange.dialogue.messages.at(-1)?.body ?? "", /не записываю/);

  const afterThought = await sendProfileMessage(
    { text: "В том ролике я сказал иначе.", idempotencyKey: "v04-02-thought" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return {
        text: JSON.stringify({
          kind: "thought_specific",
          reasonCode: "reel_episode",
          auditUserMessageId: user.id,
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );
  assert.match(afterThought.dialogue.messages.at(-1)?.body ?? "", /мысли/);

  const afterBadSource = await sendProfileMessage(
    { text: "Ещё раз про цель.", idempotencyKey: "v04-02-assistant-evidence" },
    async () => ({
      text: replaceExplicitJson([assistantId]),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  assert.equal(afterBadSource.dialogue.messages.at(-1)?.kind, "error");
});

test("V04-02 defers replace_explicit even when the value already matches the portrait", async (t) => {
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
  const stored = await readStoredProfilePayload();
  const fields = emptyProfileFields().map((field) =>
    field.id === "whyRecord" ? { ...field, text: "говорить своими словами" } : field,
  );
  await persistProfilePayload({
    ...stored,
    fields,
    portrait: buildPortrait(fields, true),
    pending: null,
  });

  await sendProfileMessage(
    { text: "По-прежнему говорить своими словами.", idempotencyKey: "v04-02-replace-same" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return { text: replaceExplicitJson([user.id]), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );
  const sameCall = await prisma.aiCall.findFirst({
    where: { kind: PROFILE_DIALOGUE_KIND, status: "done" },
    orderBy: { createdAt: "desc" },
  });
  const envelope = parseV04ResultEnvelope(sameCall?.resultJson);
  assert.equal(envelope?.kind, "apply_update");
  assert.equal(envelope?.event, null);
  assert.equal(envelope?.deferred, true);
});

test("V04-02 rejects mismatched turn ids and rolls back a broken processing write", async (t) => {
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
    { text: "Обычно иду от примера.", idempotencyKey: "v04-02-bind-seed" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return { text: weakObservationJson([user.id]), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );

  const user = await prisma.dialogueMessage.findFirst({ where: { role: "user" }, orderBy: { createdAt: "asc" } });
  assert.ok(user);
  const thread = await prisma.dialogueThread.findFirst({ where: { profileId: portraitProfileId() } });
  assert.ok(thread);
  const processing = await prisma.dialogueMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      kind: "processing",
      body: "Собираю портрет…",
      status: "pending",
    },
  });
  const hangingCall = await prisma.aiCall.create({
    data: {
      kind: PROFILE_DIALOGUE_KIND,
      profileId: portraitProfileId(),
      model: LLM_MODEL,
      status: "running",
      ownerUserId: ownerUserId(),
      promptText: "test",
      inputSnapshotJson: "{}",
    },
  });
  const action = parseV04ModelReply(JSON.parse(weakObservationJson([user.id])) as unknown);

  await prisma.creatorProfile.create({ data: { id: "other-profile", ownerUserId: "other-profile" } });
  const otherThread = await prisma.dialogueThread.create({
    data: { scope: "profile", profileId: "other-profile" },
  });
  const foreignProcessing = await prisma.dialogueMessage.create({
    data: {
      threadId: otherThread.id,
      role: "assistant",
      kind: "processing",
      body: "Собираю портрет…",
      status: "pending",
    },
  });
  await assert.rejects(
    () =>
      commitV04ProfileTurn({
        prisma,
        callId: hangingCall.id,
        processingId: foreignProcessing.id,
        userMessageId: user.id,
        profileId: portraitProfileId(),
        ownerUserId: ownerUserId(),
        action,
        rawText: weakObservationJson([user.id]),
        promptTokens: 1,
        completionTokens: 1,
      }),
    (err: unknown) => err instanceof V04ActionError && err.code === "V04_TURN_MISMATCH",
  );
  const untouched = await prisma.aiCall.findUnique({ where: { id: hangingCall.id } });
  assert.equal(untouched?.status, "running");
  assert.equal(untouched?.resultJson, null);

  await assert.rejects(
    () =>
      commitV04ProfileTurn({
        prisma,
        callId: hangingCall.id,
        processingId: "missing-processing",
        userMessageId: user.id,
        profileId: portraitProfileId(),
        ownerUserId: ownerUserId(),
        action,
        rawText: weakObservationJson([user.id]),
        promptTokens: 1,
        completionTokens: 1,
      }),
    (err: unknown) => err instanceof V04ActionError && err.code === "V04_TURN_MISMATCH",
  );
  const rolled = await prisma.aiCall.findUnique({ where: { id: hangingCall.id } });
  assert.equal(rolled?.status, "running");
  assert.equal(rolled?.resultJson, null);
  const stillPending = await prisma.dialogueMessage.findUnique({ where: { id: processing.id } });
  assert.equal(stillPending?.status, "pending");
  assert.equal(stillPending?.kind, "processing");
});
