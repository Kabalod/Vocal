import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";

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

test("scripts: manual save, versions, generate, restore, sources, take link", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-scripts-"));
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

  const { createReel, createTake, getReel } = await import("../src/lib/reels");
  const { ensureOriginalFromText } = await import("../src/lib/transcripts");
  const { saveManualScript, restoreScript, listScriptBundle, ScriptError } = await import("../src/lib/scripts");
  const { generateScriptProposal } = await import("../src/lib/ai/script");
  const { GET: getScripts } = await import("../src/app/api/reels/[id]/scripts/route");

  const empty = await createReel({ title: "Пустая карточка без сценария" });
  const emptyReel = await getReel(empty.id);
  assert.equal(emptyReel?.hasScript, false);

  const reel = await createReel({ title: "Вымышленный сценарий", initialNote: "заметка про чай" });
  const take = await createTake(reel.id, {
    inputType: "text",
    bodyText: "Вымышленный чай остыл на подоконнике.",
  });
  await ensureOriginalFromText(take.id, take.bodyText);
  const other = await createReel({ title: "Чужая карточка" });
  const otherTake = await createTake(other.id, { inputType: "text", bodyText: "Чужой текст." });
  await ensureOriginalFromText(otherTake.id, otherTake.bodyText);
  const otherBundle = await listScriptBundle(other.id);
  const foreignTranscript = otherBundle.sources.find((item) => item.type === "transcript");
  assert.ok(foreignTranscript);

  const firstSources = (await listScriptBundle(reel.id)).sources.filter((item) => item.type === "note" || item.type === "transcript");
  const saved = await saveManualScript(reel.id, {
    body: "Черновик: чай и подоконник.",
    sources: firstSources.map((item) => ({ type: item.type, id: item.id })),
    expectedHeadId: null,
  });
  assert.equal(saved.versions.length, 1);
  assert.equal(saved.headId, saved.versions[0].id);
  assert.equal(saved.versions[0].kind, "manual");
  assert.equal(saved.versions[0].sources.length >= 1, true);
  const afterSave = await getReel(reel.id);
  assert.equal(afterSave?.hasScript, true);

  await assert.rejects(
    () =>
      saveManualScript(reel.id, {
        body: "устаревшая запись",
        expectedHeadId: null,
      }),
    (error: unknown) => error instanceof ScriptError && error.status === 409,
  );

  await assert.rejects(
    () =>
      saveManualScript(reel.id, {
        body: "нельзя чужой источник",
        expectedHeadId: saved.headId,
        sources: [{ type: "transcript", id: foreignTranscript.id }],
      }),
    (error: unknown) => error instanceof ScriptError && error.code === "SOURCE_FOREIGN",
  );

  const draftBeforeGenerate = "Черновик: чай и подоконник. Правка во время ожидания.";
  let completeCalls = 0;
  const generated = await generateScriptProposal(
    reel.id,
    { sources: firstSources.map((item) => ({ type: item.type, id: item.id })) },
    async () => {
      completeCalls += 1;
      return {
        text: JSON.stringify({
          script: "Предложение модели про вымышленный чай.",
          opening: "подоконник",
          supports: "чай",
          example: "",
          ending: "спокойно",
          inventedIdeas: ["вымышленный сосед"],
        }),
      };
    },
  );
  assert.equal(completeCalls, 1);
  assert.equal(generated.bundle.headId, saved.headId);
  assert.equal(generated.bundle.versions.some((row) => row.kind === "ai_proposal"), true);
  const proposal = generated.bundle.versions.find((row) => row.id === generated.proposalId);
  assert.equal(proposal?.kind, "ai_proposal");
  assert.equal(proposal?.inventedIdeas.includes("вымышленный сосед"), true);
  assert.notEqual(draftBeforeGenerate, proposal?.body);

  const afterProposal = await saveManualScript(reel.id, {
    body: draftBeforeGenerate,
    expectedHeadId: saved.headId,
    sources: firstSources.map((item) => ({ type: item.type, id: item.id })),
  });
  assert.equal(afterProposal.headId !== saved.headId, true);
  assert.equal(afterProposal.versions.filter((row) => row.kind === "ai_proposal").length, 1);

  const oldest = afterProposal.versions[afterProposal.versions.length - 1];
  const restored = await restoreScript(reel.id, oldest.id, afterProposal.headId);
  assert.equal(restored.versions.length, afterProposal.versions.length + 1);
  assert.equal(restored.versions.some((row) => row.id === oldest.id), true);
  assert.equal(restored.versions[0].kind, "restore");
  assert.equal(restored.versions[0].parentId, oldest.id);
  assert.equal(restored.versions[0].body, oldest.body);

  await resetPrismaClient();
  const listed = await listScriptBundle(reel.id);
  assert.equal(listed.versions.length, restored.versions.length);
  const api = await getScripts(new Request("http://local/scripts"), { params: Promise.resolve({ id: reel.id }) });
  const apiJson = await api.json();
  assert.equal(api.ok, true);
  assert.equal(apiJson.versions.length, restored.versions.length);

  const linked = await createTake(reel.id, {
    inputType: "text",
    bodyText: "Запись по сценарию.",
    scriptVersionId: restored.headId ?? undefined,
  });
  assert.equal(linked.scriptVersionId, restored.headId);

  await assert.rejects(
    () =>
      createTake(other.id, {
        inputType: "text",
        bodyText: "Чужой сценарий нельзя.",
        scriptVersionId: restored.headId ?? undefined,
      }),
    (error: unknown) => error instanceof Error && /сценария/.test(error.message),
  );

  await assert.rejects(
    () => generateScriptProposal(reel.id, { sources: [] }, async () => ({ text: "{}" })),
    (error: unknown) => error instanceof ScriptError && error.code === "SOURCES_REQUIRED",
  );

  await assert.rejects(
    () =>
      generateScriptProposal(
        reel.id,
        { sources: firstSources.map((item) => ({ type: item.type, id: item.id })) },
        async () => ({ text: "это не json сценария" }),
      ),
    (error: unknown) => error instanceof ScriptError && error.code === "LLM_INVALID",
  );
});
