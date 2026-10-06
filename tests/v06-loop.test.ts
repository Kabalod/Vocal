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
import { ExportError } from "../src/lib/canonical-export";
import { StateVersionError } from "../src/lib/ai/usage-guard";
import { v01TestSeams } from "../src/lib/v01-test-seams";
import { AgentActionError } from "../src/lib/agent-action";
import { applyThoughtMediaFromTranscript } from "../src/lib/thought-media";
import { getArchiveThoughtPreview } from "../src/lib/archive-preview";
import { V06_AUTO_WORK_KIND, v06TestSeams } from "../src/lib/v06-working-take";

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
  const scriptsBefore = await prisma.scriptVersion.count({ where: { reelId: reel.id, kind: { not: "from_take" } } });
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

  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id, kind: { not: "from_take" } } }), scriptsBefore);
  assert.equal(await prisma.scriptDraft.count({ where: { reelId: reel.id } }), draftsBefore);

  await runWithOwner({ id: "user-b", email: "b@test" }, async () => {
    assert.equal(await getReel(reel.id), null);
    await assert.rejects(() => exportCanonicalTxt(reel.id), (err: unknown) => {
      return err instanceof ReelError && err.code === "REEL_NOT_FOUND";
    });
  });
});

function holdSeam() {
  let release!: () => void;
  let arrived!: () => void;
  const ready = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    wait: async () => {
      arrived();
      await gate;
    },
    ready,
    release: () => release(),
  };
}

test("V06 auto-work follows take order, not STT order; manual same pointer supersedes", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(async () => {
    v06TestSeams.beforeAutoPromoteLock = null;
    v06TestSeams.afterAutoPromoteLocked = null;
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { reel } = await createThoughtFromText({
    title: "V06 order",
    body: "ORIGIN_ORDER",
    idempotencyKey: "v06-order",
  });
  const t2 = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "t2.webm" });
  const t3 = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "t3.webm" });

  await saveOriginalIfAbsent(t2.id, { text: "T2_FIRST", source: "stt" });
  assert.equal((await getReel(reel.id))?.workingTakeId, t2.id);
  await saveOriginalIfAbsent(t3.id, { text: "T3_AFTER", source: "stt" });
  assert.equal((await getReel(reel.id))?.workingTakeId, t3.id);

  const later = await createThoughtFromText({
    title: "V06 later first",
    body: "ORIGIN_LATER",
    idempotencyKey: "v06-later-first",
  });
  const u2 = await createTake(later.reel.id, { inputType: "audio", bodyText: "", originalName: "u2.webm" });
  const u3 = await createTake(later.reel.id, { inputType: "audio", bodyText: "", originalName: "u3.webm" });
  await saveOriginalIfAbsent(u3.id, { text: "U3_FIRST", source: "stt" });
  assert.equal((await getReel(later.reel.id))?.workingTakeId, u3.id);
  await saveOriginalIfAbsent(u2.id, { text: "U2_LATE", source: "stt" });
  assert.equal((await getReel(later.reel.id))?.workingTakeId, u3.id);

  const race = await createThoughtFromText({
    title: "V06 race pointer",
    body: "ORIGIN_RACE",
    idempotencyKey: "v06-race-pointer",
  });
  const raceOrigin = race.reel.workingTakeId!;
  const raceTake = await createTake(race.reel.id, { inputType: "audio", bodyText: "", originalName: "race.webm" });
  const hold = holdSeam();
  v06TestSeams.beforeAutoPromoteLock = () => hold.wait();
  const auto = saveOriginalIfAbsent(raceTake.id, { text: "RACE_STT", source: "stt" });
  await hold.ready;
  await updateReel(race.reel.id, { workingTakeId: raceOrigin });
  hold.release();
  await auto;
  assert.equal((await getReel(race.reel.id))?.workingTakeId, raceOrigin);
  const raceCas = await prisma.aiCall.findFirst({
    where: { takeId: raceTake.id, kind: V06_AUTO_WORK_KIND },
  });
  assert.equal(raceCas?.status, "error");

  const blocked = await createThoughtFromText({
    title: "V06 failed patch",
    body: "ORIGIN_FAIL_PATCH",
    idempotencyKey: "v06-fail-patch",
  });
  const failTake = await createTake(blocked.reel.id, { inputType: "audio", bodyText: "", originalName: "fail.webm" });
  await assert.rejects(() => updateReel(blocked.reel.id, { workingTakeId: "missing-take" }), (err: unknown) => {
    return err instanceof ReelError && err.code === "TAKE_NOT_IN_REEL";
  });
  await saveOriginalIfAbsent(failTake.id, { text: "FAIL_PATCH_STT", source: "stt" });
  assert.equal((await getReel(blocked.reel.id))?.workingTakeId, failTake.id);
});

