import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetV05TestSeams } from "../src/lib/v05-test-seams";
import { askQuestionJson, c00SignalFor } from "./helpers/agent-action-json";

test("V05 fact correction excludes only the corrected source, not later takes or other transcripts", async (t) => {
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
  const { collectV05SourceTexts, generateV05Script } = await import("../src/lib/v05-script");
  const { sendDialogueMessage, ensureReelThread } = await import("../src/lib/dialogue");
  const { createTake } = await import("../src/lib/reels");
  const { ensureOriginalFromText } = await import("../src/lib/transcripts");

  const t1Meaning = "Старый смысл T1: я украл чужой отпуск в Сочи.";
  const t2Meaning = "Независимый дубль T2: утром пью свой чай.";
  const { reel } = await createThoughtFromText({
    title: "Scope retract T1",
    body: t1Meaning,
    idempotencyKey: "v05-scope-t1",
  });
  const take1 = await prisma.take.findFirstOrThrow({ where: { reelId: reel.id } });
  const transcript1 = await prisma.transcriptRevision.findFirstOrThrow({ where: { takeId: take1.id } });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      facts: [
        {
          id: "fact_t1",
          text: t1Meaning,
          sourceType: "transcript_revision",
          sourceId: transcript1.id,
        },
      ],
    },
  });

  await sendDialogueMessage(
    reel.id,
    { text: "Это сказал оператор, не я.", idempotencyKey: "v05-scope-retract-t1" },
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
            targetId: "fact_t1",
            operation: "clear_slot",
          }),
        ),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );

  const afterRetract = await getThoughtState(reel.id);
  assert.equal(afterRetract.facts.some((fact) => fact.id === "fact_t1"), false);
  const afterT1 = await collectV05SourceTexts(reel.id);
  assert.equal(afterT1.texts.some((item) => item.text.includes(t1Meaning)), false);
  assert.equal(afterT1.keys.includes(`transcript:${transcript1.id}`), false);

  const take2 = await createTake(reel.id, {
    inputType: "text",
    bodyText: t2Meaning,
    idempotencyKey: "v05-scope-t2",
  });
  const transcript2 = await ensureOriginalFromText(take2.id, t2Meaning);
  assert.ok(transcript2);
  await prisma.reel.update({ where: { id: reel.id }, data: { workingTakeId: take2.id } });
  await prisma.take.update({
    where: { id: take2.id },
    data: { selectedTranscriptId: transcript2.id, bodyText: t2Meaning },
  });

  const afterT2 = await collectV05SourceTexts(reel.id);
  assert.equal(afterT2.texts.some((item) => item.text.includes(t1Meaning)), false);
  assert.equal(afterT2.texts.some((item) => item.text.includes(t2Meaning)), true);
  assert.equal(afterT2.keys.includes(`transcript:${transcript2.id}`), true);

  let seenPrompt = "";
  await generateV05Script(reel.id, { idempotencyKey: "v05-scope-t2-gen" }, async (req) => {
    seenPrompt = req.user;
    return { text: JSON.stringify({ script: "Только T2." }) };
  });
  assert.match(seenPrompt, /Независимый дубль T2/);
  assert.equal(seenPrompt.includes(t1Meaning), false);

  const dialogueMeaning = "Факт из реплики: люблю горький шоколад.";
  const transcriptMeaning = "Выбранная расшифровка про осенний дождь.";
  const dialogueReel = await createThoughtFromText({
    title: "Scope dialogue fact",
    body: transcriptMeaning,
    idempotencyKey: "v05-scope-dialogue",
  });
  const dialogueTake = await prisma.take.findFirstOrThrow({ where: { reelId: dialogueReel.reel.id } });
  const dialogueTranscript = await prisma.transcriptRevision.findFirstOrThrow({ where: { takeId: dialogueTake.id } });
  const thread = await ensureReelThread(dialogueReel.reel.id);
  const factMessage = await prisma.dialogueMessage.create({
    data: { threadId: thread.id, role: "user", kind: "text", body: dialogueMeaning },
  });
  await applyThoughtState({
    reelId: dialogueReel.reel.id,
    expectedRevision: 0,
    patch: {
      facts: [
        {
          id: "fact_dialogue",
          text: dialogueMeaning,
          sourceType: "dialogue_message",
          sourceId: factMessage.id,
        },
      ],
    },
  });
  await sendDialogueMessage(
    dialogueReel.reel.id,
    { text: "Это не про шоколад.", idempotencyKey: "v05-scope-retract-dialogue" },
    async () => {
      const user = await prisma.dialogueMessage.findFirstOrThrow({
        where: { thread: { reelId: dialogueReel.reel.id }, role: "user", body: "Это не про шоколад." },
        orderBy: { createdAt: "desc" },
      });
      const state = await getThoughtState(dialogueReel.reel.id);
      return {
        text: askQuestionJson(
          "Что вместо этого?",
          undefined,
          c00SignalFor("author_negation", "correct_thought", user.id, state.revision, {
            targetKind: "fact",
            targetId: "fact_dialogue",
            operation: "clear_slot",
          }),
        ),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );
  const afterDialogue = await collectV05SourceTexts(dialogueReel.reel.id);
  assert.equal(afterDialogue.texts.some((item) => item.text.includes(dialogueMeaning)), false);
  assert.equal(afterDialogue.texts.some((item) => item.text.includes(transcriptMeaning)), true);
  assert.equal(afterDialogue.keys.includes(`transcript:${dialogueTranscript.id}`), true);

  const supersedeOld = "Старый смысл для supersede: украл чужой отпуск.";
  const supersedeNew = "исправленный факт: только свой чай";
  const superReel = await createThoughtFromText({
    title: "Scope supersede",
    body: supersedeOld,
    idempotencyKey: "v05-scope-supersede",
  });
  const superTake = await prisma.take.findFirstOrThrow({ where: { reelId: superReel.reel.id } });
  const superTranscript = await prisma.transcriptRevision.findFirstOrThrow({ where: { takeId: superTake.id } });
  await applyThoughtState({
    reelId: superReel.reel.id,
    expectedRevision: 0,
    patch: {
      facts: [
        {
          id: "fact_super",
          text: supersedeOld,
          sourceType: "transcript_revision",
          sourceId: superTranscript.id,
        },
      ],
    },
  });
  await sendDialogueMessage(
    superReel.reel.id,
    { text: supersedeNew, idempotencyKey: "v05-scope-supersede-1" },
    async () => {
      const user = await prisma.dialogueMessage.findFirstOrThrow({
        where: { thread: { reelId: superReel.reel.id }, role: "user", body: supersedeNew },
        orderBy: { createdAt: "desc" },
      });
      const state = await getThoughtState(superReel.reel.id);
      return {
        text: askQuestionJson(
          "Зафиксировал.",
          {
            fact: { text: supersedeNew, sourceType: "dialogue_message", sourceId: user.id },
            closeGapIds: [],
          },
          c00SignalFor("local_correction", "correct_thought", user.id, state.revision, {
            targetKind: "fact",
            targetId: "fact_super",
            operation: "supersede",
          }),
        ),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );
  const afterSuper = await getThoughtState(superReel.reel.id);
  assert.equal(afterSuper.facts.some((fact) => fact.id === "fact_super" && fact.text === supersedeNew), true);
  const superSources = await collectV05SourceTexts(superReel.reel.id);
  assert.equal(superSources.texts.some((item) => item.text.includes(supersedeNew)), true);
  assert.equal(superSources.texts.some((item) => item.text.includes(supersedeOld)), false);
  assert.equal(superSources.keys.includes(`transcript:${superTranscript.id}`), false);
  const t1Unchanged = await prisma.transcriptRevision.findUniqueOrThrow({ where: { id: transcript1.id } });
  assert.equal(t1Unchanged.text, t1Meaning);
  const superUnchanged = await prisma.transcriptRevision.findUniqueOrThrow({ where: { id: superTranscript.id } });
  assert.equal(superUnchanged.text, supersedeOld);
});
