import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { LLM_MODEL } from "../src/lib/config";
import { PROFILE_DIALOGUE_KIND } from "../src/lib/ai/profile";
import { ownerUserId, portraitProfileId } from "../src/lib/auth/session";
import {
  parseProfileSessionJson,
  readStoredProfilePayload,
  serializeProfileSessionJson,
} from "../src/lib/profile";
import { resetProfileLockSeamForTests, setProfileLockSeamForTests } from "../src/lib/profile-lock-seam";
import { parseV04ModelReply } from "../src/lib/v04-action";
import { commitV04ProfileTurn } from "../src/lib/v04-commit";
import { emptyProfileFields } from "../src/types/profile";
import { v04ReplaceExplicitJson } from "./helpers/v04-profile-reply";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const LEGACY_SESSION = {
  skipped: true,
  supplementing: true,
  dialogueSessionStartId: "legacy-session-start",
  pending: {
    mode: "amend" as const,
    understood: "черновик сессии",
    openQuestions: ["что уточнить?"],
    draftFields: emptyProfileFields().map((field) =>
      field.id === "whyRecord" ? { ...field, text: "черновик цели" } : field,
    ),
    readyToConfirm: true,
  },
};

function assertSessionPreserved(stored: Awaited<ReturnType<typeof readStoredProfilePayload>>) {
  assert.equal(stored.skipped, true);
  assert.equal(stored.supplementing, true);
  assert.equal(stored.dialogueSessionStartId, LEGACY_SESSION.dialogueSessionStartId);
  assert.equal(stored.pending?.understood, "черновик сессии");
  assert.equal(stored.pending?.readyToConfirm, true);
}

function legacyPayloadJson() {
  return JSON.stringify({
    fields: emptyProfileFields(),
    skipped: LEGACY_SESSION.skipped,
    supplementing: LEGACY_SESSION.supplementing,
    portrait: null,
    pending: LEGACY_SESSION.pending,
    dialogueSessionStartId: LEGACY_SESSION.dialogueSessionStartId,
    v04Slice: {},
  });
}

async function seedLegacyTurn(
  prisma: PrismaClient,
  sessionJson = "{}",
): Promise<{
  revisionId: string;
  payloadJson: string;
  callId: string;
  processingId: string;
  userMessageId: string;
  rawText: string;
}> {
  const profileId = portraitProfileId();
  await prisma.creatorProfile.create({
    data: { id: profileId, ownerUserId: profileId, sessionJson },
  });
  const payloadJson = legacyPayloadJson();
  const revision = await prisma.profileRevision.create({
    data: { profileId, payloadJson },
  });
  await prisma.creatorProfile.update({
    where: { id: profileId },
    data: { currentRevisionId: revision.id },
  });
  const thread = await prisma.dialogueThread.create({
    data: { scope: "profile", profileId },
  });
  const user = await prisma.dialogueMessage.create({
    data: {
      threadId: thread.id,
      role: "user",
      kind: "text",
      body: "Хочу говорить своими словами.",
      status: "done",
    },
  });
  const processing = await prisma.dialogueMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      kind: "processing",
      body: "Собираю портрет…",
      status: "pending",
    },
  });
  const call = await prisma.aiCall.create({
    data: {
      kind: PROFILE_DIALOGUE_KIND,
      profileId,
      model: LLM_MODEL,
      status: "running",
      ownerUserId: ownerUserId(),
      promptText: "test",
      inputSnapshotJson: "{}",
    },
  });
  return {
    revisionId: revision.id,
    payloadJson,
    callId: call.id,
    processingId: processing.id,
    userMessageId: user.id,
    rawText: v04ReplaceExplicitJson([user.id], "blog_goal", "говорить своими словами"),
  };
}

async function commitReplace(prisma: PrismaClient, seeded: Awaited<ReturnType<typeof seedLegacyTurn>>) {
  await commitV04ProfileTurn({
    prisma,
    callId: seeded.callId,
    processingId: seeded.processingId,
    userMessageId: seeded.userMessageId,
    profileId: portraitProfileId(),
    ownerUserId: ownerUserId(),
    action: parseV04ModelReply(JSON.parse(seeded.rawText) as unknown),
    rawText: seeded.rawText,
    promptTokens: 1,
    completionTokens: 1,
  });
}

