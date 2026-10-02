import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { runWithOwner } from "../src/lib/auth/session";
import { createTake, getReel, updateReel, ReelError } from "../src/lib/reels";
import { createThoughtFromText } from "../src/lib/thought-create";
import { saveManualScript } from "../src/lib/scripts";
import { createEditedRevision, ensureOriginalFromText, listTranscriptBundle, saveOriginalIfAbsent, selectTranscriptRevision } from "../src/lib/transcripts";
import { buildThoughtMaterialContext, sendDialogueMessage } from "../src/lib/dialogue";
import { exportCanonicalTxt } from "../src/lib/export-reel";
import { StateVersionError } from "../src/lib/ai/usage-guard";
import { v01TestSeams } from "../src/lib/v01-test-seams";
import { AgentActionError } from "../src/lib/agent-action";

test("V06 ready media take becomes working; late STT, manual choice, reprocess, completed stay put", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { reel } = await createThoughtFromText({
    title: "V06 working",
    body: "Исходная текстовая мысль UNIQUE_ORIGIN",
    idempotencyKey: "v06-work-origin",
  });
  const originId = reel.workingTakeId;
  assert.ok(originId);

  const older = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "old.webm" });
  const newer = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "new.webm" });
  assert.equal((await getReel(reel.id))?.workingTakeId, originId);

  const whileStt = await sendDialogueMessage(
    reel.id,
    { text: "Пока ждём расшифровку, что уже ясно?", idempotencyKey: "v06-stt-wait" },
    async () => ({
      text: JSON.stringify({
        action: "ask_question",
        question: "Какой момент исходной мысли главный?",
        clarificationReason: "нужно уточнить акцент",
        whyUnknown: "в исходном тексте нет одного выделенного акцента",
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  assert.equal((await getReel(reel.id))?.workingTakeId, originId);
  assert.ok(whileStt.messages.some((row) => row.role === "assistant"));
  const waitingPrompt = await buildThoughtMaterialContext(reel.id);
  assert.match(waitingPrompt, /UNIQUE_ORIGIN/);
  assert.equal(waitingPrompt.includes(`Рабочий дубль: ${newer.id}`), false);

  await saveOriginalIfAbsent(newer.id, { text: "Новый дубль UNIQUE_NEW", source: "stt" });
  assert.equal((await getReel(reel.id))?.workingTakeId, newer.id);

  await saveOriginalIfAbsent(older.id, { text: "Старый дубль UNIQUE_OLD", source: "stt" });
  assert.equal((await getReel(reel.id))?.workingTakeId, newer.id);

  await saveOriginalIfAbsent(newer.id, { text: "Новый дубль UNIQUE_NEW", source: "stt" });
  assert.equal((await getReel(reel.id))?.workingTakeId, newer.id);

  const third = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "third.webm" });
  await updateReel(reel.id, { workingTakeId: originId! });
  await saveOriginalIfAbsent(third.id, { text: "Третий UNIQUE_THIRD", source: "stt" });
  assert.equal((await getReel(reel.id))?.workingTakeId, originId);

  await updateReel(reel.id, { finalTakeId: originId });
  const completed = await updateReel(reel.id, { status: "completed" });
  assert.equal(completed.status, "completed");
  const late = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "late.webm" });
  await saveOriginalIfAbsent(late.id, { text: "После завершения", source: "stt" });
  const afterComplete = await getReel(reel.id);
  assert.equal(afterComplete?.workingTakeId, originId);
  assert.equal(afterComplete?.status, "completed");
});