test("V06 freeze is atomic with revision write vs complete", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(async () => {
    v06TestSeams.beforeRevisionWriteLock = null;
    v06TestSeams.beforeCompleteLock = null;
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { reel } = await createThoughtFromText({
    title: "V06 freeze",
    body: "FROZEN_ORIGINAL",
    idempotencyKey: "v06-freeze",
  });
  const origin = reel.takes[0]!;
  await updateReel(reel.id, { finalTakeId: origin.id });
  const before = await prisma.take.findUniqueOrThrow({
    where: { id: origin.id },
    select: { selectedTranscriptId: true, bodyText: true },
  });

  const holdEdit = holdSeam();
  v06TestSeams.beforeRevisionWriteLock = () => holdEdit.wait();
  const editLost = createEditedRevision(origin.id, "EDIT_SHOULD_LOSE");
  await holdEdit.ready;
  const completed = await updateReel(reel.id, { status: "completed" });
  assert.equal(completed.status, "completed");
  holdEdit.release();
  await assert.rejects(editLost, (err: unknown) => err instanceof ReelError && err.code === "NEED_REOPEN");
  const afterLose = await prisma.take.findUniqueOrThrow({
    where: { id: origin.id },
    select: { selectedTranscriptId: true, bodyText: true },
  });
  assert.equal(afterLose.selectedTranscriptId, before.selectedTranscriptId);
  assert.equal(afterLose.bodyText, before.bodyText);

  await updateReel(reel.id, { status: "in_progress" });
  const holdComplete = holdSeam();
  v06TestSeams.beforeCompleteLock = () => holdComplete.wait();
  const completeLater = updateReel(reel.id, { status: "completed" });
  await holdComplete.ready;
  await createEditedRevision(origin.id, "EDIT_WINS");
  holdComplete.release();
  const completedAfterEdit = await completeLater;
  assert.equal(completedAfterEdit.status, "completed");
  const bundle = await listTranscriptBundle(origin.id);
  assert.equal(bundle.revisions.find((row) => row.id === bundle.selectedId)?.text, "EDIT_WINS");
  const exported = await exportCanonicalTxt(reel.id);
  assert.match(exported.text, /EDIT_WINS/);
});

test("V06 applyThoughtMediaFromTranscript keeps edit and frozen selected revision", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { reel } = await createThoughtFromText({
    title: "V06 media apply",
    body: "MEDIA_ORIGIN",
    idempotencyKey: "v06-media-apply",
  });
  const take = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "m.webm" });
  await saveOriginalIfAbsent(take.id, { text: "SPOKEN_ORIGINAL", source: "stt" });
  const edited = await createEditedRevision(take.id, "SPOKEN_EDIT");
  await applyThoughtMediaFromTranscript(take.id, "SPOKEN_ORIGINAL");
  const afterEdit = await prisma.take.findUniqueOrThrow({
    where: { id: take.id },
    select: { selectedTranscriptId: true },
  });
  assert.equal(afterEdit.selectedTranscriptId, edited.selectedId);

  await updateReel(reel.id, { finalTakeId: take.id, workingTakeId: take.id });
  await updateReel(reel.id, { status: "completed" });
  await applyThoughtMediaFromTranscript(take.id, "SPOKEN_ORIGINAL");
  const frozen = await prisma.take.findUniqueOrThrow({
    where: { id: take.id },
    select: { selectedTranscriptId: true },
  });
  assert.equal(frozen.selectedTranscriptId, edited.selectedId);
  assert.equal((await getReel(reel.id))?.status, "completed");
  assert.equal((await getReel(reel.id))?.workingTakeId, take.id);

  const fresh = await createThoughtFromText({
    title: "V06 first original",
    body: "FIRST_ORIGIN_TEXT",
    idempotencyKey: "v06-first-original",
  });
  const originWorking = fresh.reel.workingTakeId!;
  const first = await createTake(fresh.reel.id, { inputType: "audio", bodyText: "", originalName: "first.webm" });
  const original = await prisma.transcriptRevision.create({
    data: { takeId: first.id, kind: "original", source: "stt", text: "FIRST_ORIGINAL" },
  });
  assert.equal((await prisma.take.findUniqueOrThrow({ where: { id: first.id } })).selectedTranscriptId, null);
  assert.equal((await getReel(fresh.reel.id))?.workingTakeId, originWorking);
  await applyThoughtMediaFromTranscript(first.id, "FIRST_ORIGINAL");
  const selected = await prisma.take.findUniqueOrThrow({
    where: { id: first.id },
    select: { selectedTranscriptId: true },
  });
  assert.equal(selected.selectedTranscriptId, original.id);
  assert.equal((await getReel(fresh.reel.id))?.workingTakeId, first.id);
  const firstCas = await prisma.aiCall.findFirst({
    where: { takeId: first.id, kind: V06_AUTO_WORK_KIND },
  });
  assert.equal(firstCas?.status, "done");
  assert.equal(JSON.parse(firstCas?.resultJson ?? "{}").promoted, true);
});

