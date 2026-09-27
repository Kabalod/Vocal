import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { parseAgentReply } from "../src/lib/agent-action";
import { sendDialogueMessage, thoughtDialogueSystemPrompt, V03_HEAD_DIALOGUE_SYSTEM } from "../src/lib/dialogue";
import { C00EnvelopeError } from "../src/lib/c00-envelope";
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

test("disabled C00 policy uses the accepted V03_HEAD dialogue system prompt", () => {
  const source = execFileSync(
    "git",
    ["show", "b5278f468666330bc30bb6cd9378f2f02f858264:src/lib/dialogue.ts"],
    { encoding: "utf8" },
  );
  const match = source.match(/const DIALOGUE_SYSTEM = `([^`]+)`/);
  assert.ok(match?.[1], "V03_HEAD must still contain DIALOGUE_SYSTEM");
  assert.equal(V03_HEAD_DIALOGUE_SYSTEM, match[1]);
  assert.match(V03_HEAD_DIALOGUE_SYSTEM, /текст факта/);
  assert.match(V03_HEAD_DIALOGUE_SYSTEM, /sourceId текущего сообщения автора/);
  assert.match(V03_HEAD_DIALOGUE_SYSTEM, /какие gapId закрыты/);
  const previous = c00PolicySeam.enabled;
  try {
    c00PolicySeam.enabled = false;
    assert.equal(thoughtDialogueSystemPrompt(), match[1]);
    assert.equal(thoughtDialogueSystemPrompt().includes("c00Signal"), false);
  } finally {
    c00PolicySeam.enabled = previous;
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

test("disabled C00 policy ignores invalid c00Signal and uses the V03 prompt", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(() => {
    c00PolicySeam.enabled = null;
  });
  c00PolicySeam.enabled = false;
  assert.equal(thoughtDialogueSystemPrompt().includes("c00Signal"), false);
  assert.doesNotThrow(() =>
    parseAgentReply({
      action: "ask_question",
      question: "Что ваше?",
      clarificationReason: "нужно уточнение задачи",
      whyUnknown: "в материале этой мысли ответа ещё нет",
      thoughtUpdate: { fact: null, closeGapIds: [] },
      c00Signal: { signalType: "not_a_real_signal", proposedAction: "correct_thought" },
    }),
  );
  c00PolicySeam.enabled = true;
  assert.throws(
    () =>
      parseAgentReply({
        action: "ask_question",
        question: "Что ваше?",
        clarificationReason: "нужно уточнение задачи",
        whyUnknown: "в материале этой мысли ответа ещё нет",
        c00Signal: { signalType: "not_a_real_signal", proposedAction: "correct_thought" },
      }),
    (error: unknown) => error instanceof C00EnvelopeError && error.code === "C00_SIGNAL_INVALID",
  );
  c00PolicySeam.enabled = false;
  const { reel } = await createThoughtFromText({
    title: "C00-05 invalid signal",
    body: "Мысль для битого сигнала при откате.",
    idempotencyKey: "c00-05-bad-signal-create",
  });
  const text = "Сцена вечером на кухне.";
  await sendDialogueMessage(reel.id, { text, idempotencyKey: "c00-05-bad-signal-1" }, async () => {
    const update = await thoughtUpdateForUserText(prisma, reel.id, text);
    return {
      text: JSON.stringify({
        action: "ask_question",
        question: "Что ещё уточнить?",
        clarificationReason: "нужно уточнение задачи",
        whyUnknown: "в материале этой мысли ответа ещё нет",
        thoughtUpdate: { fact: update.fact, closeGapIds: [] },
        c00Signal: { signalType: "not_a_real_signal", proposedAction: "correct_thought", extra: true },
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  });
  const after = await getThoughtState(reel.id);
  assert.equal(after.facts.some((fact) => fact.text === text), true);
  const call = await prisma.aiCall.findFirstOrThrow({ where: { reelId: reel.id, kind: "dialogue" } });
  assert.equal(call.promptText?.includes("c00Signal"), false);
  const envelope = parseC00Envelope(call.resultJson);
  assert.equal(envelope?.decision, null);
  assert.equal(envelope?.correction, null);
});

test("contradiction without targetId binds to the inferred fact, not the last other slot", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const { reel } = await createThoughtFromText({
    title: "C00-05 contradict target",
    body: "Мысль с фактом и другим слотом.",
    idempotencyKey: "c00-05-con-target-create",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [{ id: "fact_seed", text: "Исходный факт.", sourceType: "initial_note", sourceId: reel.id }],
      openGaps: [{ id: "gap_other", text: "другой слот", status: "open" }],
    },
  });
  const first = "Сначала так: версия А.";
  await sendDialogueMessage(reel.id, { text: first, idempotencyKey: "c00-05-con-target-1" }, () =>
    completeLocalCorrection(prisma, reel.id, first, {
      targetKind: "fact",
      targetId: "fact_seed",
      operation: "supersede",
    }),
  );
  const factDecision = listC00Decisions(await prisma.aiCall.findMany({ where: { reelId: reel.id } }))[0];
  const other = "Это про пробел, не про факт.";
  await sendDialogueMessage(reel.id, { text: other, idempotencyKey: "c00-05-con-target-2" }, () =>
    completeLocalCorrection(
      prisma,
      reel.id,
      other,
      { targetKind: "gap", targetId: "gap_other", operation: "supersede" },
      "local_correction",
    ),
  );
  const afterGap = await getThoughtState(reel.id);
  assert.equal(afterGap.facts.find((fact) => fact.id === "fact_seed")?.text, first);
  assert.equal(afterGap.openGaps.find((gap) => gap.id === "gap_other")?.text, other);
  const third = "Нет, верно версия Б.";
  await sendDialogueMessage(reel.id, { text: third, idempotencyKey: "c00-05-con-target-3" }, () =>
    completeLocalCorrection(prisma, reel.id, third, { operation: "supersede" }, "contradictory_correction"),
  );
  const after = await getThoughtState(reel.id);
  assert.equal(after.facts.find((fact) => fact.id === "fact_seed")?.text, third);
  const rows = await prisma.aiCall.findMany({
    where: { reelId: reel.id, kind: "dialogue" },
    orderBy: { createdAt: "asc" },
  });
  const envelopes = rows.map((row) => parseC00Envelope(row.resultJson));
  assert.equal(envelopes[1]?.correction?.targetId, "gap_other");
  assert.equal(envelopes[2]?.correction?.targetId, "fact_seed");
  assert.equal(envelopes[2]?.decision?.contradictsDecisionId, factDecision?.decisionId);
  assert.notEqual(envelopes[2]?.decision?.contradictsDecisionId, envelopes[1]?.decision?.decisionId);
});

test("live-shaped ask_question with stray evidenceRefs reaches C00 correction", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  const previous = c00PolicySeam.enabled;
  c00PolicySeam.enabled = true;
  t.after(() => { c00PolicySeam.enabled = previous; });
  assert.throws(
    () => parseAgentReply({
      action: "ask_question",
      question: "Что ваше?",
      clarificationReason: "нужно уточнение",
      whyUnknown: "говорящий неясен",
      unexpectedField: true,
    }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "AGENT_ACTION_INVALID",
  );
  const { reel } = await createThoughtFromText({
    title: "C00 live answer shape",
    body: "Мысль с чужой репликой.",
    idempotencyKey: "c00-live-shape-create",
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [{ id: "fact_seed", text: "Реплика оператора.", sourceType: "initial_note", sourceId: reel.id }],
    },
  });
  const before = await getThoughtState(reel.id);
  const text = "Это сказал оператор, не я.";
  await sendDialogueMessage(reel.id, { text, idempotencyKey: "c00-live-shape-1" }, async () => {
    const user = await prisma.dialogueMessage.findFirstOrThrow({
      where: { thread: { reelId: reel.id }, role: "user", body: text },
      orderBy: { createdAt: "desc" },
    });
    return {
      text: JSON.stringify({
        action: "ask_question",
        question: "Что тогда ваше?",
        clarificationReason: "нужно уточнить говорящего",
        whyUnknown: "автор пока не уточнил свою позицию",
        evidenceRefs: ["fact_seed"],
        thoughtUpdate: { fact: null, closeGapIds: [] },
        c00Signal: c00SignalFor("wrong_speaker", "correct_thought", user.id, before.revision, {
          targetKind: "fact",
          targetId: "fact_seed",
          operation: "clear_slot",
        }),
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  });
  const after = await getThoughtState(reel.id);
  assert.equal(after.facts.some((fact) => fact.id === "fact_seed"), false);
  assert.equal(after.revision, before.revision + 1);
  const call = await prisma.aiCall.findFirstOrThrow({ where: { reelId: reel.id, kind: "dialogue" } });
  const envelope = parseC00Envelope(call.resultJson);
  assert.equal(envelope?.action.action, "ask_question");
  assert.equal(envelope?.decision?.applyResult, "applied");
  assert.equal(envelope?.correction?.targetId, "fact_seed");
  await assertNoThoughtPortraitBridge(prisma, reel.id);
});
