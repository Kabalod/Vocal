import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { emptyThoughtUpdate } from "../src/lib/agent-action";
import { ownerUserId } from "../src/lib/auth/session";
import { DialogueError, ensureReelThread, runDialogueTurn, sendDialogueMessage } from "../src/lib/dialogue";
import { createThoughtFromText } from "../src/lib/thought-create";
import { getThoughtState } from "../src/lib/thought-state";
import { StateVersionError } from "../src/lib/ai/usage-guard";
import { v03TestSeams } from "../src/lib/v03-test-seams";
import { commitDialogueReply, readMaterialSnapshot } from "../src/lib/working-take";
import { askQuestionJson, thoughtUpdateForUserText } from "./helpers/agent-action-json";
import {
  C00_ENVELOPE_SCHEMA,
  C00EnvelopeError,
  isC00Envelope,
  listC00Envelopes,
  parseC00Envelope,
  readThoughtAction,
  thoughtDialogueTurnKey,
} from "../src/lib/c00-envelope";

test("old V03 resultJson is an action, not a C00 event", () => {
  const legacy = JSON.stringify({
    action: "ask_question",
    question: "Что главное?",
    whyUnknown: "ещё не сказано",
  });
  assert.equal(isC00Envelope(legacy), false);
  assert.equal(listC00Envelopes([{ resultJson: legacy }]).length, 0);
  assert.equal(readThoughtAction(legacy)?.action, "ask_question");
});

test("completed turn writes one c00-envelope-1 and repeat keeps it", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "C00 envelope",
    body: "Материал для конверта.",
    idempotencyKey: "c00-env-create",
  });
  await sendDialogueMessage(reel.id, { text: "уточни мысль", idempotencyKey: "c00-env-1" }, async () => ({
    text: askQuestionJson("Что главное в этой мысли?"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const first = await prisma.aiCall.findFirstOrThrow({ where: { reelId: reel.id, kind: "dialogue" } });
  const envelope = parseC00Envelope(first.resultJson);
  assert.ok(envelope);
  assert.equal(envelope.schemaVersion, C00_ENVELOPE_SCHEMA);
  assert.equal(envelope.aiCallId, first.id);
  assert.equal(envelope.turnKey, first.turnKey);
  assert.equal(envelope.ownerUserId, first.ownerUserId);
  assert.equal(envelope.reelId, reel.id);
  assert.equal(envelope.action.action, "ask_question");
  assert.equal(envelope.decision, null);
  assert.equal(envelope.correction, null);
  assert.equal(first.status, "done");

  await sendDialogueMessage(reel.id, { text: "уточни мысль", idempotencyKey: "c00-env-1" }, async () => ({
    text: askQuestionJson("не должен"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  assert.equal(await prisma.aiCall.count({ where: { reelId: reel.id, kind: "dialogue" } }), 1);
  const again = await prisma.aiCall.findUniqueOrThrow({ where: { id: first.id } });
  assert.equal(again.resultJson, first.resultJson);
  assert.equal(listC00Envelopes([again]).length, 1);
});

test("conflicting keys do not write a second envelope on the losing call", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    v03TestSeams.beforeCommitDialogueReply = null;
  });
  const { reel } = await createThoughtFromText({
    title: "C00 key conflict",
    body: "Материал для двух ключей.",
    idempotencyKey: "c00-conflict-create",
  });
  let releaseFirst: (() => void) | undefined;
  const firstHeld = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstAtCommit: (() => void) | undefined;
  const sawFirstCommit = new Promise<void>((resolve) => {
    firstAtCommit = resolve;
  });
  let secondAtCommit: (() => void) | undefined;
  const sawSecondCommit = new Promise<void>((resolve) => {
    secondAtCommit = resolve;
  });
  let releaseSecond: (() => void) | undefined;
  const secondHeld = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  let commits = 0;
  v03TestSeams.beforeCommitDialogueReply = async () => {
    commits += 1;
    if (commits === 1) {
      firstAtCommit?.();
      await firstHeld;
      return;
    }
    secondAtCommit?.();
    await secondHeld;
  };
  const first = runDialogueTurn(reel.id, { text: "Ответ хода A про вечер.", idempotencyKey: "c00-win" }, async () => {
    const update = await thoughtUpdateForUserText(prisma, reel.id, "Ответ хода A про вечер.");
    return { text: askQuestionJson("вопрос победителя", update), usage: { promptTokens: 1, completionTokens: 1 } };
  });
  await sawFirstCommit;
  const second = runDialogueTurn(reel.id, { text: "Ответ хода B про утро.", idempotencyKey: "c00-lose" }, async () => {
    const update = await thoughtUpdateForUserText(prisma, reel.id, "Ответ хода B про утро.");
    return { text: askQuestionJson("вопрос проигравшего", update), usage: { promptTokens: 1, completionTokens: 1 } };
  });
  await sawSecondCommit;
  releaseSecond?.();
  await second;
  releaseFirst?.();
  await assert.rejects(() => first, (error: unknown) => error instanceof StateVersionError || error instanceof DialogueError);
  v03TestSeams.beforeCommitDialogueReply = null;
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId: reel.id } });
  const calls = await prisma.aiCall.findMany({ where: { reelId: reel.id, kind: "dialogue" } });
  const envelopes = listC00Envelopes(calls);
  assert.equal(envelopes.length, 1);
  assert.equal(envelopes[0]?.turnKey, thoughtDialogueTurnKey(thread.id, "c00-lose"));
  const loser = calls.find((row) => row.turnKey === thoughtDialogueTurnKey(thread.id, "c00-win"));
  assert.ok(loser);
  assert.equal(isC00Envelope(loser.resultJson), false);
  assert.notEqual(loser.status, "done");
});

