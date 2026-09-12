import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { assembleReelContext } from "../src/lib/reel-context";
import {
  buildPortrait,
  decidePortraitComplete,
  mergeProfileFields,
} from "../src/lib/profile-portrait";
import { emptyProfileFields, LOCAL_PROFILE_ID } from "../src/types/profile";

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

test("merge keeps confirmed meanings and empty patch does not wipe", () => {
  const current = emptyProfileFields().map((field) =>
    field.id === "whyRecord" ? { ...field, text: "Хочу говорить своими словами" } : field,
  );
  const merged = mergeProfileFields(current, {
    whyRecord: { text: "   " },
    boundaries: { text: "не хочу говорить о теме работы" },
  });
  assert.equal(merged.find((field) => field.id === "whyRecord")?.text, "Хочу говорить своими словами");
  assert.equal(merged.find((field) => field.id === "boundaries")?.text, "не хочу говорить о теме работы");
  const portrait = buildPortrait(merged, true);
  assert.ok(portrait.sections.some((section) => section.id === "goals"));
  assert.ok(portrait.sections.some((section) => section.id === "boundaries"));
  assert.equal(
    portrait.sections.some((section) => section.id === "topics"),
    false,
  );
  assert.equal(
    decidePortraitComplete({
      fields: current,
      modelComplete: true,
      supplementing: false,
      patchHadText: false,
    }),
    false,
  );
  assert.equal(
    decidePortraitComplete({
      fields: merged,
      modelComplete: true,
      supplementing: false,
      patchHadText: true,
    }),
    true,
  );
});