test("V06 prompt uses selected transcript not script; revision conflict 409; sufficient stays V03", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(async () => {
    v01TestSeams.afterWorkingTakeRead = null;
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { reel } = await createThoughtFromText({
    title: "V06 prompt",
    body: "ORIGIN_MARKER",
    idempotencyKey: "v06-prompt",
  });
  const script = await saveManualScript(reel.id, {
    body: "SCRIPT_MARKER не произнесён",
    sources: [],
    expectedHeadId: null,
  });
  assert.ok(script.headId);
  const take = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "p.webm" });
  const original = await saveOriginalIfAbsent(take.id, { text: "SPOKEN_MARKER произнесено", source: "stt" });
  assert.ok(original);
  const prompt = await buildThoughtMaterialContext(reel.id);
  assert.match(prompt, /SPOKEN_MARKER/);
  assert.equal(prompt.includes("SCRIPT_MARKER"), false);
  assert.match(prompt, new RegExp(`Рабочий дубль: ${take.id}`));

  v01TestSeams.afterWorkingTakeRead = async () => {
    await createEditedRevision(take.id, "CHANGED_REVISION");
  };
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "разбери дубль", idempotencyKey: "v06-409" }, async () => ({
        text: JSON.stringify({
          action: "ask_question",
          question: "Что главное?",
          clarificationReason: "нужно уточнить",
          whyUnknown: "в тексте нет ответа",
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    (error: unknown) => error instanceof StateVersionError,
  );

  const textThought = await createThoughtFromText({
    title: "V06 text sufficient",
    body: "Только текст.",
    idempotencyKey: "v06-text-suf",
  });
  await assert.rejects(
    () =>
      sendDialogueMessage(textThought.reel.id, { text: "хватит", idempotencyKey: "v06-suf-text" }, async () => ({
        text: JSON.stringify({
          action: "content_sufficient",
          checkedInTranscript: "весь текст",
          whyNoGaps: "исходник достаточен",
        }),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    (error: unknown) => error instanceof AgentActionError && error.code === "ACTION_NOT_ALLOWED",
  );
});

test("V06 completion without script; export is final revision; reopen; owner; drafts kept", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { reel } = await createThoughtFromText({
    title: "V06 complete UNIQUE_TITLE",
    body: "FINAL_TEXT_UNIQUE исходник",
    idempotencyKey: "v06-complete",
  });
  const origin = reel.takes[0];
  assert.ok(origin);
  const script = await saveManualScript(reel.id, {
    body: "DRAFT_SCRIPT_KEEP",
    sources: [],
    expectedHeadId: null,
  });
  const scriptsBefore = await prisma.scriptVersion.count({ where: { reelId: reel.id } });
  const draftsBefore = await prisma.scriptDraft.count({ where: { reelId: reel.id } });

  await assert.rejects(() => updateReel(reel.id, { status: "completed" }), (err: unknown) => {
    return err instanceof ReelError && err.code === "COMPLETE_INCOMPLETE";
  });

  const emptyAudio = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "empty.webm" });
  await updateReel(reel.id, { finalTakeId: emptyAudio.id });
  await assert.rejects(() => updateReel(reel.id, { status: "completed" }), (err: unknown) => {
    return err instanceof ReelError && err.code === "COMPLETE_INCOMPLETE";
  });

  await updateReel(reel.id, { finalTakeId: origin.id });
  const completed = await updateReel(reel.id, { status: "completed" });
  assert.equal(completed.status, "completed");
  assert.equal(completed.finalTakeId, origin.id);

  const exported = await exportCanonicalTxt(reel.id);
  assert.match(exported.text, /Итоговый текст/);
  assert.match(exported.text, /FINAL_TEXT_UNIQUE/);
  assert.equal(exported.text.includes("DRAFT_SCRIPT_KEEP"), false);

  await assert.rejects(() => updateReel(reel.id, { finalTakeId: emptyAudio.id }), (err: unknown) => {
    return err instanceof ReelError && err.code === "NEED_REOPEN";
  });
  const originBundle = await listTranscriptBundle(origin.id);
  await assert.rejects(() => selectTranscriptRevision(origin.id, originBundle.selectedId!), (err: unknown) => {
    return err instanceof ReelError && err.code === "NEED_REOPEN";
  });

  const reopened = await updateReel(reel.id, { status: "in_progress" });
  assert.equal(reopened.status, "in_progress");
  const other = await createTake(reel.id, { inputType: "text", bodyText: "Второй итог UNIQUE_SECOND" });
  await ensureOriginalFromText(other.id, "Второй итог UNIQUE_SECOND");
  const swapped = await updateReel(reel.id, { finalTakeId: other.id });
  assert.equal(swapped.finalTakeId, other.id);
  const completedAgain = await updateReel(reel.id, { status: "completed" });
  assert.equal(completedAgain.status, "completed");
  const exported2 = await exportCanonicalTxt(reel.id);
  assert.match(exported2.text, /UNIQUE_SECOND/);

  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id } }), scriptsBefore);
  assert.equal(await prisma.scriptDraft.count({ where: { reelId: reel.id } }), draftsBefore);

  await runWithOwner({ id: "user-b", email: "b@test" }, async () => {
    assert.equal(await getReel(reel.id), null);
    await assert.rejects(() => exportCanonicalTxt(reel.id), (err: unknown) => {
      return err instanceof ReelError && err.code === "REEL_NOT_FOUND";
    });
  });
});