test("failed commit does not leave a done envelope or done processing", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    v03TestSeams.afterThoughtBeforeEnvelope = null;
  });
  const { reel } = await createThoughtFromText({
    title: "C00 partial",
    body: "Материал для обрыва записи.",
    idempotencyKey: "c00-partial-create",
  });
  const before = await getThoughtState(reel.id);
  v03TestSeams.afterThoughtBeforeEnvelope = async () => {
    throw new StateVersionError();
  };
  await assert.rejects(
    () =>
      runDialogueTurn(reel.id, { text: "уточни мысль", idempotencyKey: "c00-partial-1" }, async () => ({
        text: askQuestionJson("не должен сохраниться как done"),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    (error: unknown) => error instanceof StateVersionError,
  );
  v03TestSeams.afterThoughtBeforeEnvelope = null;
  const after = await getThoughtState(reel.id);
  assert.equal(after.revision, before.revision);
  const call = await prisma.aiCall.findFirst({ where: { reelId: reel.id, kind: "dialogue" } });
  if (call) {
    assert.equal(isC00Envelope(call.resultJson), false);
    assert.notEqual(call.status, "done");
  }
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId: reel.id } });
  const processing = await prisma.dialogueMessage.findMany({
    where: { threadId: thread.id, role: "assistant" },
  });
  assert.equal(processing.some((row) => row.status === "done" && (row.kind === "question" || row.kind === "text")), false);
});

