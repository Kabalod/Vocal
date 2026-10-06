import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

test("R1: every take with an original transcript gets one from_take base, without a model call", async (t) => {
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

  const one = await listScriptBundle(reel.id);
  assert.equal(one.versions.length, 1, "repeat of the same original does not duplicate the base");
  assert.equal(one.versions[0].kind, "from_take");
  assert.equal(one.versions[0].body, "Чай остыл на подоконнике.");
  assert.equal(one.versions[0].sources[0].type, "transcript");
  const workspace = await listScriptWorkspace(reel.id);
  assert.equal(workspace.versions[0].sourceLabel, "Основа из дубля №1");
  assert.notEqual(workspace.phase, "ready", "a base alone does not move the V05 phase");
  assert.equal(one.selectedScriptId, one.versions[0].id);
  assert.equal(await prisma.aiCall.count({ where: { reelId: reel.id, kind: "script" } }), 0);
  const original = await prisma.transcriptRevision.findFirstOrThrow({ where: { takeId: first.id, kind: "original" } });
  assert.equal(original.text, "Чай   остыл на подоконнике.".trim(), "transcript itself is not changed");

  const second = await createTake(reel.id, { inputType: "text", bodyText: "Второй дубль про чай." });
  await ensureOriginalFromText(second.id, second.bodyText);
  const two = await listScriptBundle(reel.id);
  assert.equal(two.versions.filter((row) => row.kind === "from_take").length, 2, "a new take makes a new base");
  assert.equal(two.selectedScriptId, one.versions[0].id, "an existing selection is kept");

  const after = await getReel(reel.id);
  assert.equal(after?.hasScript, true);
});
