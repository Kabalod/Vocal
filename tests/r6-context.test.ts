import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import {
  draftAmendEntersRuntime,
  promptContainsAny,
  runtimePortraitFields,
  runtimePortraitRevisionId,
  safeAiLog,
  selectedKeysForRuntime,
} from "../src/lib/ai-runtime-context";
import { resetPrismaClient } from "../src/lib/db";
import { P13_P16_TO_R_PHASE } from "../src/lib/product-contracts";
import { buildPortrait } from "../src/lib/profile-portrait";
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

test("R6 keeps confirmed portrait in runtime and drops amend drafts", () => {
  assert.equal(P13_P16_TO_R_PHASE.P13, "R6");
  const published = emptyProfileFields().map((field) =>
    field.id === "whyRecord" ? { ...field, text: "опубликованная цель", usage: "understanding" as const } : field,
  );
  const draft = emptyProfileFields().map((field) =>
    field.id === "whyRecord" ? { ...field, text: "черновик amend секрет", usage: "understanding" as const } : field,
  );
  const incomplete = {
    fields: published,
    skipped: false,
    supplementing: false,
    portrait: buildPortrait(published, false),
    pending: null,
    dialogueSessionStartId: null,
  };
  assert.equal(runtimePortraitFields(incomplete).every((field) => !field.text), true);
  assert.equal(runtimePortraitRevisionId(incomplete, "rev-1"), null);

  const amending = {
    fields: published,
    skipped: false,
    supplementing: true,
    portrait: buildPortrait(published, true),
    pending: {
      mode: "amend" as const,
      understood: "хочу другое",
      openQuestions: [],
      draftFields: draft,
    },
    dialogueSessionStartId: null,
  };
  const runtime = runtimePortraitFields(amending);
  assert.equal(runtime.find((field) => field.id === "whyRecord")?.text, "опубликованная цель");
  assert.equal(draftAmendEntersRuntime(amending), false);
  assert.equal(runtimePortraitRevisionId(amending, "rev-live"), "rev-live");
  assert.deepEqual(
    selectedKeysForRuntime(runtime, []),
    ["whyRecord"],
  );

  const log = safeAiLog({ kind: "dialogue", reelId: "reel-a", callId: "call-1", code: "LLM_INVALID" });
  assert.equal(promptContainsAny(log, ["опубликованная цель", "черновик amend", "GROQ_API_KEY", "sk-"]).length, 0);
  assert.match(log, /dialogue/);
  assert.match(log, /call-1/);

  const dialogue = readFileSync(path.join(repoRoot, "src/lib/dialogue.ts"), "utf8");
  const studio = readFileSync(path.join(repoRoot, "src/components/ReelStudio.tsx"), "utf8");
  const reelContext = readFileSync(path.join(repoRoot, "src/lib/reel-context.ts"), "utf8");
  assert.match(dialogue, /buildThoughtMaterialContext/);
  assert.match(dialogue, /getReelContext/);
  assert.equal(studio.includes("ReelContextForm"), false);
  assert.match(reelContext, /runtimePortraitFields/);
});

test("thought A prompt does not include thought B or amend draft", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-r6-"));
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
      /* windows lock */
    }
  });
  migrateDeploy(url);

  const { createReel, createTake } = await import("../src/lib/reels");
  const { persistProfilePayload } = await import("../src/lib/profile");
  const { saveManualScript, loadSourceTexts } = await import("../src/lib/scripts");
  const { freezeReelContext } = await import("../src/lib/reel-context");
  const { buildThoughtMaterialContext } = await import("../src/lib/dialogue");
  const { ensureOriginalFromText } = await import("../src/lib/transcripts");

  const published = emptyProfileFields().map((field) => {
    if (field.id === "whyRecord") return { ...field, text: "подтверждённый мотив чая", usage: "in_text" as const };
    if (field.id === "audience") return { ...field, text: "друзья по чаю", usage: "understanding" as const };
    return field;
  });
  const draft = published.map((field) =>
    field.id === "whyRecord" ? { ...field, text: "секретный черновик amend про работу" } : field,
  );
  await persistProfilePayload({
    fields: published,
    skipped: false,
    supplementing: true,
    portrait: buildPortrait(published, true),
    pending: {
      mode: "amend",
      understood: "другое",
      openQuestions: [],
      draftFields: draft,
    },
    dialogueSessionStartId: null,
  });

  const thoughtA = await createReel({ title: "Мысль A про чай" });
  const thoughtB = await createReel({ title: "Мысль B про бег UNIQUE_B_MARKER" });
  const takeA = await createTake(thoughtA.id, { inputType: "text", bodyText: "текст мысли A UNIQUE_A_MARKER" });
  const takeB = await createTake(thoughtB.id, { inputType: "text", bodyText: "текст мысли B UNIQUE_B_MARKER" });
  await ensureOriginalFromText(takeA.id, "текст мысли A UNIQUE_A_MARKER");
  await ensureOriginalFromText(takeB.id, "текст мысли B UNIQUE_B_MARKER");
  await saveManualScript(thoughtB.id, { body: "сценарий B UNIQUE_B_SCRIPT" });

  const frozenA = await freezeReelContext(thoughtA.id);
  const promptA = await buildThoughtMaterialContext(thoughtA.id);
  assert.equal(promptContainsAny(JSON.stringify(frozenA.live), ["секретный черновик amend про работу"]).length, 0);
  assert.match(JSON.stringify(frozenA.live.publicForScript), /подтверждённый мотив чая/);
  assert.equal(promptContainsAny(promptA, [thoughtB.id, "UNIQUE_B_MARKER", "UNIQUE_B_SCRIPT", "секретный черновик"]).length, 0);
  assert.match(promptA, /UNIQUE_A_MARKER/);
  assert.match(promptA, /подтверждённый мотив чая/);

  await assert.rejects(
    () => loadSourceTexts(thoughtA.id, [{ type: "transcript", id: takeB.id, label: "чужой" }]),
    /этой карточке/,
  );
});
