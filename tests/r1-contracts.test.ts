import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
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

test("R1 maps P13–P16 later and locks user statuses, scriptless record and amend", () => {
  assert.deepEqual(P13_P16_TO_R_PHASE, {
    P13: "R6",
    P14: "R3+R4",
    P15: "R5+R8",
    P16: "R7",
  });
  assert.deepEqual(productUserStatusLabels(), ["Не завершена", "В работе", "Успешно завершена"]);
  assert.equal(scriptlessRecordingAllowed(), true);
  assert.equal(unfinishedAmendPublishesPortrait(emptyProfileFields()), false);
  assert.equal(
    finalsStayIndependent({
      before: { finalTakeId: "t1", finalScriptId: "s1" },
      after: { finalTakeId: "t2", finalScriptId: "s1" },
      changed: "take",
    }),
    true,
  );
  assert.equal(
    finalsStayIndependent({
      before: { finalTakeId: "t1", finalScriptId: "s1" },
      after: { finalTakeId: "t2", finalScriptId: "s2" },
      changed: "take",
    }),
    false,
  );

  const reelType = readFileSync(path.join(repoRoot, "src/types/reel.ts"), "utf8");
  const scripts = readFileSync(path.join(repoRoot, "src/lib/scripts.ts"), "utf8");
  const schema = readFileSync(path.join(repoRoot, "prisma/schema.prisma"), "utf8");
  const start = reelType.indexOf("export interface UpdateReelInput");
  const end = reelType.indexOf("export interface CreateTakeInput");
  const patchShape = reelType.slice(start, end);
  assert.match(patchShape, /finalTakeId\?: string \| null/);
  assert.equal(patchShape.includes("finalScriptId"), false);
  assert.match(scripts, /data: \{ finalScriptId: scriptId \}/);
  assert.match(schema, /finalTakeId/);
  assert.match(schema, /finalScriptId/);
  assert.match(schema, /currentRevisionId/);
});

test("API keeps final take and final script on separate writes", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-r1-"));
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

  const { createReel, createTake, getReel, updateReel } = await import("../src/lib/reels");
  const { saveManualScript, setFinalScript } = await import("../src/lib/scripts");

  const reel = await createReel({ title: "R1 finals" });
  const takeA = await createTake(reel.id, { inputType: "text", bodyText: "дубль A" });
  const takeB = await createTake(reel.id, { inputType: "text", bodyText: "дубль B" });
  const scriptA = await saveManualScript(reel.id, { body: "Сценарий A", sources: [], expectedHeadId: null });
  const scriptB = await saveManualScript(reel.id, { body: "Сценарий B", sources: [], expectedHeadId: scriptA.headId });
  assert.ok(scriptA.headId && scriptB.headId);

  const afterTake = await updateReel(reel.id, { finalTakeId: takeA.id });
  assert.equal(
    finalsStayIndependent({
      before: { finalTakeId: null, finalScriptId: null },
      after: { finalTakeId: afterTake.finalTakeId, finalScriptId: afterTake.finalScriptId },
      changed: "take",
    }),
    true,
  );
  assert.equal(afterTake.finalScriptId, null);

  const afterScript = await setFinalScript(reel.id, scriptA.headId);
  const mid = await getReel(reel.id);
  assert.equal(mid?.finalTakeId, takeA.id);
  assert.equal(afterScript.finalScriptId, scriptA.headId);

  const swappedTake = await updateReel(reel.id, { finalTakeId: takeB.id });
  assert.equal(swappedTake.finalTakeId, takeB.id);
  assert.equal(swappedTake.finalScriptId, scriptA.headId);

  const swappedScript = await setFinalScript(reel.id, scriptB.headId);
  const end = await getReel(reel.id);
  assert.equal(end?.finalTakeId, takeB.id);
  assert.equal(swappedScript.finalScriptId, scriptB.headId);
});
