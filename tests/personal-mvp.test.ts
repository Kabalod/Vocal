import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { createAppBackup, restoreAppBackup, sha256File } from "../src/lib/backup";

test("personal MVP cycle, export, compare, backup restore, failures", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-mvp-"));
  const { prisma, url } = await withPostgresTestDb(t);
    process.env.VOCAL_STORAGE_ROOT = dir;
    t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows */
    }
  });

  const { createReel, createTake, getReel, updateReel } = await import("../src/lib/reels");
  const { ensureOriginalFromText, createEditedRevision } = await import("../src/lib/transcripts");
  const { saveProfile } = await import("../src/lib/profile");
  const { saveReelContext } = await import("../src/lib/reel-context");
  const { createTakeReview } = await import("../src/lib/ai/review");
  const { listReelQuestions, updateQuestion } = await import("../src/lib/ai/questions");
  const { saveManualScript } = await import("../src/lib/scripts");
  const { createReelComparison } = await import("../src/lib/ai/compare");
  const { previewTextDiff } = await import("../src/lib/compare");
  const { exportReel, assertExportSafe } = await import("../src/lib/export-reel");
  const { CompareError } = await import("../src/lib/compare");

  await saveProfile({
    fields: [{ id: "whyRecord", text: "вымышленный автор теста пьёт чай", usage: "in_text" }],
  });
  const ideaA = await createReel({ title: "Идея про чай", initialNote: "подоконник" });
  const ideaB = await createReel({ title: "Вторая идея про кружку" });
  assert.notEqual(ideaA.id, ideaB.id);

  await saveReelContext(ideaA.id, { reelGoal: "спокойный ролик", selectedKeys: ["whyRecord"] });
  const take1 = await createTake(ideaA.id, {
    inputType: "text",
    bodyText: "Вымышленный чай остыл на подоконнике.",
  });
  await ensureOriginalFromText(take1.id, take1.bodyText);
  const take2 = await createTake(ideaA.id, {
    inputType: "text",
    bodyText: "Вымышленный чай остыл. Хочется говорить спокойно.",
  });
  await ensureOriginalFromText(take2.id, take2.bodyText);
  const edited = await createEditedRevision(take2.id, "Вымышленный чай остыл. Хочется говорить спокойно и короче.");

  const review = await createTakeReview(take1.id, {}, async () => ({
    text: JSON.stringify({
      authorThought: "Чай остыл.",
      modelSuggestion: "Можно начать с подоконника.",
      quotes: [{ text: "чай остыл" }],
      keep: ["подоконник"],
      missing: [],
      notInText: [],
      insufficientMaterial: false,
      questions: ["Зачем вам этот чай?"],
    }),
  }));
  assert.equal(review.status, "done");
  const questions = await listReelQuestions(ideaA.id);
  await updateQuestion(questions[0].id, { text: "Чтобы согреться вымышленно." });

  const script = await saveManualScript(ideaA.id, {
    body: "Черновик сценария про чай.",
    expectedHeadId: null,
    sources: (await (await import("../src/lib/scripts")).listAvailableSources(ideaA.id))
      .filter((item) => item.type === "note" || item.type === "transcript")
      .map((item) => ({ type: item.type, id: item.id })),
  });
  const editedScript = await saveManualScript(ideaA.id, {
    body: "Черновик сценария про чай. Правка вручную.",
    expectedHeadId: script.headId,
  });
  const take3 = await createTake(ideaA.id, {
    inputType: "text",
    bodyText: "Запись по сценарию про чай.",
    scriptVersionId: editedScript.headId ?? undefined,
  });
  await ensureOriginalFromText(take3.id, take3.bodyText);
  assert.equal(take3.scriptVersionId, editedScript.headId);

  const preview = await previewTextDiff(ideaA.id, { leftTakeId: take1.id, rightTakeId: take2.id });
  assert.equal(preview.textDiff.note.includes("не оценка качества"), true);

  const textOnly = await createReelComparison(ideaA.id, {
    leftTakeId: take1.id,
    rightTakeId: take2.id,
    leftTranscriptId: preview.left.transcriptId,
    rightTranscriptId: edited.selectedId,
    runAi: false,
  });
  assert.equal(textOnly.semantic, null);
  assert.equal("preferredTake" in textOnly, false);

  const semantic = await createReelComparison(
    ideaA.id,
    {
      leftTakeId: take1.id,
      rightTakeId: take2.id,
      intent: "сделать спокойнее",
      runAi: true,
    },
    async () => ({
      text: JSON.stringify({
        thoughtPreserved: true,
        intentMet: true,
        notes: "Темп спокойнее.",
        leftOnly: ["подоконник"],
        rightOnly: ["короче"],
        inventedIdeas: [],
      }),
    }),
  );
  assert.equal(semantic.semantic?.thoughtPreserved, true);
  assert.equal(semantic.semantic && "winner" in semantic.semantic, false);

  await assert.rejects(
    () =>
      createReelComparison(
        ideaA.id,
        { leftTakeId: take1.id, rightTakeId: take2.id, runAi: true },
        async () => ({ text: "не json" }),
      ),
    (error: unknown) => error instanceof CompareError && error.code === "LLM_INVALID",
  );

  const otherTake = await createTake(ideaB.id, { inputType: "text", bodyText: "Чужой дубль." });
  await ensureOriginalFromText(otherTake.id, otherTake.bodyText);
  await assert.rejects(
    () => createReelComparison(ideaA.id, { leftTakeId: take1.id, rightTakeId: otherTake.id, runAi: false }),
    (error: unknown) => error instanceof CompareError && error.code === "TAKE_NOT_IN_REEL",
  );

  const final = await updateReel(ideaA.id, { selectedTakeId: take2.id, expectedUpdatedAt: (await getReel(ideaA.id))?.updatedAt });
  assert.equal(final.selectedTakeId, take2.id);

  await resetPrismaClient();
  const afterRestart = await getReel(ideaA.id);
  assert.equal(afterRestart?.takes.length, 3);
  const bundle = await (await import("../src/lib/scripts")).listScriptBundle(ideaA.id);
  assert.equal(bundle.versions.length >= 2, true);
  const qs = await listReelQuestions(ideaA.id);
  assert.equal(qs[0].answers.at(-1)?.text.includes("согреться"), true);

  const exported = await exportReel(ideaA.id);
  assert.equal(exported.reel.selectedScriptId, editedScript.headId);
  assert.equal(exported.takes.length, 3);
  assert.equal(exported.scripts.some((row) => row.body.includes("Правка вручную")), true);
  assert.equal(exported.questions[0].answers.length >= 1, true);
  assert.equal("hiddenContext" in exported, false);
  assert.ok(!JSON.stringify(exported).includes("GROQ_API_KEY"));
  assertExportSafe(exported);
  const withHidden = await exportReel(ideaA.id, { includeHiddenContext: true });
  assert.equal("hiddenContext" in withHidden, true);

  const mediaDir = path.join(dir, "storage", "videos");
  mkdirSync(mediaDir, { recursive: true });
  const mediaFile = path.join(mediaDir, "take-fake.mp4");
  writeFileSync(mediaFile, "fake-video");
  const backupDir = path.join(dir, "backup");
  const isolated = path.join(dir, "restored");
  await createAppBackup({ destDir: backupDir, cwd: dir, databaseUrl: url });
  await restoreAppBackup({ fromDir: backupDir, toDir: isolated });
  const restoredMedia = path.join(isolated, "storage", "videos", "take-fake.mp4");
  assert.equal(await sha256File(restoredMedia), await sha256File(mediaFile));
  assert.notEqual(path.resolve(isolated), path.resolve(dir));

  await createTakeReview(
    take1.id,
    {},
    async () => {
      throw new Error("сеть недоступна");
    },
  ).catch(() => undefined);
  const stillThere = await getReel(ideaA.id);
  assert.equal(stillThere?.takes.length, 3);
});
