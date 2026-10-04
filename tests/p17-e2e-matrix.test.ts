import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { runtimePortraitFields } from "../src/lib/ai-runtime-context";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { jobDeepLinkHref, legacyHistoryHref, legacyUserRedirect } from "../src/lib/legacy-routes";
import { markJobFailed } from "../src/lib/jobs";
import { readStoredProfilePayload } from "../src/lib/profile";
import { v04ReplaceExplicitJson } from "./helpers/v04-profile-reply";
import {
  finalsStayIndependent,
  scriptlessRecordingAllowed,
  unfinishedAmendPublishesPortrait,
} from "../src/lib/product-contracts";
import { studioRecordGate } from "../src/lib/recording-session";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function src(rel: string) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

test("P17 matrix: history/jobs redirects, record gate, no A/B studio UI", () => {
  assert.equal(legacyHistoryHref(), "/reels");
  assert.equal(legacyUserRedirect("/history"), "/reels");
  assert.equal(jobDeepLinkHref("job-1"), "/reels/job-1?tab=takes");
  assert.match(src("src/app/history/page.tsx"), /redirect\(legacyHistoryHref\(\)\)/);
  assert.match(src("src/app/jobs/[id]/page.tsx"), /jobDeepLinkHref/);
  assert.equal(scriptlessRecordingAllowed(), true);
  assert.equal(studioRecordGate({ hasReadyScript: false, hasDraft: false }), "ok");
  assert.equal(studioRecordGate({ hasReadyScript: true, hasDraft: false }), "ok");
  assert.equal(studioRecordGate({ hasReadyScript: true, hasDraft: true }), "draft-open");
  assert.match(src("src/components/RecordingView.tsx"), /Начать запись/);
  assert.doesNotMatch(src("src/components/RecordingView.tsx"), /<ThoughtDialogue/);
  assert.match(src("src/components/ReelStudio.tsx"), /AutoTakeCompare/);
  assert.doesNotMatch(src("src/components/ThoughtDialogue.tsx"), /Перенести в сценарий/);
  assert.equal(unfinishedAmendPublishesPortrait([]), false);
});

