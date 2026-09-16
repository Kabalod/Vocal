import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import {
  P13_P16_TO_R_PHASE,
  finalsStayIndependent,
  productUserStatusLabels,
  scriptlessRecordingAllowed,
  unfinishedAmendPublishesPortrait,
} from "../src/lib/product-contracts";
import { emptyProfileFields } from "../src/types/profile";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fileUrl(dbPath: string): string {
  return `file:${dbPath.replace(/\\/g, "/")}`;
}

function migrateDeploy(url: string) {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
    shell: true,
  });
}

test("R2 keeps R1 mapping and product invariants", () => {
  assert.deepEqual(P13_P16_TO_R_PHASE, {
    P13: "R6",
    P14: "R3+R4",
    P15: "R5+R8",
    P16: "R7",
  });
  assert.deepEqual(productUserStatusLabels(), ["Не завершена", "В работе", "Успешно завершена"]);
  assert.equal(scriptlessRecordingAllowed(), true);
  assert.equal(unfinishedAmendPublishesPortrait(emptyProfileFields()), false);
});

test("R2 retries do not duplicate thought, take, message, finals or export rows", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-r2-"));
  const url = fileUrl(path.join(dir, "test.db"));
  process.env.DATABASE_URL = url;
  await resetPrismaClient();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows */
    }
  });
  migrateDeploy(url);

  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { createTake, getReel, updateReel, ReelError } = await import("../src/lib/reels");
  const { saveManualScript, setFinalScript, ScriptError } = await import("../src/lib/scripts");
  const { sendDialogueMessage, listDialoguePage } = await import("../src/lib/dialogue");
  const { exportReel } = await import("../src/lib/export-reel");

  const firstThought = await createThoughtFromText({
    title: "R2 мысль",
    body: "повтор создания не должен плодить карточки",
    idempotencyKey: "thought-r2",
  });
  const replayThought = await createThoughtFromText({
    title: "другое название",
    body: "другой текст",
    idempotencyKey: "thought-r2",
  });
  assert.equal(replayThought.created, false);
  assert.equal(replayThought.reel.id, firstThought.reel.id);
  assert.equal(await prisma.reel.count(), 1);
  assert.equal(await prisma.take.count(), 1);

  const reelId = firstThought.reel.id;
  const [takeRaceA, takeRaceB] = await Promise.all([
    createTake(reelId, { inputType: "text", bodyText: "дубль гонка", idempotencyKey: "take-r2" }),
    createTake(reelId, { inputType: "text", bodyText: "дубль гонка", idempotencyKey: "take-r2" }),
  ]);
  assert.equal(takeRaceA.id, takeRaceB.id);
  assert.equal(await prisma.take.count({ where: { reelId, idempotencyKey: "take-r2" } }), 1);

  let completeCalls = 0;
  const complete = async () => {
    completeCalls += 1;
    return {
      text: JSON.stringify({ reply: "Уточним сцену.", scriptProposal: null }),
      usage: { promptTokens: 4, completionTokens: 4 },
    };
  };
  await listDialoguePage(reelId);
  await Promise.all([
    sendDialogueMessage(reelId, { text: "Короче.", idempotencyKey: "dlg-r2" }, complete),
    sendDialogueMessage(reelId, { text: "Короче.", idempotencyKey: "dlg-r2" }, complete),
  ]);
  assert.equal(completeCalls, 1);
  assert.equal(await prisma.dialogueMessage.count({ where: { idempotencyKey: "dlg-r2" } }), 1);

  const extra = await createThoughtFromText({
    title: "R2 вкладки",
    body: "гонка итоговых дублей с одной версии карточки",
    idempotencyKey: "thought-r2-tabs",
  });
  const tabTakeA = await createTake(extra.reel.id, { inputType: "text", bodyText: "вкладка A", idempotencyKey: "tab-a" });
  const tabTakeB = await createTake(extra.reel.id, { inputType: "text", bodyText: "вкладка B", idempotencyKey: "tab-b" });
  const tabStamp = (await getReel(extra.reel.id))?.updatedAt;
  assert.ok(tabStamp);
  const tabRace = await Promise.allSettled([
    updateReel(extra.reel.id, { finalTakeId: tabTakeA.id, expectedUpdatedAt: tabStamp }),
    updateReel(extra.reel.id, { finalTakeId: tabTakeB.id, expectedUpdatedAt: tabStamp }),
  ]);
  const tabOk = tabRace.filter((row) => row.status === "fulfilled");
  const tabBad = tabRace.filter((row) => row.status === "rejected");
  assert.equal(tabOk.length, 1);
  assert.equal(tabBad.length, 1);
  assert.equal(((tabBad[0] as PromiseRejectedResult).reason as InstanceType<typeof ReelError>).code, "STALE");
  const tabStored = await getReel(extra.reel.id);
  const tabWinner = (tabOk[0] as PromiseFulfilledResult<{ finalTakeId: string | null }>).value.finalTakeId;
  assert.equal(tabStored?.finalTakeId, tabWinner);
  assert.ok(tabWinner === tabTakeA.id || tabWinner === tabTakeB.id);

  const extraA = await saveManualScript(extra.reel.id, { body: "Сценарий вкладки A", sources: [] });
  const extraB = await saveManualScript(extra.reel.id, {
    body: "Сценарий вкладки B",
    sources: [],
    expectedHeadId: extraA.headId,
  });
  assert.ok(extraA.headId && extraB.headId);
  const scriptRace = await Promise.allSettled([
    setFinalScript(extra.reel.id, extraA.headId),
    setFinalScript(extra.reel.id, extraB.headId),
  ]);
  const scriptOk = scriptRace.filter((row) => row.status === "fulfilled");
  const scriptBad = scriptRace.filter((row) => row.status === "rejected");
  assert.equal(scriptOk.length, 1);
  assert.equal(scriptBad.length, 1);
  assert.equal(((scriptBad[0] as PromiseRejectedResult).reason as InstanceType<typeof ScriptError>).code, "STALE");
  const extraScript = await getReel(extra.reel.id);
  assert.ok(extraScript?.finalScriptId === extraA.headId || extraScript?.finalScriptId === extraB.headId);

  const takeA = await createTake(reelId, { inputType: "text", bodyText: "финал A", idempotencyKey: "final-a" });
  const scriptA = await saveManualScript(reelId, { body: "Сценарий A для записи", sources: [] });
  const scriptB = await saveManualScript(reelId, {
    body: "Сценарий B для записи",
    sources: [],
    expectedHeadId: scriptA.headId,
  });
  assert.ok(scriptA.headId && scriptB.headId);

  const beforeFinals = await getReel(reelId);
  assert.ok(beforeFinals);
  const staleStamp = beforeFinals.updatedAt;

  const [takePatch, scriptPatch] = await Promise.all([
    updateReel(reelId, { finalTakeId: takeA.id, expectedUpdatedAt: staleStamp }),
    setFinalScript(reelId, scriptA.headId),
  ]);
  assert.equal(takePatch.finalTakeId, takeA.id);
  assert.equal(scriptPatch.finalScriptId, scriptA.headId);
  const afterIndependent = await getReel(reelId);
  assert.ok(afterIndependent);
  assert.equal(
    finalsStayIndependent({
      before: { finalTakeId: takeA.id, finalScriptId: null },
      after: { finalTakeId: afterIndependent.finalTakeId, finalScriptId: afterIndependent.finalScriptId },
      changed: "script",
    }),
    true,
  );
  assert.equal(afterIndependent.finalTakeId, takeA.id);
  assert.equal(afterIndependent.finalScriptId, scriptA.headId);

  const replayTake = await updateReel(reelId, { finalTakeId: takeA.id, expectedUpdatedAt: staleStamp });
  assert.equal(replayTake.finalTakeId, takeA.id);
  assert.equal(replayTake.finalScriptId, scriptA.headId);

  const replayScript = await setFinalScript(reelId, scriptA.headId);
  assert.equal(replayScript.finalScriptId, scriptA.headId);
  assert.equal((await getReel(reelId))?.finalTakeId, takeA.id);

  await setFinalScript(reelId, scriptB.headId);
  const afterScripts = await getReel(reelId);
  assert.equal(afterScripts?.finalTakeId, takeA.id);
  assert.equal(afterScripts?.finalScriptId, scriptB.headId);

  const completed = await updateReel(reelId, { status: "completed" });
  assert.equal(completed.status, "completed");
  const completedAgain = await updateReel(reelId, { status: "completed", expectedUpdatedAt: staleStamp });
  assert.equal(completedAgain.status, "completed");
  assert.equal(completedAgain.finalTakeId, afterScripts?.finalTakeId);
  assert.equal(completedAgain.finalScriptId, afterScripts?.finalScriptId);

  const beforeExport = {
    takes: await prisma.take.count({ where: { reelId } }),
    scripts: await prisma.scriptVersion.count({ where: { reelId } }),
    compares: await prisma.compareResult.count({ where: { reelId } }),
    keys: await prisma.thoughtCreateKey.count(),
  };
  const exportA = await exportReel(reelId);
  const exportB = await exportReel(reelId);
  assert.equal(exportA.reel.id, exportB.reel.id);
  assert.equal(exportA.takes.length, exportB.takes.length);
  assert.equal(await prisma.take.count({ where: { reelId } }), beforeExport.takes);
  assert.equal(await prisma.scriptVersion.count({ where: { reelId } }), beforeExport.scripts);
  assert.equal(await prisma.compareResult.count({ where: { reelId } }), beforeExport.compares);
  assert.equal(await prisma.thoughtCreateKey.count(), beforeExport.keys);
});

