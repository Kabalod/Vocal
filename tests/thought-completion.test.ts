import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { thoughtCompletionGate } from "../src/lib/thought-completion";

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

test("completion gate names the missing final", () => {
  assert.equal(
    thoughtCompletionGate({ finalTakeId: null, finalScriptId: null }).blockedReason,
    "Чтобы завершить мысль, выберите итоговый дубль и итоговый сценарий.",
  );
  assert.equal(
    thoughtCompletionGate({ finalTakeId: null, finalScriptId: "s1" }).blockedReason,
    "Не выбран итоговый дубль.",
  );
  assert.equal(
    thoughtCompletionGate({ finalTakeId: "t1", finalScriptId: null }).blockedReason,
    "Не выбран итоговый сценарий.",
  );
  assert.equal(thoughtCompletionGate({ finalTakeId: "t1", finalScriptId: "s1" }).canComplete, true);
  assert.equal(
    thoughtCompletionGate({ finalTakeId: "t1", finalScriptId: "s1", status: "completed" }).canComplete,
    false,
  );
});

test("new studio UI writes finalTakeId, not selectedTakeId", () => {
  const takes = readFileSync(path.join(repoRoot, "src/components/ReelTakes.tsx"), "utf8");
  const list = readFileSync(path.join(repoRoot, "src/components/TakeList.tsx"), "utf8");
  const compare = readFileSync(path.join(repoRoot, "src/components/TakeComparison.tsx"), "utf8");
  const summary = readFileSync(path.join(repoRoot, "src/components/CompletionSummary.tsx"), "utf8");
  assert.match(takes, /finalTakeId/);
  assert.equal(takes.includes("selectedTakeId:"), false);
  assert.match(list, /reel\.finalTakeId/);
  assert.equal(list.includes("reel.selectedTakeId"), false);
  assert.match(compare, /finalTakeId/);
  assert.equal(compare.includes("selectedTakeId:"), false);
  assert.match(summary, /Завершить мысль/);
  assert.match(summary, /Вернуть в работу/);
});

