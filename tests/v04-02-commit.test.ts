import assert from "node:assert/strict";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { LLM_MODEL } from "../src/lib/config";
import { PROFILE_DIALOGUE_KIND } from "../src/lib/ai/profile";
import { ownerUserId, portraitProfileId } from "../src/lib/auth/session";
import { parseV04ModelReply } from "../src/lib/v04-action";
import { commitV04ProfileTurn, parseV04ResultEnvelope } from "../src/lib/v04-commit";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

function applyUpdateJson(evidenceMessageIds: string[]) {
  return JSON.stringify({
    kind: "apply_update",
    category: "blog_goal",
    value: "говорить своими словами",
    scope: "global",
    evidenceType: "explicit_statement",
    evidenceMessageIds,
    confidence: 0.4,
    operation: "replace_explicit",
  });
}

test("V04-02 writes event atomically, rejects bad sources, and does not revise unchanged slice", async (t) => {
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

  const afterApply = await sendProfileMessage(
    { text: "Хочу говорить своими словами.", idempotencyKey: "v04-02-apply" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return { text: applyUpdateJson([user.id]), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );
  assert.equal(afterApply.dialogue.messages.at(-1)?.kind, "text");

  const doneCall = await prisma.aiCall.findFirst({
    where: { kind: PROFILE_DIALOGUE_KIND, status: "done" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(doneCall?.resultJson);
  const envelope = parseV04ResultEnvelope(doneCall.resultJson);
  assert.equal(envelope?.schemaVersion, "v04-event-1");
  assert.equal(envelope?.event?.kind, "apply_update");
  assert.equal(envelope?.event?.confidence, 0.4);
  assert.equal(envelope?.event?.applyResult.newRevisionId, null);
  assert.equal(envelope?.event?.applyResult.displaySliceChanged, false);
  assert.equal(doneCall.responseText.includes("apply_update"), true);
  assert.equal(
    await prisma.profileRevision.count({ where: { profileId: portraitProfileId() } }),
    revisionsBefore,
  );

  const again = await sendProfileMessage(
    { text: "Хочу говорить своими словами.", idempotencyKey: "v04-02-apply" },
    async () => {
      throw new Error("model must not run on the same idempotency key");
    },
  );
  assert.equal((await prisma.aiCall.count({ where: { kind: PROFILE_DIALOGUE_KIND, status: "done" } })), 1);
  assert.equal(again.dialogue.messages.filter((item) => item.role === "user").length, 1);

  const afterNoChange = await sendProfileMessage(
    { text: "Спасибо, это приятно слышать.", idempotencyKey: "v04-02-no-change" },
    async () => ({
      text: JSON.stringify({ kind: "no_change", reasonCode: "praise_or_support" }),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  assert.match(afterNoChange.dialogue.messages.at(-1)?.body ?? "", /не записываю/);
  const noChangeCall = await prisma.aiCall.findFirst({
    where: { kind: PROFILE_DIALOGUE_KIND, status: "done" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(parseV04ResultEnvelope(noChangeCall?.resultJson)?.event, null);

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
      text: applyUpdateJson([assistantId]),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  assert.equal(afterBadSource.dialogue.messages.at(-1)?.kind, "error");
  const failedCall = await prisma.aiCall.findFirst({
    where: { kind: PROFILE_DIALOGUE_KIND, status: "error" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(failedCall);
  assert.equal(failedCall.resultJson, null);
  assert.equal(failedCall.status, "error");

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
  const action = parseV04ModelReply(JSON.parse(applyUpdateJson([user.id])) as unknown);
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
        rawText: applyUpdateJson([user.id]),
        promptTokens: 1,
        completionTokens: 1,
      }),
  );
  const rolled = await prisma.aiCall.findUnique({ where: { id: hangingCall.id } });
  assert.equal(rolled?.status, "running");
  assert.equal(rolled?.resultJson, null);
  const stillPending = await prisma.dialogueMessage.findUnique({ where: { id: processing.id } });
  assert.equal(stillPending?.status, "pending");
  assert.equal(stillPending?.kind, "processing");
});
