import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { sendDialogueMessage } from "../src/lib/dialogue";
import { createThoughtFromText } from "../src/lib/thought-create";
import { applyThoughtState, getThoughtState } from "../src/lib/thought-state";
import { C00_POLICY_ENV, c00PolicySeam, isC00PolicyEnabled } from "../src/lib/c00-policy";
import { routeC00Decision } from "../src/lib/c00-router";
import { listC00Decisions, parseC00Envelope } from "../src/lib/c00-envelope";
import { askQuestionJson, c00SignalFor, thoughtUpdateForUserText } from "./helpers/agent-action-json";
import type { PrismaClient } from "@prisma/client";

async function assertNoThoughtPortraitBridge(prisma: PrismaClient, reelId: string) {
  assert.equal(await prisma.profileRevision.count(), 0);
  assert.equal(await prisma.aiCall.count({ where: { reelId, kind: "profile_dialogue" } }), 0);
  const rows = await prisma.aiCall.findMany({ where: { reelId, kind: "dialogue" } });
  for (const row of rows) {
    assert.equal(row.resultJson?.includes("apply_update"), false);
    assert.equal(row.resultJson?.includes("v04-event-1"), false);
    const envelope = parseC00Envelope(row.resultJson);
    if (envelope) assert.equal(envelope.schemaVersion, "c00-envelope-1");
  }
}

async function completeLocalCorrection(
  prisma: PrismaClient,
  reelId: string,
  text: string,
  extras: Parameters<typeof c00SignalFor>[4] = {},
  signalType: Parameters<typeof c00SignalFor>[0] = "local_correction",
) {
  const update = await thoughtUpdateForUserText(prisma, reelId, text);
  const state = await getThoughtState(reelId);
  return {
    text: askQuestionJson(
      "Что ещё уточнить?",
      update,
      c00SignalFor(signalType, "correct_thought", update.userMessageId, state.revision, extras),
    ),
    usage: { promptTokens: 1, completionTokens: 1 },
  };
}

test("policy flag defaults on and env off is rollback", () => {
  const previous = process.env[C00_POLICY_ENV];
  const seam = c00PolicySeam.enabled;
  try {
    c00PolicySeam.enabled = null;
    delete process.env[C00_POLICY_ENV];
    assert.equal(isC00PolicyEnabled(), true);
    process.env[C00_POLICY_ENV] = "0";
    assert.equal(isC00PolicyEnabled(), false);
    const routed = routeC00Decision({
      candidate: c00SignalFor("wrong_speaker", "correct_thought", "msg_1", 0),
      ownerUserId: "local",
      callOwnerUserId: "local",
      currentUserMessageId: "msg_1",
      thoughtStateRevision: 0,
      callId: "call_1",
      userText: "Это сказал оператор, не я.",
    });
    assert.equal(routed.decision, null);
    assert.equal(routed.applyThoughtUpdate, true);
  } finally {
    c00PolicySeam.enabled = seam;
    if (previous == null) delete process.env[C00_POLICY_ENV];
    else process.env[C00_POLICY_ENV] = previous;
  }
});

test("repeated corrections stay on one thought and do not write a portrait", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "C00-05 repeat",
    body: "Мысль для повторов.",
    idempotencyKey: "c00-05-rep-create",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [{ id: "fact_seed", text: "Первая формулировка.", sourceType: "initial_note", sourceId: reel.id }],
    },
  });
  const first = "Правильнее так: вторая формулировка.";
  await sendDialogueMessage(reel.id, { text: first, idempotencyKey: "c00-05-rep-1" }, () =>
    completeLocalCorrection(prisma, reel.id, first, {
      targetKind: "fact",
      targetId: "fact_seed",
      operation: "supersede",
    }),
  );
  const second = "Ещё точнее: третья формулировка.";
  await sendDialogueMessage(reel.id, { text: second, idempotencyKey: "c00-05-rep-2" }, () =>
    completeLocalCorrection(prisma, reel.id, second, {
      targetKind: "fact",
      targetId: "fact_seed",
      operation: "supersede",
    }, "repeated_correction"),
  );
  const after = await getThoughtState(reel.id);
  assert.equal(after.facts.find((fact) => fact.id === "fact_seed")?.text, second);
  const decisions = listC00Decisions(await prisma.aiCall.findMany({ where: { reelId: reel.id } }));
  assert.equal(decisions.length, 2);
  assert.ok(decisions.every((decision) => decision.action === "correct_thought" && decision.scope === "thought"));
  await assertNoThoughtPortraitBridge(prisma, reel.id);
});

