import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { aiOperationKey, resetAiInflightForTests, StateVersionError, withAiInflight } from "../src/lib/ai/usage-guard";
import { runWithOwner } from "../src/lib/auth/session";
import { createReel, createTake, getReel, updateReel, ReelError } from "../src/lib/reels";
import { createThoughtFromText } from "../src/lib/thought-create";
import { createEditedRevision, ensureOriginalFromText, listTranscriptBundle } from "../src/lib/transcripts";
import { v01TestSeams } from "../src/lib/v01-test-seams";
import { PrismaClient } from "@prisma/client";
import { askQuestionJson } from "./helpers/agent-action-json";

test("working take is the third take by id, not the first two", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();

  const reel = await createReel({ title: "Три дубля" });
  const take1 = await createTake(reel.id, { inputType: "text", bodyText: "FIRST_TAKE_MARKER" });
  const take2 = await createTake(reel.id, { inputType: "text", bodyText: "SECOND_TAKE_MARKER" });
  const take3 = await createTake(reel.id, { inputType: "text", bodyText: "THIRD_TAKE_MARKER" });
  await ensureOriginalFromText(take1.id, "FIRST_TAKE_MARKER");
  await ensureOriginalFromText(take2.id, "SECOND_TAKE_MARKER");
  await ensureOriginalFromText(take3.id, "THIRD_TAKE_MARKER");
  const bundle3 = await listTranscriptBundle(take3.id);

  const afterFirst = await getReel(reel.id);
  assert.equal(afterFirst?.workingTakeId, take1.id);

  await prisma.reel.update({
    where: { id: reel.id },
    data: { workingTakeId: take3.id, selectedTakeId: take1.id },
  });

  const { buildThoughtMaterialContext } = await import("../src/lib/dialogue");
  const prompt = await buildThoughtMaterialContext(reel.id);
  assert.match(prompt, /THIRD_TAKE_MARKER/);
  assert.match(prompt, new RegExp(`Рабочий дубль: ${take3.id}`));
  assert.match(prompt, new RegExp(`Ревизия: ${bundle3.selectedId}`));
  assert.equal(prompt.includes("FIRST_TAKE_MARKER"), false);
  assert.equal(prompt.includes("SECOND_TAKE_MARKER"), false);
});

test("thought create stores workingTakeId", async (t) => {
  await withPostgresTestDb(t);
  const { reel } = await createThoughtFromText({
    title: "Создание",
    body: "Текст мысли для рабочего дубля.",
    idempotencyKey: "v01-create-working",
  });
  assert.ok(reel.workingTakeId);
  assert.equal(reel.takes[0]?.id, reel.workingTakeId);
});

test("inflight key isolates owners; same op shares one model call", async () => {
  const keyA = aiOperationKey({
    ownerUserId: "user-a",
    objectType: "thought",
    objectId: "reel-1",
    operationType: "dialogue",
    idempotencyKey: "same-key",
  });
  const keyB = aiOperationKey({
    ownerUserId: "user-b",
    objectType: "thought",
    objectId: "reel-1",
    operationType: "dialogue",
    idempotencyKey: "same-key",
  });
  assert.notEqual(keyA, keyB);

  resetAiInflightForTests();
  let runs = 0;
  const slow = async () => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return runs;
  };
  const [first, second] = await Promise.all([withAiInflight(keyA, slow), withAiInflight(keyA, slow)]);
  assert.equal(first, 1);
  assert.equal(second, 1);
  assert.equal(runs, 1);
  await withAiInflight(keyB, slow);
  assert.equal(runs, 2);
  resetAiInflightForTests();
});

