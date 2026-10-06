import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

async function bases(prisma: { scriptVersion: { findMany: (args: object) => Promise<{ id: string; body: string; sourcesJson: string }[]> } }, reelId: string) {
  return prisma.scriptVersion.findMany({ where: { reelId, kind: "from_take" }, orderBy: { createdAt: "asc" } });
}

test("R1: every take with an original transcript gets one stored from_take base, without a model call", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createReel, createTake, getReel } = await import("../src/lib/reels");
  const { ensureOriginalFromText } = await import("../src/lib/transcripts");
  const { listScriptBundle, listScriptWorkspace, cleanTakeTranscript } = await import("../src/lib/scripts");

  assert.equal(cleanTakeTranscript("  Чай   остыл \r\n\r\n  на  подоконнике.  "), "Чай остыл\nна подоконнике.");

  const reel = await createReel({ title: "Основа из дубля" });
  const first = await createTake(reel.id, { inputType: "text", bodyText: "Чай   остыл на подоконнике." });
  await ensureOriginalFromText(first.id, first.bodyText);
  await ensureOriginalFromText(first.id, first.bodyText);

  const original = await prisma.transcriptRevision.findFirstOrThrow({ where: { takeId: first.id, kind: "original" } });
  const one = await bases(prisma as never, reel.id);
  assert.equal(one.length, 1, "repeat of the same original does not duplicate the base");
  assert.equal(one[0].body, "Чай остыл на подоконнике.");
  assert.equal(JSON.parse(one[0].sourcesJson)[0].id, original.id, "the base points at the transcript");
  assert.equal(original.text, "Чай   остыл на подоконнике.", "the transcript itself is not changed");
  assert.equal(await prisma.aiCall.count({ where: { reelId: reel.id, kind: "script" } }), 0);

  const second = await createTake(reel.id, { inputType: "text", bodyText: "Второй дубль про чай." });
  await ensureOriginalFromText(second.id, second.bodyText);
  assert.equal((await bases(prisma as never, reel.id)).length, 2, "a new take makes a new base");

  // Stored, not shown: the base moves no V05 signal until R4.
  assert.equal((await listScriptBundle(reel.id)).versions.length, 0);
  const workspace = await listScriptWorkspace(reel.id);
  assert.equal(workspace.readyCount, 0);
  assert.equal(workspace.versions.length, 0);
  assert.notEqual(workspace.phase, "ready");
  assert.equal((await getReel(reel.id))?.hasScript, false);
  assert.equal((await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).selectedScriptId, null);
});

test("R1: a thought created from text gets its base at once", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const created = await createThoughtFromText({ title: "Из текста", body: "Мысль  из   текста.", idempotencyKey: "r1-create" });
  const rows = await bases(prisma as never, created.reel.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].body, "Мысль из текста.");

  const again = await createThoughtFromText({ title: "Из текста", body: "Мысль  из   текста.", idempotencyKey: "r1-create" });
  assert.equal(again.reel.id, created.reel.id);
  assert.equal((await bases(prisma as never, created.reel.id)).length, 1, "a replayed create adds nothing");
});
