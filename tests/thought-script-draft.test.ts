import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { GenerationGuard } from "../src/lib/generation-guard";
import { scriptOriginLabel } from "../src/types/script";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  const { prisma, url } = await withPostgresTestDb(t);
      t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows */
    }
  });

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

test("draft finalize keeps latest body, rejects stale token, and transfer bumps saveToken", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-script-draft-stale-"));
  const { prisma, url } = await withPostgresTestDb(t);
    await resetPrismaClient();
    t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows */
    }
  });

  const { createReel, createTake } = await import("../src/lib/reels");
  const { ensureOriginalFromText } = await import("../src/lib/transcripts");
  const { saveManualScript, ScriptError } = await import("../src/lib/scripts");
  const { finalizeScriptDraft, listScriptWorkspace, openScriptDraft, patchScriptDraft, replaceScriptDraft } =
    await import("../src/lib/scripts");

  const reel = await createReel({ title: "Немедленное завершение" });
  const take = await createTake(reel.id, { inputType: "text", bodyText: "Исходный текст." });
  await ensureOriginalFromText(take.id, take.bodyText);
  await saveManualScript(reel.id, { body: "Готовая версия.", expectedHeadId: null });

  const opened = await openScriptDraft(reel.id);
  assert.ok(opened.draft);
  const beforeImmediate = opened.readyCount;
  const immediate = await finalizeScriptDraft(reel.id, {
    body: "Правка без ожидания автосохранения.",
    expectedUpdatedAt: opened.draft!.updatedAt,
    expectedSaveToken: opened.draft!.saveToken,
  });
  assert.equal(immediate.readyCount, beforeImmediate + 1);
  assert.equal(immediate.viewing?.body, "Правка без ожидания автосохранения.");
  assert.equal(immediate.draft, null);

  const second = await openScriptDraft(reel.id);
  const patched = await patchScriptDraft(reel.id, {
    body: "Свежая редакция другого окна.",
    expectedUpdatedAt: second.draft!.updatedAt,
    expectedSaveToken: second.draft!.saveToken,
  });
  await assert.rejects(
    () =>
      finalizeScriptDraft(reel.id, {
        body: "устаревшее завершение",
        expectedUpdatedAt: second.draft!.updatedAt,
        expectedSaveToken: second.draft!.saveToken,
      }),
    (error: unknown) => error instanceof ScriptError && error.status === 409 && error.code === "STALE",
  );
  const afterStaleFinalize = await listScriptWorkspace(reel.id);
  assert.equal(afterStaleFinalize.readyCount, immediate.readyCount);
  assert.equal(afterStaleFinalize.draft?.body, "Свежая редакция другого окна.");

  const beforeTransfer = afterStaleFinalize.draft!;
  const transferred = await replaceScriptDraft(reel.id, {
    body: "Перенесённое предложение Vocal.",
    sourceKind: "vocal",
  });
  assert.equal(transferred.saveToken, beforeTransfer.saveToken + 1);
  assert.equal(transferred.body, "Перенесённое предложение Vocal.");
  await assert.rejects(
    () =>
      patchScriptDraft(reel.id, {
        body: "старый автосейв после переноса",
        expectedUpdatedAt: beforeTransfer.updatedAt,
        expectedSaveToken: beforeTransfer.saveToken,
      }),
    (error: unknown) => error instanceof ScriptError && error.status === 409 && error.code === "STALE",
  );
  const afterOldPatch = await listScriptWorkspace(reel.id);
  assert.equal(afterOldPatch.draft?.body, "Перенесённое предложение Vocal.");
  assert.equal(afterOldPatch.readyCount, immediate.readyCount);
});

test("new transcribed take creates the next ready script and leaves the draft", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-take-script-"));
  const { prisma, url } = await withPostgresTestDb(t);
  process.env.DATABASE_URL = url;
    t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows */
    }
  });

  const { createReel, createTake } = await import("../src/lib/reels");
  const { ensureOriginalFromText } = await import("../src/lib/transcripts");
  const { listScriptWorkspace, openScriptDraft, saveManualScript } = await import("../src/lib/scripts");
  const { applyThoughtMediaFromTranscript } = await import("../src/lib/thought-media");

  const reel = await createReel({ title: "Мысль" });
  await prisma.thoughtCreateKey.create({ data: { key: "rec-1", reelId: reel.id } });
  const firstTake = await createTake(reel.id, { inputType: "text", bodyText: "исходная мысль" });
  await ensureOriginalFromText(firstTake.id, "исходная мысль");
  const ready = await saveManualScript(reel.id, { body: "Готовая версия один." });
  assert.ok(ready.headId);
  await openScriptDraft(reel.id);
  const before = await listScriptWorkspace(reel.id);
  assert.equal(before.readyCount, 1);
  assert.ok(before.draft);

  const take2 = await createTake(reel.id, {
    inputType: "audio",
    scriptVersionId: ready.headId ?? undefined,
  });
  await ensureOriginalFromText(take2.id, "новый дубль про смысл");
  await applyThoughtMediaFromTranscript(take2.id, "новый дубль про смысл");

  const after = await listScriptWorkspace(reel.id);
  assert.equal(after.readyCount, 2);
  assert.equal(after.selectedScriptId, ready.headId);
  assert.equal(after.draft?.body, before.draft?.body);
  const stored = await prisma.take.findUnique({ where: { id: take2.id } });
  assert.equal(stored?.scriptVersionId, ready.headId);
  await applyThoughtMediaFromTranscript(take2.id, "новый дубль про смысл");
  assert.equal((await listScriptWorkspace(reel.id)).readyCount, 2);
});