test("profile dialogue covers keys, voice skips confirm, reload and snapshots stay", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-profile-dlg-"));
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
      /* windows lock */
    }
  });
  migrateDeploy(url);

  const {
    startProfileDialogue,
    sendProfileMessage,
    sendProfileVoice,
    getProfileWorkspace,
    supplementProfileDialogue,
  } = await import("../src/lib/profile-dialogue");
  const { GET: getProfile, PUT: putProfile } = await import("../src/app/api/profile/route");

  const started = await startProfileDialogue();
  assert.equal(started.phase, "conversation");
  assert.ok(started.dialogue.messages.some((item) => item.body.includes("зачем")));

  const replies = [
    {
      key: "a1",
      text: "Записываю, чтобы говорить своими словами.",
      reply: JSON.stringify({
        reply: "Для кого это?",
        coveredKeys: ["whyRecord"],
        missingKeys: ["audience"],
        patch: { whyRecord: { text: "Говорить своими словами", usage: "understanding" } },
        complete: false,
      }),
    },
    {
      key: "a2",
      text: "Для людей, которым близка тихая речь.",
      reply: JSON.stringify({
        reply: "Какой опыт уже есть?",
        coveredKeys: ["whyRecord", "audience"],
        missingKeys: ["experience"],
        patch: { audience: { text: "Люди, которым близка тихая речь", usage: "in_text" } },
        complete: false,
      }),
    },
    {
      key: "a3",
      text: "Год веду заметки и иногда читаю вслух.",
      reply: JSON.stringify({
        reply: "Портрета достаточно.",
        coveredKeys: ["whyRecord", "audience", "experience"],
        missingKeys: [],
        patch: { experience: { text: "Год веду заметки и иногда читаю вслух", usage: "understanding" } },
        complete: true,
      }),
    },
  ];

  let completeCalls = 0;
  const complete = async () => {
    const item = replies[completeCalls];
    completeCalls += 1;
    return { text: item.reply, usage: { promptTokens: 4, completionTokens: 3 } };
  };

  for (const item of replies) {
    await sendProfileMessage({ text: item.text, idempotencyKey: item.key }, complete);
  }
  assert.equal(completeCalls, 3);
  const done = await getProfileWorkspace();
  assert.equal(done.phase, "portrait");
  assert.ok(done.portrait);
  assert.ok(done.portrait.coveredKeys.includes("whyRecord"));
  assert.ok(done.portrait.coveredKeys.includes("audience"));
  assert.ok(done.portrait.coveredKeys.includes("experience"));
  assert.ok(done.portrait.sections.some((section) => section.id === "goals"));
  assert.ok(done.portrait.sections.some((section) => section.id === "experience"));
  assert.equal(
    done.portrait.sections.some((section) => section.id === "topics"),
    false,
  );
  const keptGoals = done.portrait.sections.find((section) => section.id === "goals")?.text;
  await supplementProfileDialogue();
  const failedApply = await sendProfileMessage(
    { text: "добавить опыт путешествий, которых не было", idempotencyKey: "fail-1" },
    async () => {
      throw new Error("модель недоступна");
    },
  );
  assert.equal(failedApply.applyError, "модель недоступна");
  assert.equal(failedApply.portrait?.sections.find((section) => section.id === "goals")?.text, keptGoals);
  assert.ok(failedApply.dialogue.messages.some((item) => item.body === "добавить опыт путешествий, которых не было"));

  const again = await sendProfileMessage({ text: replies[0].text, idempotencyKey: "a1" }, complete);
  assert.equal(completeCalls, 3);
  assert.equal(again.dialogue.messages.filter((item) => item.body === replies[0].text).length, 1);

  let voiceComplete = 0;
  const afterVoice = await sendProfileVoice(
    { file: new File(["x"], "reply.webm", { type: "audio/webm" }), idempotencyKey: "voice-1", voiceDurationLabel: "0:03" },
    async () => {
      voiceComplete += 1;
      return {
        text: JSON.stringify({
          reply: "Какие темы хотите раскрывать?",
          coveredKeys: ["whyRecord", "audience", "experience", "topics"],
          missingKeys: [],
          patch: { topics: { text: "тишина и речь", usage: "understanding" } },
          complete: false,
        }),
        usage: { promptTokens: 2, completionTokens: 2 },
      };
    },
    async () => ({ text: "Хочу говорить про тишину и речь", segments: [], model: "mock" }),
    async () => undefined,
  );
  assert.equal(voiceComplete, 1);
  const voiceUser = afterVoice.dialogue.messages.find((item) => item.voice?.durationLabel === "0:03");
  assert.ok(voiceUser);
  assert.equal(voiceUser.body, "Хочу говорить про тишину и речь");
  assert.ok(!afterVoice.dialogue.messages.some((item) => item.body.includes("подтвердите транскрипт")));

  const reloaded = await getProfileWorkspace();
  assert.ok(reloaded.dialogue.messages.length >= afterVoice.dialogue.messages.length);
  assert.ok(reloaded.portrait?.coveredKeys.includes("whyRecord"));

  const beforeBoundary = reloaded.profile.fields.find((field) => field.id === "whyRecord")?.text;
  await supplementProfileDialogue();
  const afterBoundary = await sendProfileMessage(
    { text: "не хочу говорить о теме работы", idempotencyKey: "bound-1" },
    async () => ({
      text: JSON.stringify({
        reply: "Записал границу.",
        coveredKeys: ["boundaries"],
        missingKeys: [],
        patch: { whyRecord: { text: "" }, boundaries: { text: "не хочу говорить о теме работы", usage: "understanding" } },
        complete: true,
      }),
      usage: { promptTokens: 2, completionTokens: 1 },
    }),
  );
  assert.equal(afterBoundary.profile.fields.find((field) => field.id === "whyRecord")?.text, beforeBoundary);
  assert.equal(afterBoundary.profile.fields.find((field) => field.id === "boundaries")?.text, "не хочу говорить о теме работы");
  assert.ok(afterBoundary.portrait?.sections.some((section) => section.id === "boundaries"));

  const calls = await prisma.aiCall.findMany({ where: { kind: "profile_dialogue" } });
  assert.ok(calls.length >= 1);
  assert.ok(calls.every((row) => row.reelId === null && row.profileId === LOCAL_PROFILE_ID));
  assert.ok(calls.some((row) => (row.promptTokens ?? 0) + (row.completionTokens ?? 0) > 0));

  const firstRevision = afterBoundary.profile.currentRevisionId;
  const { GET: getContext, PUT: putContext } = await import("../src/app/api/reels/[id]/context/route");
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { reel } = await createThoughtFromText({
    title: "Контекст",
    body: "Мысль для снимка профиля.",
    idempotencyKey: "ctx-1",
  });
  const frozen = await putContext(
    new Request("http://vocal.local/api/reels/x/context", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reelGoal: "ролик",
        reelAudience: "свои",
        selectedKeys: ["whyRecord", "boundaries"],
      }),
    }),
    { params: Promise.resolve({ id: reel.id }) },
  );
  const frozenBody = (await frozen.json()).context;
  assert.equal(frozenBody.live.profileRevisionId, firstRevision);

  await sendProfileMessage(
    { text: "Теперь цель другая", idempotencyKey: "goal-2" },
    async () => ({
      text: JSON.stringify({
        reply: "Обновил цель.",
        coveredKeys: ["blogGoal"],
        missingKeys: [],
        patch: { blogGoal: { text: "другая цель", usage: "understanding" } },
        complete: true,
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    }),
  );
  const afterLive = await getContext(new Request("http://vocal.local/api/reels/x/context"), {
    params: Promise.resolve({ id: reel.id }),
  });
  const afterBody = (await afterLive.json()).context;
  assert.notEqual(afterBody.live.profileRevisionId, firstRevision);
  assert.equal(afterBody.snapshots[0].profileRevisionId, firstRevision);
  assert.equal(afterBody.snapshots[0].assembled.profileRevisionId, firstRevision);

  const saved = await putProfile(
    new Request("http://vocal.local/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: emptyProfileFields().map((field) =>
          field.id === "lifeNow" ? { ...field, text: "живу тихо", usage: "understanding" } : field,
        ),
      }),
    }),
  );
  assert.equal(saved.status, 200);
  const listed = await getProfile();
  const listedBody = await listed.json();
  assert.equal(listedBody.profile.fields.length, 8);

  process.env.VOCAL_DAILY_TOKEN_LIMIT = "5";
  await assert.rejects(
    () =>
      sendProfileMessage({ text: "ещё одно", idempotencyKey: "budget-1" }, async () => ({
        text: JSON.stringify({ reply: "нет", coveredKeys: [], missingKeys: [], patch: {}, complete: false }),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    /лимит/i,
  );
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;

  const deterministic = assembleReelContext({
    profileRevisionId: "rev-old",
    fields: emptyProfileFields().map((field) =>
      field.id === "whyRecord" ? { ...field, text: "старый смысл", usage: "in_text" } : field,
    ),
    selectedKeys: ["whyRecord"],
    reelGoal: "цель",
    reelAudience: "свои",
  });
  assert.equal(deterministic.publicForScript[0]?.text, "старый смысл");
});
