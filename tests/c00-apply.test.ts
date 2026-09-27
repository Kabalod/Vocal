import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { DialogueError, runDialogueTurn, sendDialogueMessage } from "../src/lib/dialogue";
import { createThoughtFromText } from "../src/lib/thought-create";
import { applyThoughtState, getThoughtState } from "../src/lib/thought-state";
import { StateVersionError } from "../src/lib/ai/usage-guard";
import { v03TestSeams } from "../src/lib/v03-test-seams";
import { listAcceptedC00Corrections, parseC00Envelope } from "../src/lib/c00-envelope";
import { listScriptWorkspace, replaceScriptDraft } from "../src/lib/scripts";
import { listReelQuestions } from "../src/lib/ai/questions";
import { isOpenQuestionStale } from "../src/lib/c00-stale";
import { ensureOriginalFromText } from "../src/lib/transcripts";
import { askQuestionJson, c00SignalFor, thoughtUpdateForUserText } from "./helpers/agent-action-json";

test("open question is stale when review transcript id remains and working take clears selection", () => {
  const createdAt = new Date("2026-09-27T08:00:00.000Z");
  assert.equal(
    isOpenQuestionStale({
      status: "open",
      createdAt,
      reviewTranscriptRevisionId: "rev_old",
      selectedTranscriptId: "rev_old",
      roundThoughtStateRevision: null,
      thoughtRevision: 0,
      correctionAcceptedAt: [],
    }),
    false,
  );
  assert.equal(
    isOpenQuestionStale({
      status: "open",
      createdAt,
      reviewTranscriptRevisionId: "rev_old",
      selectedTranscriptId: null,
      roundThoughtStateRevision: null,
      thoughtRevision: 0,
      correctionAcceptedAt: [],
    }),
    true,
  );
});

async function completeWrongSpeaker(
  prisma: Awaited<ReturnType<typeof withPostgresTestDb>>["prisma"],
  reelId: string,
  text: string,
) {
  const user = await prisma.dialogueMessage.findFirst({
    where: { thread: { reelId }, role: "user", body: text },
    orderBy: { createdAt: "desc" },
  });
  if (!user) {
    return { text: askQuestionJson("Что ваше?"), usage: { promptTokens: 1, completionTokens: 1 } };
  }
  const state = await getThoughtState(reelId);
  return {
    text: askQuestionJson(
      "Что ваше?",
      undefined,
      c00SignalFor("wrong_speaker", "correct_thought", user.id, state.revision),
    ),
    usage: { promptTokens: 1, completionTokens: 1 },
  };
}

test("local correction changes one slot and marks bound draft and open question stale", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "C00-03 local",
    body: "Мысль со слотом.",
    idempotencyKey: "c00-03-local-create",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [{ id: "fact_seed", text: "Чужая реплика как факт.", sourceType: "initial_note", sourceId: reel.id }],
    },
  });
  const take = await prisma.take.findFirstOrThrow({ where: { reelId: reel.id } });
  await prisma.reel.update({ where: { id: reel.id }, data: { finalTakeId: take.id } });
  const version = await prisma.scriptVersion.create({
    data: {
      reelId: reel.id,
      kind: "manual",
      body: "Черновик до правки.",
      inputSnapshotJson: JSON.stringify({ thoughtStateRevision: 1, workingTakeId: take.id }),
    },
  });
  await replaceScriptDraft(reel.id, { body: "Черновик до правки.", baseVersionId: version.id, sourceKind: "manual" });
  const round = await prisma.aiCall.create({
    data: {
      kind: "questions",
      reelId: reel.id,
      ownerUserId: "local",
      model: "test",
      status: "done",
      promptText: "q",
      inputSnapshotJson: JSON.stringify({ thoughtStateRevision: 1 }),
    },
  });
  await prisma.question.create({
    data: { reelId: reel.id, roundId: round.id, text: "Открытый вопрос", status: "open", sortOrder: 0 },
  });
  const before = await getThoughtState(reel.id);
  await sendDialogueMessage(
    reel.id,
    { text: "Это сказал оператор, не я.", idempotencyKey: "c00-03-local-1" },
    () => completeWrongSpeaker(prisma, reel.id, "Это сказал оператор, не я."),
  );
  const after = await getThoughtState(reel.id);
  assert.equal(after.facts.length, 0);
  assert.equal(after.revision, before.revision + 1);
  const workspace = await listScriptWorkspace(reel.id);
  assert.equal(workspace.draft?.stale, true);
  const questions = await listReelQuestions(reel.id);
  assert.equal(questions[0]?.status, "open");
  assert.equal(questions[0]?.stale, true);
  const reelAfter = await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } });
  assert.equal(reelAfter.finalTakeId, take.id);
  assert.equal(await prisma.profileRevision.count(), 0);
});