test("R2 profile amend retry with the same key does not publish twice", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-r2-profile-"));
  const url = fileUrl(path.join(dir, "test.db"));
  process.env.DATABASE_URL = url;
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows */
    }
  });
  migrateDeploy(url);

  const { startProfileDialogue, sendProfileMessage, supplementProfileDialogue, getProfileWorkspace, confirmProfilePortrait } = await import(
    "../src/lib/profile-dialogue"
  );
  await startProfileDialogue();

  let completeCalls = 0;
  const complete = async () => {
    completeCalls += 1;
    return {
      text: JSON.stringify({
        reply: "Портрета достаточно.",
        kind: "ready",
        complete: true,
        understood: "говорить своими словами",
        openQuestions: [],
        coveredKeys: ["whyRecord", "audience", "experience"],
        missingKeys: [],
        patch: {
          whyRecord: { text: "говорить своими словами", usage: "understanding" },
          audience: { text: "близкие", usage: "understanding" },
          experience: { text: "запись коротких мыслей", usage: "understanding" },
        },
      }),
      usage: { promptTokens: 2, completionTokens: 2 },
    };
  };

  const [first, parallel] = await Promise.all([
    sendProfileMessage({ text: "Записываю, чтобы говорить своими словами.", idempotencyKey: "prof-r2" }, complete),
    sendProfileMessage({ text: "Записываю, чтобы говорить своими словами.", idempotencyKey: "prof-r2" }, complete),
  ]);
  assert.equal(completeCalls, 1);
  assert.equal(first.dialogue.messages.filter((item) => item.role === "user").length, 1);
  assert.equal(parallel.dialogue.messages.filter((item) => item.role === "user").length, 1);
  assert.equal(await prisma.dialogueMessage.count({ where: { idempotencyKey: "prof-r2" } }), 1);
  assert.equal((await getProfileWorkspace()).awaitingConfirm, true);
  const published = await confirmProfilePortrait();
  assert.equal(published.portrait?.completed, true);
  const againConfirm = await confirmProfilePortrait();
  assert.equal(againConfirm.portrait?.completed, true);
  assert.equal(againConfirm.profile.currentRevisionId, published.profile.currentRevisionId);

  await supplementProfileDialogue();
  const amend = await sendProfileMessage(
    { text: "без изменений", idempotencyKey: "amend-r2" },
    async () => ({
      text: JSON.stringify({
        reply: "Ничего не меняю.",
        kind: "ready",
        complete: true,
        noChange: true,
        understood: "без изменений",
        openQuestions: [],
        coveredKeys: ["whyRecord", "audience", "experience"],
        missingKeys: [],
        patch: {},
      }),
      usage: { promptTokens: 2, completionTokens: 2 },
    }),
  );
  assert.equal(unfinishedAmendPublishesPortrait(amend.profile.fields), false);
  const replayAmend = await sendProfileMessage({ text: "без изменений", idempotencyKey: "amend-r2" }, complete);
  assert.equal(completeCalls, 1);
  assert.equal(await prisma.dialogueMessage.count({ where: { idempotencyKey: "amend-r2" } }), 1);
  assert.equal(replayAmend.pendingChange, amend.pendingChange);
});
