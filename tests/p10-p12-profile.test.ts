import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { runtimePortraitFields } from "../src/lib/ai-runtime-context";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { readStoredProfilePayload } from "../src/lib/profile";
import { v04NoChangeJson, v04ReplaceExplicitJson } from "./helpers/v04-profile-reply";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  assert.doesNotMatch(ui, /Подтвердить портрет/);
  assert.match(ui, /К текущему портрету/);
  assert.match(ui, /aria-label="Диалог анкеты"/);
  assert.match(ui, /min-h-11/);
  assert.match(ui, /Composer/);
  assert.match(ui, /\/api\/profile\/dialogue/);
  assert.equal(thought.includes("profile"), false);
  assert.match(src("src/lib/ai/profile.ts"), /apply_update/);
});

test("P11 resume, explicit confirm, voice≠take, unfinished amend stays off AI", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
    delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
    t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const {
    startProfileDialogue,
    skipProfileDialogue,
    sendProfileMessage,
    sendProfileVoice,
    getProfileWorkspace,
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
      text: v04NoChangeJson(),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  await skipProfileDialogue();
  const resumed = await getProfileWorkspace();
  assert.equal(resumed.phase, "conversation");
  assert.match(resumed.currentQuestion ?? "", /не записываю|зачем/);

  await sendProfileMessage(
    { text: "Для близких.", idempotencyKey: "p11-2" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return {
        text: v04ReplaceExplicitJson([user.id], "general_audience", "близкие"),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );
  const published = await getProfileWorkspace();
  assert.equal(published.awaitingConfirm, false);
  assert.equal(published.phase, "portrait");
  assert.equal(published.portrait?.completed, true);
  const storedPublished = await readStoredProfilePayload();
  assert.equal(runtimePortraitFields(storedPublished).find((field) => field.id === "audience")?.text, "близкие");
  const again = await getProfileWorkspace();
  assert.equal(again.profile.currentRevisionId, published.profile.currentRevisionId);

  await supplementProfileDialogue();
  const voice = await sendProfileVoice(
    { file: new File(["x"], "reply.webm", { type: "audio/webm" }), idempotencyKey: "p11-voice", voiceDurationLabel: "0:02" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return {
        text: v04ReplaceExplicitJson([user.id], "general_audience", "коллеги"),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
    async () => ({ text: "для коллег", segments: [], model: "mock" }),
    async () => undefined,
  );
  assert.equal(voice.awaitingConfirm, false);
  assert.equal(voice.portrait?.sections.some((section) => section.text.includes("коллеги")), true);
  assert.equal(await prisma.take.count({ where: { inputType: { not: "text" } } }), 0);
  assert.ok(voice.dialogue.messages.some((item) => item.voice?.durationLabel === "0:02"));
  const storedAmend = await readStoredProfilePayload();
  assert.equal(runtimePortraitFields(storedAmend).find((field) => field.id === "audience")?.text, "коллеги");
  await skipProfileDialogue();
  const cancelled = await getProfileWorkspace();
  assert.equal(cancelled.phase, "portrait");
  assert.equal(cancelled.profile.fields.find((field) => field.id === "audience")?.text, "коллеги");
});
