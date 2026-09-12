import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { GenerationGuard } from "../src/lib/generation-guard";
import { scriptOriginLabel } from "../src/types/script";

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

test("script origin labels cover take, author and Vocal", () => {
  assert.equal(scriptOriginLabel("accepted_ai", []), "Создана с Vocal");
  assert.equal(scriptOriginLabel("manual", []), "Создана вами");
  assert.equal(
    scriptOriginLabel("manual", [{ type: "transcript", id: "t1", label: "Расшифровка дубля №3" }]),
    "Из дубля №3",
  );
  assert.equal(
    scriptOriginLabel("manual", [{ type: "transcript", id: "t1" }], new Map([["t1", 1]])),
    "Из дубля №1",
  );
});

test("generation guard ignores a stale fetch token", () => {
  const guard = new GenerationGuard();
  const first = guard.begin();
  const second = guard.begin();
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
});

test("script draft autosave does not create a ready version until finalize", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-script-draft-"));
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

  const { createReel, createTake } = await import("../src/lib/reels");
  const { ensureOriginalFromText } = await import("../src/lib/transcripts");
  const { saveManualScript, ScriptError } = await import("../src/lib/scripts");
  const {
    deleteScriptDraft,
    finalizeScriptDraft,
    listScriptWorkspace,
    openScriptDraft,
    patchScriptDraft,
    replaceScriptDraft,
  } = await import("../src/lib/scripts");
  const { GET: getScripts } = await import("../src/app/api/reels/[id]/scripts/route");
  const { GET: getScript } = await import("../src/app/api/reels/[id]/scripts/[scriptId]/route");

  const reel = await createReel({ title: "Черновик сценария" });
  const take = await createTake(reel.id, { inputType: "text", bodyText: "Первый текст мысли." });
  await ensureOriginalFromText(take.id, take.bodyText);
  await saveManualScript(reel.id, { body: "Готовая версия один.", expectedHeadId: null });
  for (let i = 2; i <= 21; i += 1) {
    const current = await listScriptWorkspace(reel.id);
    await saveManualScript(reel.id, { body: `Готовая версия ${i}.`, expectedHeadId: current.headId });
  }

  const listed = await listScriptWorkspace(reel.id);
  assert.equal(listed.readyCount, 21);
  assert.equal(listed.versions.every((row) => !("body" in row)), true);
  assert.ok(listed.viewing?.body);
  const api = await getScripts(new Request("http://local/scripts"), { params: Promise.resolve({ id: reel.id }) });
  const apiJson = (await api.json()) as { versions: Array<Record<string, unknown>>; viewing: { body?: string } };
  assert.equal(api.ok, true);
  assert.equal(apiJson.versions.every((row) => !("body" in row)), true);
  assert.ok(apiJson.viewing.body);

  const older = listed.versions.filter((row) => row.kind !== "ai_proposal").at(-1);
  assert.ok(older);
  const one = await getScript(new Request("http://local/one"), {
    params: Promise.resolve({ id: reel.id, scriptId: older.id }),
  });
  const oneJson = (await one.json()) as { body?: string; id: string };
  assert.equal(one.ok, true);
  assert.equal(oneJson.id, older.id);
  assert.ok(oneJson.body);

  const opened = await openScriptDraft(reel.id, listed.headId);
  assert.equal(opened.readyCount, 21);
  assert.ok(opened.draft);
  const patched = await patchScriptDraft(reel.id, {
    body: "Правка только в черновике.",
    expectedUpdatedAt: opened.draft!.updatedAt,
  });
  assert.equal(patched.readyCount, 21);
  assert.equal(patched.draft?.body, "Правка только в черновике.");

  const again = await openScriptDraft(reel.id, older.id);
  assert.equal(again.draft?.body, "Правка только в черновике.");
  assert.equal(again.draft?.id, patched.draft?.id);

  await assert.rejects(
    () =>
      patchScriptDraft(reel.id, {
        body: "устаревшее окно",
        expectedUpdatedAt: opened.draft!.updatedAt,
      }),
    (error: unknown) => error instanceof ScriptError && error.status === 409 && error.code === "STALE",
  );
  const afterStale = await listScriptWorkspace(reel.id);
  assert.equal(afterStale.draft?.body, "Правка только в черновике.");

  const expected = afterStale.draft!.updatedAt;
  const results = await Promise.allSettled([
    patchScriptDraft(reel.id, { body: "параллель А", expectedUpdatedAt: expected }),
    patchScriptDraft(reel.id, { body: "параллель Б", expectedUpdatedAt: expected }),
  ]);
  const fulfilled = results.filter((item) => item.status === "fulfilled");
  const rejected = results.filter((item) => item.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const staleError = (rejected[0] as PromiseRejectedResult).reason;
  assert.equal(staleError instanceof ScriptError && staleError.code === "STALE", true);
  const afterParallel = await listScriptWorkspace(reel.id);
  assert.ok(afterParallel.draft?.body === "параллель А" || afterParallel.draft?.body === "параллель Б");
  assert.equal(afterParallel.readyCount, 21);

  const finalized = await finalizeScriptDraft(reel.id, { expectedUpdatedAt: afterParallel.draft!.updatedAt });
  assert.equal(finalized.readyCount, 22);
  assert.equal(finalized.draft, null);
  assert.equal(await prisma.scriptDraft.count({ where: { reelId: reel.id } }), 0);

  await replaceScriptDraft(reel.id, { body: "Черновик для удаления.", sourceKind: "vocal" });
  const withDraft = await listScriptWorkspace(reel.id);
  const removed = await deleteScriptDraft(reel.id);
  assert.equal(removed.draft, null);
  assert.equal(removed.readyCount, withDraft.readyCount);
});