test("draft saved after AiCall create and before accept is stale by acceptedAt", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    v03TestSeams.beforeCommitDialogueReply = null;
  });
  const { reel } = await createThoughtFromText({
    title: "C00-03 4a",
    body: "Мысль для окна create/accept.",
    idempotencyKey: "c00-03-4a-create",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [{ id: "fact_seed", text: "Слот для правки.", sourceType: "initial_note", sourceId: reel.id }],
    },
  });
  v03TestSeams.beforeCommitDialogueReply = async () => {
    await replaceScriptDraft(reel.id, { body: "Сохранён после create AiCall.", sourceKind: "manual" });
    await delay(15);
  };
  await sendDialogueMessage(
    reel.id,
    { text: "Это сказал оператор, не я.", idempotencyKey: "c00-03-4a-1" },
    () => completeWrongSpeaker(prisma, reel.id, "Это сказал оператор, не я."),
  );
  v03TestSeams.beforeCommitDialogueReply = null;
  const call = await prisma.aiCall.findFirstOrThrow({ where: { reelId: reel.id, kind: "dialogue" } });
  const envelope = parseC00Envelope(call.resultJson);
  const draft = await prisma.scriptDraft.findUniqueOrThrow({ where: { reelId: reel.id } });
  assert.ok(envelope?.correction?.acceptedAt);
  const acceptedAt = new Date(envelope.correction.acceptedAt);
  assert.ok(acceptedAt.getTime() > draft.updatedAt.getTime());
  assert.ok(draft.updatedAt.getTime() >= call.createdAt.getTime());
  const workspace = await listScriptWorkspace(reel.id);
  assert.equal(workspace.draft?.stale, true);
});