test("dialogue 409 on stale expectedUpdatedAt; same send is one model call", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(() => resetAiInflightForTests());

  const { reel } = await createThoughtFromText({
    title: "Версия",
    body: "Исходный текст для конфликта версии.",
    idempotencyKey: "v01-stale-thought",
  });
  const stale = reel.updatedAt;
  await prisma.reel.update({ where: { id: reel.id }, data: { title: "Уже другое название" } });

  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  let completeCalls = 0;
  const complete = async () => {
    completeCalls += 1;
    return {
      text: askQuestionJson("ок"),
      usage: { promptTokens: 2, completionTokens: 2 },
    };
  };

  await assert.rejects(
    () =>
      sendDialogueMessage(
        reel.id,
        { text: "после смены", idempotencyKey: "v01-stale", expectedUpdatedAt: stale },
        complete,
      ),
    (error: unknown) => error instanceof StateVersionError && error.status === 409,
  );
  assert.equal(completeCalls, 0);

  const fresh = await getReel(reel.id);
  const [a, b] = await Promise.all([
    sendDialogueMessage(
      reel.id,
      { text: "актуально", idempotencyKey: "v01-dedupe", expectedUpdatedAt: fresh?.updatedAt },
      complete,
    ),
    sendDialogueMessage(
      reel.id,
      { text: "актуально", idempotencyKey: "v01-dedupe", expectedUpdatedAt: fresh?.updatedAt },
      complete,
    ),
  ]);
  assert.equal(completeCalls, 1);
  assert.equal(a.messages.at(-1)?.id, b.messages.at(-1)?.id);
});

test("daily budget is counted per owner", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();

  await prisma.aiCall.create({
    data: {
      kind: "dialogue",
      model: "test",
      status: "done",
      promptText: "other",
      inputSnapshotJson: "{}",
      promptTokens: 80,
      completionTokens: 20,
      ownerUserId: "other-owner",
    },
  });

  process.env.VOCAL_DAILY_TOKEN_LIMIT = "10";
  t.after(() => {
    delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  });

  const { reel } = await createThoughtFromText({
    title: "Бюджет",
    body: "Свой владелец не должен упереться в чужие токены.",
    idempotencyKey: "v01-budget-owner",
  });
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const page = await sendDialogueMessage(
    reel.id,
    { text: "свой запрос", idempotencyKey: "v01-budget-ok" },
    async () => ({
      text: askQuestionJson("свой ответ"),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  assert.ok(page.messages.some((item) => item.body === "свой ответ"));

  await runWithOwner({ id: "other-owner", email: "other@vocal.local" }, async () => {
    const { assertDailyTokenBudget, AiBudgetError } = await import("../src/lib/ai/usage-guard");
    await assert.rejects(() => assertDailyTokenBudget(), (error: unknown) => error instanceof AiBudgetError);
  });
});

test("stale working take, revision, or dialogue during AI is not saved", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(() => resetAiInflightForTests());

  const { sendDialogueMessage, listDialoguePage } = await import("../src/lib/dialogue");
  const staleReply = "STALE_MODEL_REPLY_MUST_NOT_PERSIST";

  async function thought(key: string) {
    return createThoughtFromText({
      title: key,
      body: `Исходный текст ${key}`,
      idempotencyKey: key,
    });
  }

  const working = await thought("v01-mid-working");
  const take2 = await createTake(working.reel.id, { inputType: "text", bodyText: "второй дубль" });
  await assert.rejects(
    () =>
      sendDialogueMessage(
        working.reel.id,
        { text: "во время смены дубля", idempotencyKey: "v01-mid-working-send" },
        async () => {
          await prisma.reel.update({
            where: { id: working.reel.id },
            data: { workingTakeId: take2.id },
          });
          return {
            text: askQuestionJson(staleReply),
            usage: { promptTokens: 1, completionTokens: 1 },
          };
        },
      ),
    (error: unknown) => error instanceof StateVersionError && error.status === 409,
  );
  const afterWorking = await listDialoguePage(working.reel.id);
  assert.equal(afterWorking.messages.some((item) => item.body === staleReply), false);
  assert.ok(afterWorking.messages.some((item) => item.kind === "error"));

  const revision = await thought("v01-mid-revision");
  const takeId = revision.reel.workingTakeId;
  assert.ok(takeId);
  await assert.rejects(
    () =>
      sendDialogueMessage(
        revision.reel.id,
        { text: "во время смены ревизии", idempotencyKey: "v01-mid-revision-send" },
        async () => {
          await createEditedRevision(takeId, "новая выбранная ревизия UNIQUE_REV");
          return {
            text: askQuestionJson(staleReply),
            usage: { promptTokens: 1, completionTokens: 1 },
          };
        },
      ),
    (error: unknown) => error instanceof StateVersionError,
  );
  assert.equal((await listDialoguePage(revision.reel.id)).messages.some((item) => item.body === staleReply), false);

  const dialogue = await thought("v01-mid-dialogue");
  await assert.rejects(
    () =>
      sendDialogueMessage(
        dialogue.reel.id,
        { text: "во время чужого сообщения", idempotencyKey: "v01-mid-dialogue-send" },
        async () => {
          const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId: dialogue.reel.id } });
          await prisma.dialogueMessage.create({
            data: {
              threadId: thread.id,
              role: "user",
              kind: "text",
              body: "параллельное сообщение",
              status: "done",
            },
          });
          return {
            text: askQuestionJson(staleReply),
            usage: { promptTokens: 1, completionTokens: 1 },
          };
        },
      ),
    (error: unknown) => error instanceof StateVersionError,
  );
  assert.equal((await listDialoguePage(dialogue.reel.id)).messages.some((item) => item.body === staleReply), false);
});