test("saved response is restored without an active lease", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    v03TestSeams.afterClaimBeforeComplete = null;
  });
  const { reel } = await createThoughtFromText({
    title: "C00 restore lease",
    body: "Материал для восстановления ответа.",
    idempotencyKey: "c00-restore-create",
  });
  const saved = askQuestionJson("сохранённый ответ без lease");
  v03TestSeams.afterClaimBeforeComplete = async ({ callId }) => {
    await prisma.aiCall.update({
      where: { id: callId },
      data: { responseText: saved },
    });
    throw new Error("stop before complete");
  };
  await runDialogueTurn(reel.id, { text: "уточни мысль", idempotencyKey: "c00-restore-1" }, async () => ({
    text: askQuestionJson("не должен"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  v03TestSeams.afterClaimBeforeComplete = null;
  const interrupted = await prisma.aiCall.findFirstOrThrow({ where: { reelId: reel.id, kind: "dialogue" } });
  await prisma.aiCall.update({
    where: { id: interrupted.id },
    data: { execOwnerId: null, execLeaseUntil: null },
  });
  let completeCalls = 0;
  await runDialogueTurn(reel.id, { text: "уточни мысль", idempotencyKey: "c00-restore-1" }, async () => {
    completeCalls += 1;
    return { text: askQuestionJson("не должен"), usage: { promptTokens: 1, completionTokens: 1 } };
  });
  assert.equal(completeCalls, 0);
  const restored = await prisma.aiCall.findUniqueOrThrow({ where: { id: interrupted.id } });
  assert.equal(restored.responseText, saved);
  assert.equal(restored.status, "done");
  assert.equal(restored.execOwnerId, null);
  const envelope = parseC00Envelope(restored.resultJson);
  assert.ok(envelope);
  assert.equal(envelope.action.action, "ask_question");
  if (envelope.action.action === "ask_question") {
    assert.equal(envelope.action.question, "сохранённый ответ без lease");
  }
});

test("legacy resultJson action wins over a mismatched resume action", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "C00 legacy mismatch",
    body: "Материал для старого resultJson.",
    idempotencyKey: "c00-legacy-mis-create",
  });
  const thread = await ensureReelThread(reel.id);
  const storedAction = {
    action: "ask_question" as const,
    question: "Что главное?",
    clarificationReason: "нужно уточнение задачи",
    whyUnknown: "ещё не сказано",
  };
  const responseText = askQuestionJson("Что главное?");
  const user = await prisma.dialogueMessage.create({
    data: {
      threadId: thread.id,
      role: "user",
      kind: "text",
      body: "уточни мысль",
      payloadJson: "{}",
      status: "done",
      idempotencyKey: "c00-legacy-mis-1",
    },
  });
  const processing = await prisma.dialogueMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      kind: "processing",
      body: "Разбираю вашу мысль…",
      status: "pending",
      claimKey: `dialogue-turn:${thread.id}:c00-legacy-mis-1`,
      idempotencyKey: "assistant:c00-legacy-mis-1",
      payloadJson: JSON.stringify({ userMessageId: user.id, idempotencyKey: "c00-legacy-mis-1" }),
    },
  });
  const call = await prisma.aiCall.create({
    data: {
      kind: "dialogue",
      reelId: reel.id,
      model: "test",
      status: "done",
      ownerUserId: ownerUserId(),
      turnKey: thoughtDialogueTurnKey(thread.id, "c00-legacy-mis-1"),
      promptText: "",
      inputSnapshotJson: JSON.stringify({ userMessageId: user.id, processingId: processing.id }),
      responseText,
      resultJson: JSON.stringify(storedAction),
    },
  });
  const snapshot = await readMaterialSnapshot(reel.id, thread.id);
  await assert.rejects(
    () =>
      commitDialogueReply({
        reelId: reel.id,
        threadId: thread.id,
        snapshot,
        callId: call.id,
        processingId: processing.id,
        userMessageId: user.id,
        turnKey: "c00-legacy-mis-1",
        action: { action: "redirect_to_task", currentTask: "вернитесь к мысли" },
        thoughtUpdate: emptyThoughtUpdate(),
        rawText: responseText,
        promptTokens: 1,
        completionTokens: 1,
      }),
    (error: unknown) => error instanceof C00EnvelopeError && error.code === "C00_ACTION_MISMATCH",
  );
  const afterCall = await prisma.aiCall.findUniqueOrThrow({ where: { id: call.id } });
  assert.equal(afterCall.resultJson, JSON.stringify(storedAction));
  assert.equal(isC00Envelope(afterCall.resultJson), false);
  assert.equal(readThoughtAction(afterCall.resultJson)?.action, "ask_question");
  const afterProcessing = await prisma.dialogueMessage.findUniqueOrThrow({ where: { id: processing.id } });
  assert.equal(afterProcessing.status, "pending");
  assert.equal(afterProcessing.kind, "processing");
});