test("final take migrates from selectedTakeId and completion keeps history", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-complete-"));
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

  const { createReel, createTake, getReel, updateReel, listReels, ReelError } = await import("../src/lib/reels");
  const { saveManualScript, setFinalScript, ScriptError } = await import("../src/lib/scripts");
  const { backfillFinalTakeIds } = await import("../src/lib/thought-completion");
  const { GET: listGet } = await import("../src/app/api/reels/route");

  const reel = await createReel({ title: "Итоги мысли", initialNote: "исходная" });
  const take1 = await createTake(reel.id, { inputType: "text", bodyText: "первая мысль текстом" });
  const take2 = await createTake(reel.id, { inputType: "text", bodyText: "вторая попытка" });

  const compat = await updateReel(reel.id, { selectedTakeId: take1.id });
  assert.equal(compat.selectedTakeId, take1.id);
  assert.equal(compat.finalTakeId, null);

  const copied = await backfillFinalTakeIds();
  assert.equal(copied.hadSelected >= 1, true);
  assert.equal(copied.copied, 1);
  const afterCopy = await getReel(reel.id);
  assert.equal(afterCopy?.finalTakeId, take1.id);
  assert.equal(afterCopy?.selectedTakeId, take1.id);

  const asFinal = await updateReel(reel.id, { finalTakeId: take2.id });
  assert.equal(asFinal.finalTakeId, take2.id);
  assert.equal(asFinal.selectedTakeId, take1.id);

  const titleOnly = await updateReel(reel.id, { title: "Итоги мысли" });
  assert.equal(titleOnly.finalTakeId, take2.id);
  assert.equal(titleOnly.selectedTakeId, take1.id);

  const other = await createReel({ title: "Чужая" });
  const foreign = await createTake(other.id, { inputType: "text", bodyText: "чужой дубль" });
  await assert.rejects(() => updateReel(reel.id, { finalTakeId: foreign.id }), (err: unknown) => {
    return err instanceof ReelError && err.code === "TAKE_NOT_IN_REEL";
  });

  await assert.rejects(() => updateReel(reel.id, { status: "completed" }), (err: unknown) => {
    return err instanceof ReelError && err.code === "COMPLETE_INCOMPLETE";
  });

  const saved = await saveManualScript(reel.id, {
    body: "Готовый сценарий для записи.",
    sources: [],
    expectedHeadId: null,
  });
  const scriptId = saved.headId;
  assert.ok(scriptId);

  const proposal = await prisma.scriptVersion.create({
    data: {
      reelId: reel.id,
      kind: "ai_proposal",
      body: "предложение модели",
      recordingJson: "{}",
      sourcesJson: "[]",
    },
  });
  await assert.rejects(() => setFinalScript(reel.id, proposal.id), (err: unknown) => {
    return err instanceof ScriptError && err.code === "SCRIPT_NOT_READY";
  });

  const withScript = await setFinalScript(reel.id, scriptId);
  assert.equal(withScript.finalScriptId, scriptId);
  const stillTake = await getReel(reel.id);
  assert.equal(stillTake?.finalTakeId, take2.id);
  assert.equal(stillTake?.finalScriptId, scriptId);
  assert.equal(stillTake?.selectedTakeId, take1.id);

  const before = {
    takes: await prisma.take.count({ where: { reelId: reel.id } }),
    scripts: await prisma.scriptVersion.count({ where: { reelId: reel.id } }),
    transcripts: await prisma.transcriptRevision.count({ where: { take: { reelId: reel.id } } }),
    reviews: await prisma.review.count({ where: { reelId: reel.id } }),
    questions: await prisma.question.count({ where: { reelId: reel.id } }),
    messages: await prisma.dialogueMessage.count({ where: { thread: { reelId: reel.id } } }),
    calls: await prisma.aiCall.count({ where: { reelId: reel.id } }),
    snapshots: await prisma.reelContextSnapshot.count({ where: { reelId: reel.id } }),
  };

  const completed = await updateReel(reel.id, { status: "completed" });
  assert.equal(completed.status, "completed");
  assert.equal(completed.finalTakeId, take2.id);
  assert.equal(completed.finalScriptId, scriptId);

  await assert.rejects(() => updateReel(reel.id, { finalTakeId: take1.id }), (err: unknown) => {
    return err instanceof ReelError && err.code === "NEED_REOPEN";
  });
  await assert.rejects(() => setFinalScript(reel.id, scriptId), (err: unknown) => {
    return err instanceof ScriptError && err.code === "NEED_REOPEN";
  });

  const listed = await listReels({ status: "completed" });
  assert.equal(listed.reels.some((row) => row.id === reel.id), true);
  assert.equal(listed.reels.find((row) => row.id === reel.id)?.statusGroup, "completed");

  const viaApi = await (
    await listGet(new Request("http://vocal.local/api/reels?status=completed"))
  ).json();
  assert.equal(viaApi.reels.some((row: { id: string }) => row.id === reel.id), true);

  const reopened = await updateReel(reel.id, { status: "in_progress" });
  assert.equal(reopened.status, "in_progress");
  assert.equal(reopened.finalTakeId, take2.id);
  assert.equal(reopened.finalScriptId, scriptId);

  const after = {
    takes: await prisma.take.count({ where: { reelId: reel.id } }),
    scripts: await prisma.scriptVersion.count({ where: { reelId: reel.id } }),
    transcripts: await prisma.transcriptRevision.count({ where: { take: { reelId: reel.id } } }),
    reviews: await prisma.review.count({ where: { reelId: reel.id } }),
    questions: await prisma.question.count({ where: { reelId: reel.id } }),
    messages: await prisma.dialogueMessage.count({ where: { thread: { reelId: reel.id } } }),
    calls: await prisma.aiCall.count({ where: { reelId: reel.id } }),
    snapshots: await prisma.reelContextSnapshot.count({ where: { reelId: reel.id } }),
  };
  assert.deepEqual(after, before);
});