test("same idempotency key on two thoughts does not share a model call", async (t) => {
  await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  resetAiInflightForTests();
  t.after(() => resetAiInflightForTests());

  const first = await createThoughtFromText({
    title: "Мысль 1",
    body: "текст одной мысли",
    idempotencyKey: "v01-two-thoughts-a",
  });
  const second = await createThoughtFromText({
    title: "Мысль 2",
    body: "текст другой мысли",
    idempotencyKey: "v01-two-thoughts-b",
  });
  const { getProfile } = await import("../src/lib/profile");
  await getProfile();
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  let completeCalls = 0;
  const complete = async () => {
    completeCalls += 1;
    return {
      text: askQuestionJson(`ответ ${completeCalls}`),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  };
  await Promise.all([
    sendDialogueMessage(first.reel.id, { text: "один", idempotencyKey: "shared-key" }, complete),
    sendDialogueMessage(second.reel.id, { text: "два", idempotencyKey: "shared-key" }, complete),
  ]);
  assert.equal(completeCalls, 2);
});

test("inflight key is released after a model error", async () => {
  resetAiInflightForTests();
  let runs = 0;
  await assert.rejects(
    () =>
      withAiInflight("thought:err", async () => {
        runs += 1;
        throw new Error("boom");
      }),
    /boom/,
  );
  const again = await withAiInflight("thought:err", async () => {
    runs += 1;
    return "ok";
  });
  assert.equal(again, "ok");
  assert.equal(runs, 2);
  resetAiInflightForTests();
});

test("switching working take does not change finalTakeId", async (t) => {
  await withPostgresTestDb(t);
  const reel = await createReel({ title: "Итог отдельно" });
  const take1 = await createTake(reel.id, { inputType: "text", bodyText: "первый" });
  const take2 = await createTake(reel.id, { inputType: "text", bodyText: "второй" });
  await updateReel(reel.id, { finalTakeId: take1.id });
  const after = await updateReel(reel.id, { workingTakeId: take2.id });
  assert.equal(after.workingTakeId, take2.id);
  assert.equal(after.finalTakeId, take1.id);
});

test("API accepts own working take and rejects a take from another thought", async (t) => {
  await withPostgresTestDb(t);
  const { PATCH } = await import("../src/app/api/reels/[id]/route");
  const reelA = await createReel({ title: "A" });
  const reelB = await createReel({ title: "B" });
  const takeA1 = await createTake(reelA.id, { inputType: "text", bodyText: "A1" });
  const takeA2 = await createTake(reelA.id, { inputType: "text", bodyText: "A2" });
  const takeB = await createTake(reelB.id, { inputType: "text", bodyText: "B1" });

  const ok = await PATCH(
    new Request(`http://vocal.local/api/reels/${reelA.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingTakeId: takeA2.id }),
    }),
    { params: Promise.resolve({ id: reelA.id }) },
  );
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).reel.workingTakeId, takeA2.id);
  assert.equal((await getReel(reelA.id))?.workingTakeId, takeA2.id);
  assert.equal(takeA1.id, (await getReel(reelA.id))?.takes[0]?.id);

  const foreign = await PATCH(
    new Request(`http://vocal.local/api/reels/${reelA.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingTakeId: takeB.id }),
    }),
    { params: Promise.resolve({ id: reelA.id }) },
  );
  assert.equal(foreign.status, 400);
  assert.equal((await foreign.json()).code, "TAKE_NOT_IN_REEL");
  await assert.rejects(
    () => updateReel(reelA.id, { workingTakeId: takeB.id }),
    (error: unknown) => error instanceof ReelError && error.code === "TAKE_NOT_IN_REEL",
  );
});

