import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { SHELL_NAV } from "../src/components/shell-nav";
import { VOCAL_USER_STATUSES } from "../src/components/vocal-ui/kit";
import { createAppBackup, restoreAppBackup, sha256File } from "../src/lib/backup";
import { assertThoughtMediaFile } from "../src/lib/thought-media";
import { existsSync } from "node:fs";

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

test("user statuses, nav and media errors stay inside the MVP dictionary", () => {
  assert.deepEqual(
    VOCAL_USER_STATUSES.map((item) => item.label),
    ["Не завершена", "В работе", "Успешно завершена"],
  );
  assert.deepEqual(
    SHELL_NAV.map((item) => item.label),
    ["Мысли", "Профиль"],
  );
  assert.throws(() => assertThoughtMediaFile(new File(["x"], "note.txt"), "video"), /формат/i);
  assert.ok(existsSync(path.join(repoRoot, "src/lib/playbook.ts")));
  assert.ok(existsSync(path.join(repoRoot, "src/lib/framework.ts")));
});

test("release routes: thought, dialogue, draft, finals, profile context, usage, backup", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-release-"));
  const dbPath = path.join(dir, "test.db");
  const url = fileUrl(dbPath);
  process.env.DATABASE_URL = url;
  process.env.VOCAL_STORAGE_ROOT = dir;
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
      /* windows lock */
    }
  });
  migrateDeploy(url);

  const { listReels, updateReel, getReel } = await import("../src/lib/reels");
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { listDialoguePage, sendDialogueMessage, sendDialogueVoice, transferDialogueProposal } =
    await import("../src/lib/dialogue");
  const { patchScriptDraft, finalizeScriptDraft, setFinalScript, listScriptWorkspace } =
    await import("../src/lib/scripts");
  const { skipProfileDialogue, startProfileDialogue, sendProfileMessage, getProfileWorkspace } =
    await import("../src/lib/profile-dialogue");
  const { saveReelContext, getReelContext } = await import("../src/lib/reel-context");
  const { buildAiUsageReport } = await import("../src/lib/ai/usage-report");

  const empty = await listReels({ status: "all", sort: "updated" });
  assert.equal(empty.reels.length, 0);

  await skipProfileDialogue();
  const { reel } = await createThoughtFromText({
    title: "Первая мысль",
    body: "Хочу сказать про тихий вечер.",
    idempotencyKey: "rel-text-1",
  });
  const listed = await listReels({ status: "all", sort: "updated" });
  assert.equal(listed.reels.length, 1);
  assert.equal("takes" in listed.reels[0], false);
  assert.ok(!("bodyText" in listed.reels[0]));

  const dialogue = await sendDialogueMessage(
    reel.id,
    { text: "Сделать короче.", idempotencyKey: "rel-dlg-1" },
    async () => ({
      text: JSON.stringify({ reply: "Какой момент главный?", scriptProposal: "Говорю коротко про тихий вечер." }),
      usage: { promptTokens: 6, completionTokens: 4 },
    }),
  );
  const proposal = dialogue.messages.find((item) => item.kind === "script_proposal");
  assert.ok(proposal);
  const transferred = await transferDialogueProposal(reel.id, proposal.id);
  assert.equal(transferred.messages.find((item) => item.id === proposal.id)?.proposal?.transferred, true);
  const afterTransfer = await listScriptWorkspace(reel.id);
  assert.ok(afterTransfer.draft);
  assert.ok(afterTransfer.versions.every((row) => !("body" in row)));

  const voiceBefore = (await listDialoguePage(reel.id)).messages.length;
  const scriptsBeforeVoice = await prisma.scriptVersion.count({ where: { reelId: reel.id } });
  const takesBeforeVoice = await prisma.take.count({ where: { reelId: reel.id } });
  await sendDialogueVoice(
    reel.id,
    { file: new File(["x"], "reply.webm", { type: "audio/webm" }), idempotencyKey: "rel-voice-1" },
    async () => ({
      text: JSON.stringify({ reply: "Понял голосовой ответ.", scriptProposal: null }),
      usage: { promptTokens: 2, completionTokens: 2 },
    }),
    async () => ({ text: "Главное — тишина", segments: [], model: "mock" }),
    async () => undefined,
  );
  const voiceAfter = await listDialoguePage(reel.id);
  assert.ok(voiceAfter.messages.length > voiceBefore);
  assert.equal(await prisma.take.count({ where: { reelId: reel.id } }), takesBeforeVoice);
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id } }), scriptsBeforeVoice);

  const draft = afterTransfer.draft;
  assert.ok(draft);
  const patched = await patchScriptDraft(reel.id, {
    body: "Ручная правка про тихий вечер.",
    expectedUpdatedAt: draft.updatedAt,
    expectedSaveToken: draft.saveToken,
  });
  assert.ok(patched.draft);
  const finalized = await finalizeScriptDraft(reel.id, {
    expectedUpdatedAt: patched.draft.updatedAt,
    expectedSaveToken: patched.draft.saveToken,
  });
  assert.ok(finalized.viewing?.body.includes("тихий вечер"));
  assert.ok(finalized.readyCount >= 1);

  const take = (await getReel(reel.id))!.takes[0];
  await updateReel(reel.id, { finalTakeId: take.id });
  await setFinalScript(reel.id, finalized.viewing!.id);
  const completed = await updateReel(reel.id, { status: "completed" });
  assert.equal(completed.status, "completed");
  const messagesBeforeReopen = await prisma.dialogueMessage.count();
  const reopened = await updateReel(reel.id, { status: "in_progress" });
  assert.equal(reopened.status, "in_progress");
  assert.equal(reopened.finalTakeId, take.id);
  assert.equal(reopened.finalScriptId, finalized.viewing!.id);
  assert.equal(await prisma.dialogueMessage.count(), messagesBeforeReopen);

  await startProfileDialogue();
  await sendProfileMessage(
    { text: "Записываю, чтобы говорить своими словами.", idempotencyKey: "rel-prof-1" },
    async () => ({
      text: JSON.stringify({
        reply: "Портрета достаточно.",
        coveredKeys: ["whyRecord", "experience"],
        missingKeys: [],
        patch: {
          whyRecord: { text: "говорить своими словами", usage: "in_text" },
          experience: { text: "веду заметки", usage: "understanding" },
        },
        complete: true,
      }),
      usage: { promptTokens: 3, completionTokens: 2 },
    }),
  );
  const portrait = await getProfileWorkspace();
  assert.equal(portrait.phase, "portrait");

  const { reel: second } = await createThoughtFromText({
    title: "Вторая мысль",
    body: "Новая мысль после портрета.",
    idempotencyKey: "rel-text-2",
  });
  const frozen = await saveReelContext(second.id, {
    reelGoal: "ролик",
    selectedKeys: ["whyRecord"],
  });
  assert.ok(frozen.live.publicForScript.some((item) => item.text.includes("своими словами")));

  process.env.VOCAL_DAILY_TOKEN_LIMIT = "5";
  const kept = "этот текст нельзя потерять";
  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: kept, idempotencyKey: "rel-budget" }, async () => ({
        text: JSON.stringify({ reply: "нет", scriptProposal: null }),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    /лимит/i,
  );
  assert.equal((await prisma.dialogueMessage.count({ where: { body: kept } })), 0);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;

  const report = await buildAiUsageReport();
  assert.ok(report.rows.some((row) => row.kind === "dialogue" && row.contextType === "reel"));
  assert.ok(report.rows.some((row) => row.kind === "profile_dialogue" && row.contextType === "profile"));
  assert.ok(report.rows.every((row) => typeof row.day === "string" && row.totalTokens >= 0));

  mkdirSync(path.join(dir, "storage", "videos"), { recursive: true });
  writeFileSync(path.join(dir, "storage", "videos", "clip.bin"), "video");
  const backupDir = path.join(dir, "backup");
  const restoreDir = path.join(dir, "restore");
  const manifest = await createAppBackup({ destDir: backupDir, cwd: dir, databaseUrl: url });
  assert.ok(manifest.videos.includes("clip.bin"));
  await restoreAppBackup({ fromDir: backupDir, toDir: restoreDir });
  assert.equal(
    await sha256File(path.join(backupDir, "dev.db")),
    await sha256File(path.join(restoreDir, "prisma", "dev.db")),
  );
  assert.equal(
    await sha256File(path.join(backupDir, "storage", "videos", "clip.bin")),
    await sha256File(path.join(restoreDir, "storage", "videos", "clip.bin")),
  );
});
