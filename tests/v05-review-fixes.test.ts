import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { buildC00Envelope } from "../src/lib/c00-envelope";
import { resetV05TestSeams, v05TestSeams } from "../src/lib/v05-test-seams";

test("V05 snapshot freeze rejects correction between collect and freeze", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  resetV05TestSeams();
  t.after(async () => {
    resetV05TestSeams();
    resetAiInflightForTests();
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { applyThoughtState } = await import("../src/lib/thought-state");
  const { generateV05Script, parseV05GenerateSnapshot } = await import("../src/lib/v05-script");
  const { ensureReelThread } = await import("../src/lib/dialogue");

  const { reel } = await createThoughtFromText({
    title: "Снимок",
    body: "Старый материал про остывший чай.",
    idempotencyKey: "v05-snap-1",
  });
  const thread = await ensureReelThread(reel.id);
  const user = await prisma.dialogueMessage.create({
    data: { threadId: thread.id, role: "user", kind: "text", body: "Старый материал про остывший чай." },
  });

  v05TestSeams.afterCollectBeforeFreeze = async () => {
    const state = await prisma.thoughtState.findFirstOrThrow({ where: { reelId: reel.id } });
    await applyThoughtState({
      reelId: reel.id,
      expectedRevision: state.revision,
      patch: { position: "Исправленная позиция: чай лучше тёплым." },
    });
    const call = await prisma.aiCall.create({
      data: {
        kind: "dialogue",
        reelId: reel.id,
        model: "test",
        status: "done",
        ownerUserId: "local",
        turnKey: `dialogue-corr-${reel.id}`,
        promptText: "corr",
        inputSnapshotJson: "{}",
      },
    });
    await prisma.aiCall.update({
      where: { id: call.id },
      data: {
        resultJson: JSON.stringify(
          buildC00Envelope({
            aiCallId: call.id,
            turnKey: call.turnKey!,
            ownerUserId: "local",
            reelId: reel.id,
            action: { action: "ask_question", question: "Что своё?", whyUnknown: "нужна своя позиция" },
            decision: {
              decisionId: "dec-corr",
              action: "correct_thought",
              signalType: "local_correction",
              scope: "thought",
              evidenceUserMessageIds: [user.id],
              thoughtStateRevisionSeen: state.revision,
              reasonCode: "local_correction",
              applyResult: "applied",
            },
            correction: {
              correctionId: "corr-1",
              decisionId: "dec-corr",
              targetKind: "fact",
              targetId: "fact_x",
              operation: "supersede",
              beforeThoughtRevision: state.revision,
              afterThoughtRevision: state.revision + 1,
              replacedBecause: "author_fix",
              acceptedAt: new Date().toISOString(),
            },
          }),
        ),
      },
    });
  };

  await assert.rejects(
    () => generateV05Script(reel.id, { idempotencyKey: "snap-race" }, async () => ({
      text: JSON.stringify({ script: "Старый материал про остывший чай." }),
    })),
    (error: unknown) => error instanceof Error && /изменились/.test(error.message),
  );
  const after = await prisma.thoughtState.findFirstOrThrow({ where: { reelId: reel.id } });
  const leaked = await prisma.scriptVersion.findMany({ where: { reelId: reel.id } });
  assert.equal(
    leaked.filter((row) => {
      const snap = parseV05GenerateSnapshot(row.inputSnapshotJson);
      return row.body.includes("Старый материал") && snap?.thoughtStateRevision === after.revision;
    }).length,
    0,
  );
});

test("V05 readiness, sources, stale, keep, and idempotent retry", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  resetV05TestSeams();
  t.after(async () => {
    resetV05TestSeams();
    resetAiInflightForTests();
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { applyThoughtState } = await import("../src/lib/thought-state");
  const { listScriptWorkspace, openScriptDraft, replaceScriptDraft, finalizeScriptDraft } = await import("../src/lib/scripts");
  const {
    generateV05Script,
    keepCurrentScript,
    collectV05SourceTexts,
    evaluateScriptReadiness,
    claimErrorScriptCall,
    scriptTurnKey,
  } = await import("../src/lib/v05-script");
  const { createTake } = await import("../src/lib/reels");
  const { ensureOriginalFromText } = await import("../src/lib/transcripts");
  const { ensureReelThread } = await import("../src/lib/dialogue");

  const missingThought = await createThoughtFromText({
    title: "Без состояния",
    body: "есть текст дубля",
    idempotencyKey: "v05-no-state",
  });
  await prisma.thoughtState.delete({ where: { reelId: missingThought.reel.id } });
  const noState = await evaluateScriptReadiness(missingThought.reel.id);
  assert.equal(noState.ready, false);
  assert.match(noState.blockReason ?? "", /состояния мысли/);

  const { reel } = await createThoughtFromText({
    title: "Позиция",
    body: "временный исходник",
    idempotencyKey: "v05-position",
  });
  const take = await prisma.take.findFirstOrThrow({ where: { reelId: reel.id } });
  await prisma.transcriptRevision.deleteMany({ where: { takeId: take.id } });
  await prisma.take.update({ where: { id: take.id }, data: { bodyText: "", selectedTranscriptId: null } });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: { position: "Короткая ясная позиция: говорить спокойно." },
  });
  const short = await evaluateScriptReadiness(reel.id);
  assert.equal(short.ready, true);

  const recorded = await createTake(reel.id, { inputType: "audio", bodyText: "" });
  await prisma.reel.update({ where: { id: reel.id }, data: { workingTakeId: recorded.id } });
  const first = await prisma.transcriptRevision.create({
    data: { takeId: recorded.id, kind: "original", source: "stt", text: "первая расшифровка не выбранная" },
  });
  await prisma.transcriptRevision.create({
    data: { takeId: recorded.id, kind: "original", source: "stt", text: "вторая расшифровка" },
  });
  await prisma.take.update({ where: { id: recorded.id }, data: { selectedTranscriptId: null } });
  const noSel = await evaluateScriptReadiness(reel.id);
  assert.equal(noSel.ready, false);
  assert.match(noSel.blockReason ?? "", /расшифровк/);
  const masked = await collectV05SourceTexts(reel.id);
  assert.equal(masked.texts.some((item) => item.text.includes("первая расшифровка")), false);

  await prisma.reel.update({ where: { id: reel.id }, data: { workingTakeId: take.id } });
  const thread = await ensureReelThread(reel.id);
  const retracted = await prisma.dialogueMessage.create({
    data: { threadId: thread.id, role: "user", kind: "text", body: "снятый смысл про чужой опыт" },
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 1,
    patch: {
      facts: [
        {
          id: "fact_fixed",
          text: "исправленный факт: только свой чай",
          sourceType: "dialogue_message",
          sourceId: retracted.id,
        },
      ],
    },
  });
  const sources = await collectV05SourceTexts(reel.id);
  assert.equal(sources.texts.some((item) => item.text.includes("исправленный факт")), true);
  assert.equal(sources.texts.some((item) => item.text.includes("снятый смысл")), false);

  const v1 = await generateV05Script(reel.id, { idempotencyKey: "rev-1" }, async () => ({
    text: JSON.stringify({ script: "Говорить спокойно про свой чай." }),
  }));
  const firstId = v1.viewing!.id;
  await prisma.dialogueMessage.create({
    data: { threadId: thread.id, role: "user", kind: "text", body: "Добавлю, что это утром." },
  });
  const v2 = await generateV05Script(reel.id, { idempotencyKey: "rev-2" }, async () => ({
    text: JSON.stringify({ script: "Говорить спокойно про свой чай утром." }),
  }));
  const oldOpen = await listScriptWorkspace(reel.id, firstId);
  assert.equal(oldOpen.stale, true);
  assert.equal(oldOpen.viewing?.id, firstId);
  const headOpen = await listScriptWorkspace(reel.id, v2.viewing!.id);
  assert.equal(headOpen.stale, false);

  const draftOld = await openScriptDraft(reel.id, firstId);
  assert.equal(draftOld.draft?.baseVersionId, firstId);
  const draftListed = await listScriptWorkspace(reel.id);
  assert.equal(draftListed.stale, true);

  const onlyDraftReel = await createThoughtFromText({
    title: "Только черновик",
    body: "позиция для черновика",
    idempotencyKey: "v05-draft-only",
  });
  await replaceScriptDraft(onlyDraftReel.reel.id, { body: "ручной черновик без версии" });
  const draftThread = await ensureReelThread(onlyDraftReel.reel.id);
  await prisma.dialogueMessage.create({
    data: { threadId: draftThread.id, role: "user", kind: "text", body: "новое после черновика" },
  });
  const draftStale = await listScriptWorkspace(onlyDraftReel.reel.id);
  assert.equal(draftStale.readyCount, 0);
  assert.equal(draftStale.stale, true);
  const keptDraft = await keepCurrentScript(onlyDraftReel.reel.id, { draft: true });
  assert.equal(keptDraft.stale, false);
  assert.equal(keptDraft.readyCount, 0);

  const manualReel = await createThoughtFromText({
    title: "Ручная",
    body: "ручная основа",
    idempotencyKey: "v05-manual",
  });
  const opened = await openScriptDraft(manualReel.reel.id);
  const finalized = await finalizeScriptDraft(manualReel.reel.id, {
    expectedUpdatedAt: opened.draft!.updatedAt,
    expectedSaveToken: opened.draft!.saveToken,
    body: "ручная версия",
  });
  assert.equal(finalized.readyCount, 1);
  const take2 = await createTake(manualReel.reel.id, { inputType: "text", bodyText: "новый рабочий дубль" });
  await ensureOriginalFromText(take2.id, "новый рабочий дубль");
  await prisma.reel.update({ where: { id: manualReel.reel.id }, data: { workingTakeId: take2.id } });
  const manualStale = await listScriptWorkspace(manualReel.reel.id, finalized.viewing!.id);
  assert.equal(manualStale.stale, true);

  v05TestSeams.afterCommitBeforeWorkspace = async () => {
    throw new Error("workspace lost after commit");
  };
  await assert.rejects(
    () => generateV05Script(reel.id, { idempotencyKey: "lost-dto" }, async () => ({
      text: JSON.stringify({ script: "после commit" }),
    })),
    /workspace lost after commit/,
  );
  const done = await prisma.aiCall.findUniqueOrThrow({ where: { turnKey: scriptTurnKey(reel.id, "lost-dto") } });
  assert.equal(done.status, "done");
  v05TestSeams.afterCommitBeforeWorkspace = null;
  const replayLost = await generateV05Script(reel.id, { idempotencyKey: "lost-dto" }, async () => ({
    text: JSON.stringify({ script: "вторая версия не нужна" }),
  }));
  assert.equal(replayLost.viewing?.body, "после commit");
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id, body: "после commit" } }), 1);

  await generateV05Script(reel.id, { idempotencyKey: "will-err" }, async () => {
    throw new Error("сеть оборвалась");
  }).catch(() => undefined);
  const errCall = await prisma.aiCall.findUniqueOrThrow({ where: { turnKey: scriptTurnKey(reel.id, "will-err") } });
  assert.equal(errCall.status, "error");

  const firstClaim = claimErrorScriptCall({
    turnKey: errCall.turnKey!,
    promptText: "retry",
    inputSnapshotJson: errCall.inputSnapshotJson,
  });
  const secondClaim = claimErrorScriptCall({
    turnKey: errCall.turnKey!,
    promptText: "retry",
    inputSnapshotJson: errCall.inputSnapshotJson,
  });
  const claimed = await Promise.all([firstClaim, secondClaim]);
  assert.equal(claimed.filter(Boolean).length, 1);
  await prisma.aiCall.update({
    where: { id: errCall.id },
    data: { status: "error", errorMessage: "сеть оборвалась" },
  });

  resetAiInflightForTests();
  const [a, b] = await Promise.all([
    generateV05Script(reel.id, { idempotencyKey: "will-err" }, async () => ({
      text: JSON.stringify({ script: "повтор после ошибки" }),
    })),
    generateV05Script(reel.id, { idempotencyKey: "will-err" }, async () => ({
      text: JSON.stringify({ script: "второй исполнитель" }),
    })),
  ]);
  assert.equal(a.viewing?.id, b.viewing?.id);
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id, body: "повтор после ошибки" } }), 1);
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id, body: "второй исполнитель" } }), 0);
});