test("P17 matrix: thought without profile through finals, upload, compare, export, portrait", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-p17-"));
  const storage = path.join(dir, "storage");
  mkdirSync(storage, { recursive: true });
  const { prisma } = await withPostgresTestDb(t);
    process.env.VOCAL_STORAGE_ROOT = storage;
  process.env.VOCAL_SKIP_JOB_ENQUEUE = "1";
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
    t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
    delete process.env.VOCAL_SKIP_JOB_ENQUEUE;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  });

  const { getProfileWorkspace } = await import("../src/lib/profile-dialogue");
  const { listReels, updateReel, getReel, createTake } = await import("../src/lib/reels");
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { listDialoguePage, sendDialogueMessage, sendDialogueVoice, transferDialogueProposal, DialogueError } =
    await import("../src/lib/dialogue");
  const { askQuestionJson, insertTestScriptProposal } = await import("./helpers/agent-action-json");
  const { patchScriptDraft, finalizeScriptDraft, setFinalScript, listScriptWorkspace } =
    await import("../src/lib/scripts");
  const { saveOriginalIfAbsent } = await import("../src/lib/transcripts");
  const { createReelComparison, ensureAutomaticTakeComparison } = await import("../src/lib/ai/compare");
  const { exportCanonicalTxt } = await import("../src/lib/export-reel");
  const {
    startProfileDialogue,
    sendProfileMessage,
    supplementProfileDialogue,
    skipProfileDialogue,
  } = await import("../src/lib/profile-dialogue");
  const { POST: upload } = await import("../src/app/api/uploads/route");

  const idleProfile = await getProfileWorkspace();
  assert.equal(idleProfile.phase, "idle");
  assert.equal(idleProfile.portrait, null);
  assert.equal((await listReels({ status: "all", sort: "updated" })).reels.length, 0);

  const { reel, created } = await createThoughtFromText({
    title: "P17 мысль",
    body: "Исходная мысль без профиля.",
    idempotencyKey: "p17-thought-1",
  });
  assert.equal(created, true);
  assert.equal((await listReels({ status: "all", sort: "updated" })).reels.length, 1);
  const originTake = (await getReel(reel.id))!.takes[0];
  assert.equal(originTake.inputType, "text");

  const dialogue = await sendDialogueMessage(
    reel.id,
    { text: "Сделать короче и яснее.", idempotencyKey: "p17-dlg-1" },
    async () => ({
      text: askQuestionJson("Какой момент главный?"),
      usage: { promptTokens: 6, completionTokens: 4 },
    }),
  );
  const proposal = await insertTestScriptProposal(prisma, dialogue.threadId, "Говорю коротко: мысль без профиля.");
  assert.ok(proposal);

  const takesBeforeVoice = await prisma.take.count({ where: { reelId: reel.id } });
  const voice = await sendDialogueVoice(
    reel.id,
    { file: new File(["x"], "reply.webm", { type: "audio/webm" }), idempotencyKey: "p17-voice-1" },
    async () => ({
      text: askQuestionJson("Понял голосовой ответ."),
      usage: { promptTokens: 2, completionTokens: 2 },
    }),
    async () => ({ text: "Главное — ясность", segments: [], model: "mock" }),
    async () => undefined,
  );
  assert.ok((await listDialoguePage(reel.id)).messages.length >= voice.messages.length);
  assert.equal(await prisma.take.count({ where: { reelId: reel.id } }), takesBeforeVoice);
  assert.ok(voice.messages.some((item) => item.role === "user"));

  await assert.rejects(
    () => transferDialogueProposal(reel.id, proposal.id),
    (error: unknown) => error instanceof DialogueError && error.status === 410,
  );
  const { openScriptDraft } = await import("../src/lib/scripts");
  const afterTransfer = await openScriptDraft(reel.id);
  assert.ok(afterTransfer.draft);

  assert.equal(studioRecordGate({ hasReadyScript: false, hasDraft: true }), "draft-open");

  const patched = await patchScriptDraft(reel.id, {
    body: "Говорю коротко: мысль без профиля. Ясность важнее украшений.",
    expectedUpdatedAt: afterTransfer.draft!.updatedAt,
    expectedSaveToken: afterTransfer.draft!.saveToken,
  });
  const finalized = await finalizeScriptDraft(reel.id, {
    expectedUpdatedAt: patched.draft!.updatedAt,
    expectedSaveToken: patched.draft!.saveToken,
  });
  assert.ok(finalized.viewing?.body.includes("ясность") || finalized.viewing?.body.includes("Ясность"));
  assert.equal(studioRecordGate({ hasReadyScript: true, hasDraft: false }), "ok");
  assert.equal(studioRecordGate({ hasReadyScript: false, hasDraft: false }), "ok");

  const form = new FormData();
  form.set("file", new File([Buffer.from("0123456789abcdef")], "clip.mp4", { type: "video/mp4" }));
  form.set("reelId", reel.id);
  form.set("inputType", "video");
  form.set("process", "1");
  form.set("idempotencyKey", "p17-upload-1");
  const uploaded = await upload(
    new Request("http://vocal.local/api/uploads", {
      method: "POST",
      headers: { "Idempotency-Key": "p17-upload-1" },
      body: form,
    }),
  );
  assert.equal(uploaded.status, 201);
  const uploadJson = (await uploaded.json()) as { take: { id: string }; job?: { id: string } };
  assert.ok(uploadJson.take.id);
  assert.ok(uploadJson.job?.id);
  await markJobFailed(uploadJson.job!.id, "STT", "Не удалось расшифровать. Нажмите «Повторить».");
  const failed = await prisma.job.findUniqueOrThrow({ where: { id: uploadJson.job!.id } });
  assert.equal(failed.status, "error");
  const retried = await prisma.job.update({
    where: { id: failed.id },
    data: { status: "queued", errorCode: null, errorMessage: null, leaseUntil: null, leaseOwner: null },
  });
  assert.equal(retried.status, "queued");
  const reloaded = await prisma.job.findUniqueOrThrow({ where: { id: retried.id } });
  assert.equal(reloaded.status, "queued");
  assert.equal(reloaded.errorMessage, null);

  await saveOriginalIfAbsent(originTake.id, { text: "Исходная мысль без профиля.", source: "manual" });
  const second = await createTake(reel.id, {
    inputType: "text",
    bodyText: "Второй дубль короче.",
    idempotencyKey: "p17-take-2",
  });
  await saveOriginalIfAbsent(second.id, { text: "Второй дубль короче.", source: "manual" });
  const compared = await createReelComparison(
    reel.id,
    { leftTakeId: originTake.id, rightTakeId: second.id, runAi: false },
    async () => {
      throw new Error("auto semantic compare is retired");
    },
  );
  assert.equal(compared.leftTakeId, originTake.id);
  assert.equal(compared.rightTakeId, second.id);
  const again = await ensureAutomaticTakeComparison(reel.id, async () => {
    throw new Error("should not start semantic compare");
  });
  assert.equal(again?.id, compared.id);

  const beforeFinals = { finalTakeId: null as string | null, finalScriptId: null as string | null };
  await updateReel(reel.id, { finalTakeId: second.id });
  const afterTake = await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } });
  assert.equal(
    finalsStayIndependent({
      before: beforeFinals,
      after: { finalTakeId: afterTake.finalTakeId, finalScriptId: afterTake.finalScriptId },
      changed: "take",
    }),
    true,
  );
  await setFinalScript(reel.id, finalized.viewing!.id);
  const afterScript = await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } });
  assert.equal(afterScript.finalTakeId, second.id);
  assert.equal(afterScript.finalScriptId, finalized.viewing!.id);
  await updateReel(reel.id, { finalTakeId: originTake.id });
  const swappedTake = await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } });
  assert.equal(swappedTake.finalScriptId, finalized.viewing!.id);
  assert.equal(swappedTake.finalTakeId, originTake.id);

  const exported = await exportCanonicalTxt(reel.id);
  assert.match(exported.filename, /\.txt$/);
  assert.match(exported.text, /P17 мысль/);
  assert.match(exported.text, /Итоговый текст/);
  assert.match(exported.text, /Исходная мысль без профиля/);
  assert.equal(exported.text.includes("Говорю коротко"), false);
  assert.doesNotMatch(exported.text, /promptText|api[_-]?key/i);

  await startProfileDialogue();
  await sendProfileMessage(
    { text: "Говорю своими словами.", idempotencyKey: "p17-prof-1" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return {
        text: v04ReplaceExplicitJson([user.id], "blog_goal", "своими словами"),
        usage: { promptTokens: 2, completionTokens: 2 },
      };
    },
  );
  const waiting = await getProfileWorkspace();
  assert.equal(waiting.awaitingConfirm, false);
  assert.equal(waiting.portrait?.completed, true);
  const confirmed = waiting;
  assert.equal(confirmed.portrait?.completed, true);
  await supplementProfileDialogue();
  await sendProfileMessage(
    { text: "Для коллег.", idempotencyKey: "p17-prof-2" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return {
        text: v04ReplaceExplicitJson([user.id], "general_audience", "коллеги"),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );
  const amending = await getProfileWorkspace();
  assert.equal(amending.awaitingConfirm, false);
  assert.ok(amending.portrait?.sections.some((section) => /коллеги/.test(section.text)));
  const storedAmend = await readStoredProfilePayload();
  assert.equal(runtimePortraitFields(storedAmend).find((field) => field.id === "audience")?.text, "коллеги");
  await skipProfileDialogue();
  const cancelled = await getProfileWorkspace();
  assert.equal(cancelled.phase, "portrait");
  assert.equal(cancelled.profile.fields.find((field) => field.id === "audience")?.text, "коллеги");
});
