import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildCanonicalExportTxt,
  canonicalExportLooksSafe,
  copyCanonicalExport,
  ExportError,
  resolveCanonicalExportScriptId,
  sanitizeExportFilename,
} from "../src/lib/canonical-export";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { P13_P16_TO_R_PHASE } from "../src/lib/product-contracts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("R7 builds a .txt of the chosen script and keeps text on copy failure", async () => {
  assert.equal(P13_P16_TO_R_PHASE.P16, "R7");
  assert.equal(
    resolveCanonicalExportScriptId({
      requestedId: "view",
      finalScriptId: "final",
      selectedScriptId: "selected",
    }),
    "view",
  );
  assert.equal(
    resolveCanonicalExportScriptId({
      requestedId: null,
      finalScriptId: "final",
      selectedScriptId: "selected",
    }),
    "final",
  );
  const text = buildCanonicalExportTxt({
    title: "Чай",
    scriptLabel: "Сценарий",
    scriptBody: "Говорить своими словами.",
    takeLabel: "Итоговый дубль №1",
    takeText: "Исходная мысль про чай.",
  });
  assert.match(text, /Говорить своими словами/);
  assert.match(text, /Исходная мысль про чай/);
  assert.equal(text.includes("GROQ_API_KEY"), false);
  assert.equal(canonicalExportLooksSafe(text, ["foreign-reel"]), true);
  assert.equal(canonicalExportLooksSafe("key GROQ_API_KEY"), false);
  assert.equal(sanitizeExportFilename('мысль <>:"/'), "мысль.txt");
  assert.throws(
    () => buildCanonicalExportTxt({ title: "x", scriptBody: "   " }),
    (error: unknown) => error instanceof ExportError && error.code === "EXPORT_EMPTY",
  );
  const kept = "Готовая речь остаётся.";
  assert.equal(
    await copyCanonicalExport(kept, {
      writeText: async () => {
        throw new Error("denied");
      },
    }),
    "manual",
  );
  assert.equal(kept, "Готовая речь остаётся.");

  const editor = readFileSync(path.join(repoRoot, "src/components/ScriptEditor.tsx"), "utf8");
  const summary = readFileSync(path.join(repoRoot, "src/components/CompletionSummary.tsx"), "utf8");
  const route = readFileSync(path.join(repoRoot, "src/app/api/reels/[id]/export/route.ts"), "utf8");
  assert.match(editor, /CanonicalExportActions/);
  assert.match(summary, /CanonicalExportActions/);
  assert.match(route, /format === "txt"/);
  assert.equal(route.includes("includeHiddenContext"), false);
});

test("canonical txt export is idempotent and does not include another thought", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
      t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { createReel } = await import("../src/lib/reels");
  const { saveManualScript } = await import("../src/lib/scripts");
  const { exportCanonicalTxt } = await import("../src/lib/export-reel");
  const { GET: getExport } = await import("../src/app/api/reels/[id]/export/route");

  const thoughtA = await createReel({ title: "Мысль A UNIQUE_A_TITLE" });
  const thoughtB = await createReel({ title: "Мысль B UNIQUE_B_TITLE" });
  const scriptA = await saveManualScript(thoughtA.id, { body: "Сценарий мысли A UNIQUE_A_SCRIPT" });
  await saveManualScript(thoughtB.id, { body: "Сценарий мысли B UNIQUE_B_SCRIPT" });
  assert.ok(scriptA.headId);

  const before = await prisma.scriptVersion.count({ where: { reelId: thoughtA.id } });
  const first = await exportCanonicalTxt(thoughtA.id, { scriptId: scriptA.headId });
  const second = await exportCanonicalTxt(thoughtA.id, { scriptId: scriptA.headId });
  assert.equal(first.text, second.text);
  assert.equal(first.scriptId, scriptA.headId);
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: thoughtA.id } }), before);
  assert.match(first.text, /UNIQUE_A_SCRIPT/);
  assert.equal(first.text.includes("UNIQUE_B_SCRIPT"), false);
  assert.equal(first.text.includes("UNIQUE_B_TITLE"), false);
  assert.equal(first.text.includes(thoughtB.id), false);
  assert.equal(canonicalExportLooksSafe(first.text, [thoughtB.id]), true);

  const res = await getExport(new Request(`http://vocal.local/api/reels/${thoughtA.id}/export?format=txt`), {
    params: Promise.resolve({ id: thoughtA.id }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
  const body = await res.text();
  assert.match(body, /UNIQUE_A_SCRIPT/);
  assert.equal(body.includes("GROQ_API_KEY"), false);
  assert.equal(body.includes(thoughtB.id), false);

  await assert.rejects(
    () => exportCanonicalTxt(thoughtA.id, { scriptId: "missing" }),
    (error: unknown) => error instanceof ExportError && error.code === "EXPORT_NOT_IN_REEL",
  );
});
