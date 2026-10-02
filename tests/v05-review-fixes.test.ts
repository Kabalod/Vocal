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
  assert.equal(draftListed.viewingStale, false);
  assert.equal(draftListed.draftStale, true);
  assert.equal(draftListed.stale, false);

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
  const retried = await generateV05Script(reel.id, { idempotencyKey: "will-err" }, async () => ({
    text: JSON.stringify({ script: "повтор после ошибки" }),
  }));
  const replayed = await generateV05Script(reel.id, { idempotencyKey: "will-err" }, async () => ({
    text: JSON.stringify({ script: "второй исполнитель" }),
  }));
  assert.equal(retried.viewing?.id, replayed.viewing?.id);
  assert.equal(retried.viewing?.body, "повтор после ошибки");
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id, body: "повтор после ошибки" } }), 1);
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id, body: "второй исполнитель" } }), 0);
});

test("V05 keep draft is bound to draft+token+world and C00 retract drops raw take", async (t) => {
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
  const { applyThoughtState, getThoughtState } = await import("../src/lib/thought-state");
  const { listScriptWorkspace, replaceScriptDraft, patchScriptDraft, deleteScriptDraft } = await import("../src/lib/scripts");
  const {
    generateV05Script,
    keepCurrentScript,
    collectV05SourceTexts,
    evaluateScriptReadiness,
    draftKeepApplicable,
    parseV05GenerateSnapshot,
    draftKeepTurnKey,
  } = await import("../src/lib/v05-script");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { askQuestionJson, c00SignalFor } = await import("./helpers/agent-action-json");

  const { reel } = await createThoughtFromText({
    title: "C00 retract",
    body: "Старый смысл: я украл чужой отпуск в Сочи.",
    idempotencyKey: "v05-c00-retract",
  });
  const take = await prisma.take.findFirstOrThrow({ where: { reelId: reel.id } });
  const transcript = await prisma.transcriptRevision.findFirstOrThrow({ where: { takeId: take.id } });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [
        {
          id: "fact_take",
          text: "Старый смысл: я украл чужой отпуск в Сочи.",
          sourceType: "transcript_revision",
          sourceId: transcript.id,
        },
      ],
    },
  });

  const first = await generateV05Script(reel.id, { idempotencyKey: "c00-v1" }, async (req) => {
    assert.match(req.user, /украл чужой отпуск/);
    return { text: JSON.stringify({ script: "Старый смысл в сценарии." }) };
  });
  const versionKeepBefore = (await prisma.scriptVersion.findFirstOrThrow({ where: { id: first.viewing!.id } })).inputSnapshotJson;

  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 1,
    patch: { position: "" },
  });
  await sendDialogueMessage(
    reel.id,
    { text: "Это сказал оператор, не я.", idempotencyKey: "v05-c00-retract-1" },
    async () => {
      const user = await prisma.dialogueMessage.findFirstOrThrow({
        where: { thread: { reelId: reel.id }, role: "user", body: "Это сказал оператор, не я." },
        orderBy: { createdAt: "desc" },
      });
      const state = await getThoughtState(reel.id);
      return {
        text: askQuestionJson(
          "Что тогда ваше?",
          undefined,
          c00SignalFor("wrong_speaker", "correct_thought", user.id, state.revision, {
            targetKind: "fact",
            targetId: "fact_take",
            operation: "clear_slot",
          }),
        ),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );
  const afterRetract = await getThoughtState(reel.id);
  assert.equal(afterRetract.facts.some((fact) => fact.id === "fact_take"), false);
  const collected = await collectV05SourceTexts(reel.id);
  assert.equal(collected.texts.some((item) => item.text.includes("украл чужой отпуск")), false);

  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: afterRetract.revision,
    patch: { position: "исправленный факт: только свой чай" },
  });
  let seenPrompt = "";
  let modelCalls = 0;
  await generateV05Script(reel.id, { idempotencyKey: "c00-v2" }, async (req) => {
    modelCalls += 1;
    seenPrompt = req.user;
    return { text: JSON.stringify({ script: "Только свой чай." }) };
  });
  assert.equal(modelCalls, 1);
  assert.match(seenPrompt, /исправленный факт: только свой чай/);
  assert.equal(seenPrompt.includes("украл чужой отпуск"), false);

  const taskReel = await createThoughtFromText({
    title: "Только задача",
    body: "временный",
    idempotencyKey: "v05-task-only",
  });
  const taskTake = await prisma.take.findFirstOrThrow({ where: { reelId: taskReel.reel.id } });
  await prisma.transcriptRevision.deleteMany({ where: { takeId: taskTake.id } });
  await prisma.take.update({ where: { id: taskTake.id }, data: { bodyText: "", selectedTranscriptId: null } });
  await applyThoughtState({
    reelId: taskReel.reel.id,
    expectedRevision: 0,
    patch: { takeTask: "говорить короче" },
  });
  const taskReady = await evaluateScriptReadiness(taskReel.reel.id);
  assert.equal(taskReady.ready, false);
  let taskCalls = 0;
  await assert.rejects(
    () => generateV05Script(taskReel.reel.id, { idempotencyKey: "task-only" }, async () => {
      taskCalls += 1;
      return { text: JSON.stringify({ script: "нельзя" }) };
    }),
    (error: unknown) => error instanceof Error && /Недостаточно|нельзя собрать|NOT_READY|додумывания/i.test(error.message + (error as { code?: string }).code),
  );
  assert.equal(taskCalls, 0);

  const draftReel = await createThoughtFromText({
    title: "Keep draft",
    body: "основа черновика",
    idempotencyKey: "v05-keep-bind",
  });
  let draft = await replaceScriptDraft(draftReel.reel.id, { body: "черновик до коррекции" });
  await sendDialogueMessage(
    draftReel.reel.id,
    { text: "Это сказал оператор, не я.", idempotencyKey: "v05-keep-corr-1" },
    async () => {
      const user = await prisma.dialogueMessage.findFirstOrThrow({
        where: { thread: { reelId: draftReel.reel.id }, role: "user" },
        orderBy: { createdAt: "desc" },
      });
      const state = await getThoughtState(draftReel.reel.id);
      return {
        text: askQuestionJson("Что своё?", undefined, c00SignalFor("wrong_speaker", "correct_thought", user.id, state.revision)),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );
  const staleAfterCorr = await listScriptWorkspace(draftReel.reel.id);
  assert.equal(staleAfterCorr.draftStale, true);
  const kept = await keepCurrentScript(draftReel.reel.id, {
    draftId: staleAfterCorr.draft!.id,
    expectedSaveToken: staleAfterCorr.draft!.saveToken,
  });
  assert.equal(kept.draftStale, false);
  await sendDialogueMessage(
    draftReel.reel.id,
    { text: "И это тоже не я.", idempotencyKey: "v05-keep-corr-2" },
    async () => {
      const user = await prisma.dialogueMessage.findFirstOrThrow({
        where: { thread: { reelId: draftReel.reel.id }, role: "user", body: "И это тоже не я." },
      });
      const state = await getThoughtState(draftReel.reel.id);
      return {
        text: askQuestionJson("Что своё теперь?", undefined, c00SignalFor("author_negation", "correct_thought", user.id, state.revision)),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );
  const staleAgain = await listScriptWorkspace(draftReel.reel.id);
  assert.equal(staleAgain.draftStale, true);

  await keepCurrentScript(draftReel.reel.id, {
    draftId: staleAgain.draft!.id,
    expectedSaveToken: staleAgain.draft!.saveToken,
  });
  const patched = await patchScriptDraft(draftReel.reel.id, {
    body: "правка после keep",
    expectedUpdatedAt: staleAgain.draft!.updatedAt,
    expectedSaveToken: staleAgain.draft!.saveToken,
  });
  const keepRow = await prisma.aiCall.findUniqueOrThrow({ where: { turnKey: draftKeepTurnKey(draftReel.reel.id) } });
  const keepSnap = parseV05GenerateSnapshot(keepRow.inputSnapshotJson);
  assert.equal(
    draftKeepApplicable(keepSnap, { id: patched.draft!.id, saveToken: patched.draft!.saveToken }, {
      thoughtStateRevision: (await getThoughtState(draftReel.reel.id)).revision,
      workingTakeId: draftReel.reel.workingTakeId,
      selectedTranscriptId: null,
      lastUserMessageId: null,
      lastCorrectionAcceptedAt: null,
    }),
    false,
  );

  await deleteScriptDraft(draftReel.reel.id);
  const created = await replaceScriptDraft(draftReel.reel.id, { body: "новый черновик" });
  assert.notEqual(created.id, draft.id);
  assert.equal(draftKeepApplicable(keepSnap, { id: created.id, saveToken: created.saveToken }, {
    thoughtStateRevision: 0,
    workingTakeId: null,
    selectedTranscriptId: null,
    lastUserMessageId: null,
    lastCorrectionAcceptedAt: null,
  }), false);

  await keepCurrentScript(reel.id, { versionId: first.viewing!.id });
  const versionAfterDraftKeep = await prisma.scriptVersion.findFirstOrThrow({ where: { id: first.viewing!.id } });
  await keepCurrentScript(reel.id, { draftId: (await replaceScriptDraft(reel.id, { body: "черновик на версии" })).id, expectedSaveToken: (await listScriptWorkspace(reel.id)).draft!.saveToken });
  const versionAfter = await prisma.scriptVersion.findFirstOrThrow({ where: { id: first.viewing!.id } });
  assert.equal(versionAfter.inputSnapshotJson, versionAfterDraftKeep.inputSnapshotJson);
  assert.ok(versionKeepBefore);
});