test("contradictory correction records history and keeps the last accepted slice", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "C00-05 contradict",
    body: "Мысль для противоречия.",
    idempotencyKey: "c00-05-con-create",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [{ id: "fact_seed", text: "Исходный слот.", sourceType: "initial_note", sourceId: reel.id }],
    },
  });
  const first = "Сначала так: версия А.";
  await sendDialogueMessage(reel.id, { text: first, idempotencyKey: "c00-05-con-1" }, () =>
    completeLocalCorrection(prisma, reel.id, first, {
      targetKind: "fact",
      targetId: "fact_seed",
      operation: "supersede",
    }),
  );
  const firstDecision = listC00Decisions(await prisma.aiCall.findMany({ where: { reelId: reel.id } }))[0];
  const second = "Нет, верно версия Б.";
  await sendDialogueMessage(reel.id, { text: second, idempotencyKey: "c00-05-con-2" }, () =>
    completeLocalCorrection(prisma, reel.id, second, {
      targetKind: "fact",
      targetId: "fact_seed",
      operation: "supersede",
    }, "contradictory_correction"),
  );
  const after = await getThoughtState(reel.id);
  assert.equal(after.facts.find((fact) => fact.id === "fact_seed")?.text, second);
  const rows = await prisma.aiCall.findMany({ where: { reelId: reel.id, kind: "dialogue" }, orderBy: { createdAt: "asc" } });
  const envelopes = rows.map((row) => parseC00Envelope(row.resultJson));
  assert.equal(envelopes.length, 2);
  assert.equal(envelopes[0]?.decision?.decisionId, firstDecision?.decisionId);
  assert.equal(envelopes[0]?.correction?.targetId, "fact_seed");
  assert.equal(envelopes[1]?.decision?.contradictsDecisionId, firstDecision?.decisionId);
  assert.equal(envelopes[1]?.decision?.applyResult, "applied");
  await assertNoThoughtPortraitBridge(prisma, reel.id);
});

test("displayed slice rolls back through a new correction without rewriting sources", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "C00-05 rollback slice",
    body: "Исходная заметка для отката среза.",
    idempotencyKey: "c00-05-rb-create",
  });
  const original = await prisma.transcriptRevision.findFirst({ where: { take: { reelId: reel.id } } });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [{ id: "fact_seed", text: "Старая формулировка.", sourceType: "initial_note", sourceId: reel.id }],
    },
  });
  const changed = "Временно так: новая формулировка.";
  await sendDialogueMessage(reel.id, { text: changed, idempotencyKey: "c00-05-rb-1" }, () =>
    completeLocalCorrection(prisma, reel.id, changed, {
      targetKind: "fact",
      targetId: "fact_seed",
      operation: "supersede",
    }),
  );
  const restored = "Вернуть: старая формулировка.";
  await sendDialogueMessage(reel.id, { text: restored, idempotencyKey: "c00-05-rb-2" }, () =>
    completeLocalCorrection(prisma, reel.id, restored, {
      targetKind: "fact",
      targetId: "fact_seed",
      operation: "supersede",
    }),
  );
  const after = await getThoughtState(reel.id);
  assert.equal(after.facts.find((fact) => fact.id === "fact_seed")?.text, restored);
  const rows = await prisma.aiCall.findMany({ where: { reelId: reel.id, kind: "dialogue" }, orderBy: { createdAt: "asc" } });
  const first = parseC00Envelope(rows[0]?.resultJson);
  const second = parseC00Envelope(rows[1]?.resultJson);
  assert.equal(first?.correction?.operation, "supersede");
  assert.equal(second?.correction?.operation, "supersede");
  assert.notEqual(first?.decision?.decisionId, second?.decision?.decisionId);
  assert.equal(first?.correction?.acceptedAt, parseC00Envelope(rows[0]?.resultJson)?.correction?.acceptedAt);
  const transcriptAfter = await prisma.transcriptRevision.findFirst({ where: { take: { reelId: reel.id } } });
  assert.equal(transcriptAfter?.id, original?.id);
  assert.equal(transcriptAfter?.text, original?.text);
  await assertNoThoughtPortraitBridge(prisma, reel.id);
});

test("disabled C00 policy leaves V03 thoughtUpdate and writes no decision", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    c00PolicySeam.enabled = null;
  });
  c00PolicySeam.enabled = false;
  const { reel } = await createThoughtFromText({
    title: "C00-05 flag",
    body: "Мысль для отката флага.",
    idempotencyKey: "c00-05-flag-create",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [{ id: "fact_seed", text: "Слот V03 не должен сниматься политикой.", sourceType: "initial_note", sourceId: reel.id }],
    },
  });
  const text = "Это сказал оператор, не я.";
  const before = await getThoughtState(reel.id);
  await sendDialogueMessage(reel.id, { text, idempotencyKey: "c00-05-flag-1" }, async () => {
    const update = await thoughtUpdateForUserText(prisma, reel.id, text);
    return {
      text: askQuestionJson(
        "Что ваше?",
        update,
        c00SignalFor("wrong_speaker", "correct_thought", update.userMessageId, before.revision, {
          targetKind: "fact",
          targetId: "fact_seed",
          operation: "clear_slot",
        }),
      ),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  });
  const after = await getThoughtState(reel.id);
  assert.equal(after.facts.some((fact) => fact.id === "fact_seed"), true);
  assert.equal(after.facts.some((fact) => fact.text === text && fact.sourceType === "dialogue_message"), true);
  assert.equal(after.revision, before.revision + 1);
  const envelope = parseC00Envelope(
    (await prisma.aiCall.findFirstOrThrow({ where: { reelId: reel.id, kind: "dialogue" } })).resultJson,
  );
  assert.equal(envelope?.decision, null);
  assert.equal(envelope?.correction, null);
  await assertNoThoughtPortraitBridge(prisma, reel.id);
});
