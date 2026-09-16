import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { runtimePortraitFields } from "../src/lib/ai-runtime-context";
import { resetPrismaClient } from "../src/lib/db";
import { readStoredProfilePayload } from "../src/lib/profile";

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

function src(rel: string) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

test("P10–P12 UI keeps labels, 44px targets, and no profile guard on thoughts", () => {
  const page = src("src/app/profile/page.tsx");
  const ui = src("src/components/ProfileConversation.tsx");
  const thought = src("src/components/NewThoughtSheet.tsx");
  assert.match(page, /overflow-x-hidden/);
  assert.match(ui, /Начать/);
  assert.match(ui, /Позже/);
  assert.match(ui, /Дополнить о себе/);
  assert.match(ui, /Подтвердить портрет/);
  assert.match(ui, /К текущему портрету/);
  assert.match(ui, /aria-label="Диалог анкеты"/);
  assert.match(ui, /min-h-11/);
  assert.match(ui, /Composer/);
  assert.match(ui, /\/api\/profile\/dialogue/);
  assert.equal(thought.includes("profile"), false);
  assert.match(src("src/lib/ai/profile.ts"), /один смысловой вопрос/);
});

test("P11 resume, explicit confirm, voice≠take, unfinished amend stays off AI", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-p10-p12-"));
  const url = fileUrl(path.join(dir, "test.db"));
  process.env.DATABASE_URL = url;
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
      /* windows */
    }
  });
  migrateDeploy(url);

  const {
    startProfileDialogue,
    skipProfileDialogue,
    sendProfileMessage,
    sendProfileVoice,
    getProfileWorkspace,
    confirmProfilePortrait,
    supplementProfileDialogue,
  } = await import("../src/lib/profile-dialogue");
  const { createThoughtFromText } = await import("../src/lib/thought-create");

  const empty = await getProfileWorkspace();
  assert.equal(empty.phase, "idle");
  assert.equal(empty.portrait, null);
  const thought = await createThoughtFromText({
    title: "Без анкеты",
    body: "Мысль до портрета.",
    idempotencyKey: "p10-thought",
  });
  assert.ok(thought.reel.id);

  await startProfileDialogue();
  await sendProfileMessage(
    { text: "Говорю своими словами.", idempotencyKey: "p11-1" },
    async () => ({
      text: JSON.stringify({
        reply: "Для кого вы хотите записывать ролики в первую очередь?",
        kind: "clarify",
        complete: false,
        patch: { whyRecord: { text: "своими словами", usage: "understanding" } },
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  await skipProfileDialogue();
  const resumed = await getProfileWorkspace();
  assert.equal(resumed.phase, "conversation");
  assert.match(resumed.currentQuestion ?? "", /Для кого/);

  await sendProfileMessage(
    { text: "Для близких.", idempotencyKey: "p11-2" },
    async () => ({
      text: JSON.stringify({
        reply: "Черновик готов. Подтвердите портрет.",
        kind: "ready",
        complete: true,
        patch: { audience: { text: "близкие", usage: "understanding" } },
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  const waiting = await getProfileWorkspace();
  assert.equal(waiting.awaitingConfirm, true);
  assert.equal(waiting.portrait, null);
  const storedWaiting = await readStoredProfilePayload();
  assert.equal(runtimePortraitFields(storedWaiting).every((field) => !field.text), true);

  const confirmed = await confirmProfilePortrait();
  assert.equal(confirmed.phase, "portrait");
  assert.equal(confirmed.portrait?.completed, true);
  const dup = await confirmProfilePortrait();
  assert.equal(dup.profile.currentRevisionId, confirmed.profile.currentRevisionId);

  await supplementProfileDialogue();
  const voice = await sendProfileVoice(
    { file: new File(["x"], "reply.webm", { type: "audio/webm" }), idempotencyKey: "p11-voice", voiceDurationLabel: "0:02" },
    async () => ({
      text: JSON.stringify({
        reply: "Запишу аудиторию как коллег. Подтвердить?",
        kind: "ready",
        complete: true,
        patch: { audience: { text: "коллеги", usage: "understanding" } },
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
    async () => ({ text: "для коллег", segments: [], model: "mock" }),
    async () => undefined,
  );
  assert.equal(voice.awaitingConfirm, true);
  assert.equal(voice.portrait?.sections.some((section) => section.text.includes("близкие")), true);
  assert.equal(await prisma.take.count({ where: { inputType: { not: "text" } } }), 0);
  assert.ok(voice.dialogue.messages.some((item) => item.voice?.durationLabel === "0:02"));
  const storedAmend = await readStoredProfilePayload();
  assert.equal(runtimePortraitFields(storedAmend).find((field) => field.id === "audience")?.text, "близкие");
  await skipProfileDialogue();
  const cancelled = await getProfileWorkspace();
  assert.equal(cancelled.phase, "portrait");
  assert.equal(cancelled.profile.fields.find((field) => field.id === "audience")?.text, "близкие");
});