test("losing CAS turn does not apply a second correct_thought", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    v03TestSeams.beforeCommitDialogueReply = null;
  });
  const { reel } = await createThoughtFromText({
    title: "C00-03 cas",
    body: "Мысль для гонки apply.",
    idempotencyKey: "c00-03-cas-create",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [{ id: "fact_seed", text: "Один слот.", sourceType: "initial_note", sourceId: reel.id }],
    },
  });
  let releaseFirst: (() => void) | undefined;
  const firstHeld = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let firstAtCommit: (() => void) | undefined;
  const sawFirst = new Promise<void>((resolve) => {
    firstAtCommit = resolve;
  });
  let secondAtCommit: (() => void) | undefined;
  const sawSecond = new Promise<void>((resolve) => {
    secondAtCommit = resolve;
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
  };
  const first = runDialogueTurn(
    reel.id,
    { text: "Это сказал оператор, не я.", idempotencyKey: "c00-03-cas-a" },
    () => completeWrongSpeaker(prisma, reel.id, "Это сказал оператор, не я."),
  );
  await sawFirst;
  const second = runDialogueTurn(
    reel.id,
    { text: "Я этого не говорил и это неправда.", idempotencyKey: "c00-03-cas-b" },
    async () => {
      const user = await prisma.dialogueMessage.findFirstOrThrow({
        where: { thread: { reelId: reel.id }, role: "user", body: "Я этого не говорил и это неправда." },
        orderBy: { createdAt: "desc" },
      });
      const state = await getThoughtState(reel.id);
      return {
        text: askQuestionJson(
          "Что верно?",
          undefined,
          c00SignalFor("author_negation", "correct_thought", user.id, state.revision),
        ),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );
  await sawSecond;
  await second;
  releaseFirst?.();
  await assert.rejects(() => first, (error: unknown) => error instanceof StateVersionError || error instanceof DialogueError);
  v03TestSeams.beforeCommitDialogueReply = null;
  const rows = await prisma.aiCall.findMany({ where: { reelId: reel.id, kind: "dialogue" } });
  const corrections = listAcceptedC00Corrections(rows);
  assert.equal(corrections.length, 1);
  const state = await getThoughtState(reel.id);
  assert.equal(state.revision, 2);
  assert.equal(state.facts.length, 0);
});

test("supersede rewrites fact source to the current author message", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "C00-03 supersede source",
    body: "Исходная заметка.",
    idempotencyKey: "c00-03-sup-create",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [{ id: "fact_seed", text: "Старая формулировка из заметки.", sourceType: "initial_note", sourceId: reel.id }],
    },
  });
  const text = "Правильнее так: это моя формулировка.";
  await sendDialogueMessage(reel.id, { text, idempotencyKey: "c00-03-sup-1" }, async () => {
    const update = await thoughtUpdateForUserText(prisma, reel.id, text);
    const state = await getThoughtState(reel.id);
    return {
      text: askQuestionJson(
        "Что ещё уточнить?",
        update,
        c00SignalFor("local_correction", "correct_thought", update.userMessageId, state.revision, {
          targetKind: "fact",
          targetId: "fact_seed",
          operation: "supersede",
        }),
      ),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  });
  const after = await getThoughtState(reel.id);
  const fact = after.facts.find((item) => item.id === "fact_seed");
  assert.ok(fact);
  assert.equal(fact.text, text);
  assert.equal(fact.sourceType, "dialogue_message");
  const user = await prisma.dialogueMessage.findFirstOrThrow({
    where: { thread: { reelId: reel.id }, role: "user", body: text },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(fact.sourceId, user.id);
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId: reel.id } });
  assert.equal(user.threadId, thread.id);
  const envelope = parseC00Envelope(
    (await prisma.aiCall.findFirstOrThrow({ where: { reelId: reel.id, kind: "dialogue" } })).resultJson,
  );
  assert.equal(envelope?.correction?.operation, "supersede");
  assert.equal(envelope?.correction?.targetId, "fact_seed");
});

test("open question becomes stale when working take loses selected transcript", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "C00-03 q stale",
    body: "Мысль с расшифровкой.",
    idempotencyKey: "c00-03-q-stale-create",
  });
  const take = await prisma.take.findFirstOrThrow({ where: { reelId: reel.id } });
  const revision = await ensureOriginalFromText(take.id, "Произнесённый текст дубля.");
  await prisma.take.update({ where: { id: take.id }, data: { selectedTranscriptId: revision.id } });
  const review = await prisma.review.create({
    data: {
      reelId: reel.id,
      takeId: take.id,
      transcriptRevisionId: revision.id,
      status: "done",
    },
  });
  const round = await prisma.aiCall.create({
    data: {
      kind: "questions",
      reelId: reel.id,
      ownerUserId: "local",
      model: "test",
      status: "done",
      promptText: "q",
      inputSnapshotJson: JSON.stringify({}),
    },
  });
  await prisma.question.create({
    data: {
      reelId: reel.id,
      reviewId: review.id,
      roundId: round.id,
      text: "Вопрос по расшифровке",
      status: "open",
      sortOrder: 0,
    },
  });
  const fresh = await listReelQuestions(reel.id);
  assert.equal(fresh[0]?.stale, false);
  await prisma.take.update({ where: { id: take.id }, data: { selectedTranscriptId: null } });
  const stale = await listReelQuestions(reel.id);
  assert.equal(stale[0]?.status, "open");
  assert.equal(stale[0]?.stale, true);
});