test("V06 completed export and archive preview use only selected revision", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { reel } = await createThoughtFromText({
    title: "V06 strict export",
    body: "STRICT_SELECTED",
    idempotencyKey: "v06-strict-export",
  });
  const origin = reel.takes[0]!;
  await saveManualScript(reel.id, { body: "SCRIPT_MUST_NOT_APPEAR", sources: [], expectedHeadId: null });
  await prisma.take.update({
    where: { id: origin.id },
    data: { bodyText: "BODYTEXT_MUST_NOT_APPEAR" },
  });
  await updateReel(reel.id, { finalTakeId: origin.id });
  await updateReel(reel.id, { status: "completed" });
  const exported = await exportCanonicalTxt(reel.id);
  assert.match(exported.text, /STRICT_SELECTED/);
  assert.equal(exported.text.includes("SCRIPT_MUST_NOT_APPEAR"), false);
  assert.equal(exported.text.includes("BODYTEXT_MUST_NOT_APPEAR"), false);

  const preview = await getArchiveThoughtPreview(reel.id);
  assert.match(preview.acceptedScript?.excerpt ?? "", /STRICT_SELECTED/);
  assert.equal((preview.acceptedScript?.excerpt ?? "").includes("SCRIPT_MUST_NOT_APPEAR"), false);

  const hollow = await createThoughtFromText({
    title: "V06 hollow",
    body: "HOLLOW_BODY",
    idempotencyKey: "v06-hollow",
  });
  const hollowTake = hollow.reel.takes[0]!;
  await prisma.take.update({
    where: { id: hollowTake.id },
    data: { selectedTranscriptId: null, bodyText: "HOLLOW_BODYTEXT" },
  });
  await updateReel(hollow.reel.id, { finalTakeId: hollowTake.id });
  await assert.rejects(() => updateReel(hollow.reel.id, { status: "completed" }), (err: unknown) => {
    return err instanceof ReelError && err.code === "COMPLETE_INCOMPLETE";
  });
  await prisma.reel.update({
    where: { id: hollow.reel.id },
    data: { status: "completed", finalTakeId: hollowTake.id },
  });
  await assert.rejects(() => exportCanonicalTxt(hollow.reel.id), (err: unknown) => {
    return err instanceof ExportError && err.code === "EXPORT_EMPTY";
  });
  const hollowPreview = await getArchiveThoughtPreview(hollow.reel.id);
  assert.equal(hollowPreview.acceptedScript, null);
  assert.match(hollowPreview.noScriptHint ?? "", /Итоговый текст недоступен/);
  assert.equal((hollowPreview.noScriptHint ?? "").includes("HOLLOW_BODYTEXT"), false);
});
