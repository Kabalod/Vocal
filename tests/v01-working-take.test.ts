import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { aiOperationKey, resetAiInflightForTests, StateVersionError, withAiInflight } from "../src/lib/ai/usage-guard";
import { runWithOwner } from "../src/lib/auth/session";
import { createReel, createTake, getReel } from "../src/lib/reels";
import { createThoughtFromText } from "../src/lib/thought-create";
import { ensureOriginalFromText, listTranscriptBundle } from "../src/lib/transcripts";

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
      text: JSON.stringify({ reply: "ок", scriptProposal: null }),
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
      text: JSON.stringify({ reply: "свой ответ", scriptProposal: null }),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  assert.ok(page.messages.some((item) => item.body === "свой ответ"));

  await runWithOwner({ id: "other-owner", email: "other@vocal.local" }, async () => {
    const { assertDailyTokenBudget, AiBudgetError } = await import("../src/lib/ai/usage-guard");
    await assert.rejects(() => assertDailyTokenBudget(), (error: unknown) => error instanceof AiBudgetError);
  });
});