test("legacy session fields survive the first slice-changing apply_update", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const seeded = await seedLegacyTurn(prisma);
  const profileId = portraitProfileId();
  await commitReplace(prisma, seeded);

  const profile = await prisma.creatorProfile.findUnique({ where: { id: profileId } });
  assert.ok(profile);
  assert.notEqual(profile.sessionJson, "{}");
  const session = parseProfileSessionJson(profile.sessionJson);
  assert.deepEqual(
    {
      skipped: session?.skipped,
      supplementing: session?.supplementing,
      dialogueSessionStartId: session?.dialogueSessionStartId,
      pendingUnderstood: session?.pending?.understood,
    },
    {
      skipped: true,
      supplementing: true,
      dialogueSessionStartId: LEGACY_SESSION.dialogueSessionStartId,
      pendingUnderstood: "черновик сессии",
    },
  );

  const old = await prisma.profileRevision.findUnique({ where: { id: seeded.revisionId } });
  assert.equal(old?.payloadJson, seeded.payloadJson);
  assert.notEqual(profile.currentRevisionId, seeded.revisionId);

  const created = await prisma.profileRevision.findUnique({ where: { id: profile.currentRevisionId! } });
  assert.ok(created);
  const parsed = JSON.parse(created.payloadJson) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed).sort(), ["fields", "portrait", "v04Slice"]);
  assert.equal((parsed.v04Slice as { blog_goal?: string }).blog_goal, "говорить своими словами");

  const stored = await readStoredProfilePayload();
  assertSessionPreserved(stored);
  assert.equal(stored.v04Slice.blog_goal, "говорить своими словами");

  const processing = await prisma.dialogueMessage.findUnique({ where: { id: seeded.processingId } });
  const call = await prisma.aiCall.findUnique({ where: { id: seeded.callId } });
  assert.equal(processing?.status, "done");
  assert.equal(call?.status, "done");
});

test("explicit false/null sessionJson is not replaced by legacy revision values", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const cleared = serializeProfileSessionJson({
    skipped: false,
    supplementing: false,
    dialogueSessionStartId: null,
    pending: null,
  });
  const seeded = await seedLegacyTurn(prisma, cleared);
  await commitReplace(prisma, seeded);

  const profile = await prisma.creatorProfile.findUnique({ where: { id: portraitProfileId() } });
  assert.equal(profile?.sessionJson, cleared);
  const stored = await readStoredProfilePayload();
  assert.equal(stored.skipped, false);
  assert.equal(stored.supplementing, false);
  assert.equal(stored.dialogueSessionStartId, null);
  assert.equal(stored.pending, null);
  assert.equal(stored.v04Slice.blog_goal, "говорить своими словами");
  const old = await prisma.profileRevision.findUnique({ where: { id: seeded.revisionId } });
  assert.equal(old?.payloadJson, seeded.payloadJson);
});

test("rolling back the commit also rolls back session materialization and revision switch", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  resetProfileLockSeamForTests();
  t.after(async () => {
    resetProfileLockSeamForTests();
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const seeded = await seedLegacyTurn(prisma);
  const profileId = portraitProfileId();
  setProfileLockSeamForTests({
    afterLegacySessionWrite: async () => {
      throw new Error("test-abort-after-session");
    },
  });

  await assert.rejects(
    () => commitReplace(prisma, seeded),
    (err: unknown) => err instanceof Error && err.message === "test-abort-after-session",
  );
  resetProfileLockSeamForTests();

  const profile = await prisma.creatorProfile.findUnique({ where: { id: profileId } });
  assert.equal(profile?.sessionJson, "{}");
  assert.equal(profile?.currentRevisionId, seeded.revisionId);
  assert.equal(await prisma.profileRevision.count({ where: { profileId } }), 1);
  const old = await prisma.profileRevision.findUnique({ where: { id: seeded.revisionId } });
  assert.equal(old?.payloadJson, seeded.payloadJson);
  const processing = await prisma.dialogueMessage.findUnique({ where: { id: seeded.processingId } });
  const call = await prisma.aiCall.findUnique({ where: { id: seeded.callId } });
  assert.equal(processing?.status, "pending");
  assert.equal(processing?.kind, "processing");
  assert.equal(call?.status, "running");
  assert.equal(call?.resultJson, null);
});