test("missing workingTakeId is not replaced by selectedTakeId or takes[0]", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  const reel = await createReel({ title: "Старая запись" });
  const take = await createTake(reel.id, { inputType: "text", bodyText: "есть дубль" });
  await prisma.reel.update({
    where: { id: reel.id },
    data: { workingTakeId: null, selectedTakeId: take.id },
  });
  const { buildThoughtMaterialContext } = await import("../src/lib/dialogue");
  await assert.rejects(
    () => buildThoughtMaterialContext(reel.id),
    (error: unknown) => error instanceof ReelError && error.code === "WORKING_TAKE_REQUIRED",
  );
});

test("AiCall snapshot stores working take, revision, reel and dialogue versions", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  resetAiInflightForTests();
  t.after(() => resetAiInflightForTests());

  const { reel } = await createThoughtFromText({
    title: "Снимок",
    body: "Материал для снимка вызова.",
    idempotencyKey: "v01-snapshot-thought",
  });
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  await sendDialogueMessage(
    reel.id,
    { text: "зафиксируй материал", idempotencyKey: "v01-snapshot-send" },
    async () => ({
      text: askQuestionJson("зафиксировано"),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  const call = await prisma.aiCall.findFirstOrThrow({
    where: { reelId: reel.id, kind: "dialogue" },
    orderBy: { createdAt: "desc" },
  });
  const snap = JSON.parse(call.inputSnapshotJson) as {
    text: string;
    workingTakeId: string;
    transcriptRevisionId: string | null;
    reelUpdatedAt: string;
    thoughtStateRevision: number;
    dialogueVersion: { threadId: string; messageCount: number; lastMessageId: string | null; headEpoch: number };
  };
  assert.equal(snap.text, "зафиксируй материал");
  assert.equal(snap.workingTakeId, reel.workingTakeId);
  assert.ok(snap.transcriptRevisionId);
  assert.ok(snap.reelUpdatedAt);
  assert.equal(typeof snap.thoughtStateRevision, "number");
  assert.ok(snap.dialogueVersion.threadId);
  assert.ok(snap.dialogueVersion.messageCount >= 2);
  assert.ok(snap.dialogueVersion.lastMessageId);
  assert.ok(snap.dialogueVersion.headEpoch >= 2);
});

test("snapshot stays on the take used in the prompt if the pointer moves after the read", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  resetAiInflightForTests();
  const dialogue = await import("../src/lib/dialogue");
  t.after(() => {
    resetAiInflightForTests();
    v01TestSeams.afterWorkingTakeRead = null;
  });

  const { reel } = await createThoughtFromText({
    title: "Гонка чтения",
    body: "PROMPT_TAKE_A_MARKER исходный рабочий",
    idempotencyKey: "v01-read-race-thought",
  });
  const takeA = reel.workingTakeId;
  assert.ok(takeA);
  const takeB = await createTake(reel.id, { inputType: "text", bodyText: "PROMPT_TAKE_B_SHOULD_NOT_BE_IN_CALL" });
  v01TestSeams.afterWorkingTakeRead = async () => {
    await prisma.reel.update({ where: { id: reel.id }, data: { workingTakeId: takeB.id } });
  };

  await assert.rejects(
    () =>
      dialogue.sendDialogueMessage(
        reel.id,
        { text: "после чтения", idempotencyKey: "v01-read-race-send" },
        async () => ({
          text: askQuestionJson("STALE_AFTER_READ"),
          usage: { promptTokens: 1, completionTokens: 1 },
        }),
      ),
    (error: unknown) => error instanceof StateVersionError,
  );
  const call = await prisma.aiCall.findFirstOrThrow({
    where: { reelId: reel.id, kind: "dialogue" },
    orderBy: { createdAt: "desc" },
  });
  const snap = JSON.parse(call.inputSnapshotJson) as { workingTakeId: string };
  assert.equal(snap.workingTakeId, takeA);
  assert.match(call.promptText, /PROMPT_TAKE_A_MARKER/);
  assert.equal(call.promptText.includes("PROMPT_TAKE_B_SHOULD_NOT_BE_IN_CALL"), false);
  assert.equal(call.status, "error");
  const page = await dialogue.listDialoguePage(reel.id);
  assert.equal(page.messages.some((item) => item.body === "STALE_AFTER_READ"), false);
});

test("insert after last CAS check waits on the dialogue thread lock", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  resetAiInflightForTests();
  t.after(() => {
    resetAiInflightForTests();
    v01TestSeams.afterLastMaterialCheck = null;
  });

  const { reel } = await createThoughtFromText({
    title: "Гонка после последней проверки",
    body: "текст до записи",
    idempotencyKey: "v01-last-check-thought",
  });
  const { ensureReelThread } = await import("../src/lib/dialogue");
  const thread = await ensureReelThread(reel.id);
  const rival = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  t.after(() => rival.$disconnect());

  let insertSettledBeforeWrite = false;
  let insertPromise: Promise<unknown> | undefined;
  v01TestSeams.afterLastMaterialCheck = async () => {
    insertPromise = rival.dialogueMessage
      .create({
        data: {
          threadId: thread.id,
          role: "user",
          kind: "text",
          body: "AFTER_LAST_CHECK_INSERT",
          status: "done",
        },
      })
      .then((row) => {
        insertSettledBeforeWrite = true;
        return row;
      });
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(insertSettledBeforeWrite, false);
  };

  const { sendDialogueMessage, listDialoguePage } = await import("../src/lib/dialogue");
  const page = await sendDialogueMessage(
    reel.id,
    { text: "после последней проверки", idempotencyKey: "v01-last-check-send" },
    async () => ({
      text: askQuestionJson("REPLY_UNDER_THREAD_LOCK"),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  assert.ok(page.messages.some((item) => item.body === "REPLY_UNDER_THREAD_LOCK"));
  await insertPromise;
  const after = await listDialoguePage(reel.id);
  assert.ok(after.messages.some((item) => item.body === "AFTER_LAST_CHECK_INSERT"));
  const reply = after.messages.find((item) => item.body === "REPLY_UNDER_THREAD_LOCK");
  const late = after.messages.find((item) => item.body === "AFTER_LAST_CHECK_INSERT");
  assert.ok(reply && late);
  assert.ok(reply.createdAt <= late.createdAt || reply.id < late.id);
});

test("database rejects a working take from another thought", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  const reelA = await createReel({ title: "A" });
  const reelB = await createReel({ title: "B" });
  await createTake(reelA.id, { inputType: "text", bodyText: "A1" });
  const takeB = await createTake(reelB.id, { inputType: "text", bodyText: "B1" });
  await assert.rejects(() =>
    prisma.reel.update({
      where: { id: reelA.id },
      data: { workingTakeId: takeB.id },
    }),
  );
});
