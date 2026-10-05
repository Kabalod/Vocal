import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { askQuestionJson } from "./helpers/agent-action-json";
import { v04NoChangeJson } from "./helpers/v04-profile-reply";

const CHAT_LABELS = ["dialogue", "profile_dialogue", "script", "thought-title", "c00_classify"] as const;
const ENV_KEYS = [
  "VOCAL_DAILY_TOKEN_LIMIT",
  "VOCAL_DAILY_STT_SECONDS",
  "VOCAL_AI_TIMEOUT_MS",
  "VOCAL_STT_TIMEOUT_MS",
  "VOCAL_JOB_LEASE_MS",
  "VOCAL_TEST_USER_ID",
] as const;

function resetEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

async function setup(t: Parameters<typeof withPostgresTestDb>[0]) {
  const { prisma } = await withPostgresTestDb(t);
  resetEnv();
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    resetEnv();
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });
  return prisma;
}

async function spend(prisma: Awaited<ReturnType<typeof setup>>, owner: string, tokens: number) {
  await prisma.aiCall.create({
    data: {
      kind: "dialogue",
      model: "mock",
      status: "done",
      ownerUserId: owner,
      promptText: "",
      inputSnapshotJson: "{}",
      promptTokens: tokens,
      completionTokens: 0,
    },
  });
}

const chatArgs = (label: string) => ({ model: "mock", system: "s", user: "u", label });
const okReply = async () => ({ text: "{}", usage: { promptTokens: 1, completionTokens: 1 } });

test("I07 defaults: limits are on without env and 0 disables", async () => {
  resetEnv();
  const { dailyTokenLimit, dailySttSecondsLimit } = await import("../src/lib/ai/usage-guard");
  assert.equal(dailyTokenLimit(), 200_000);
  assert.equal(dailySttSecondsLimit(), 3600);
  process.env.VOCAL_DAILY_TOKEN_LIMIT = "0";
  assert.equal(dailyTokenLimit(), 0);
  process.env.VOCAL_DAILY_TOKEN_LIMIT = "nope";
  assert.equal(dailyTokenLimit(), 200_000);
  resetEnv();
});

test("I07 chat: exhausted budget → AI_BUDGET (429) and zero external calls on every chat path", async (t) => {
  const prisma = await setup(t);
  process.env.VOCAL_DAILY_TOKEN_LIMIT = "10";
  await spend(prisma, "local", 10);
  const { gatewayComplete } = await import("../src/lib/ai/gateway");
  for (const label of CHAT_LABELS) {
    let external = 0;
    await assert.rejects(
      gatewayComplete(async () => {
        external += 1;
        return okReply();
      }, chatArgs(label)),
      (error: { code?: string; status?: number }) => error.code === "AI_BUDGET" && error.status === 429,
      label,
    );
    assert.equal(external, 0, `${label} must not reach the provider`);
  }
});

test("I07 chat: budget is per owner", async (t) => {
  const prisma = await setup(t);
  process.env.VOCAL_DAILY_TOKEN_LIMIT = "10";
  await spend(prisma, "user-a", 10);
  const { gatewayComplete } = await import("../src/lib/ai/gateway");
  const { runWithOwner } = await import("../src/lib/auth/session");
  await assert.rejects(
    runWithOwner({ id: "user-a", email: null }, () => gatewayComplete(okReply, chatArgs("dialogue"))),
    { code: "AI_BUDGET" },
  );
  const reply = await runWithOwner({ id: "user-b", email: null }, () =>
    gatewayComplete(okReply, chatArgs("dialogue")),
  );
  assert.equal(reply.text, "{}");
});

test("I07 accounting: classifier and failed calls leave rows, self-recording paths do not double count", async (t) => {
  const prisma = await setup(t);
  const { gatewayComplete } = await import("../src/lib/ai/gateway");
  await gatewayComplete(okReply, chatArgs("c00_classify"));
  const classifier = await prisma.aiCall.findMany({ where: { kind: "c00_classify" } });
  assert.equal(classifier.length, 1);
  assert.equal(classifier[0].status, "done");
  assert.equal(classifier[0].promptText, "");

  await gatewayComplete(okReply, chatArgs("dialogue"));
  assert.equal(await prisma.aiCall.count({ where: { kind: "dialogue" } }), 0, "dialogue owns its own row");

  await assert.rejects(
    gatewayComplete(async () => {
      throw new Error("provider down");
    }, chatArgs("dialogue")),
    /provider down/,
  );
  const failed = await prisma.aiCall.findMany({ where: { kind: "dialogue_failed" } });
  assert.equal(failed.length, 1);
  assert.ok((failed[0].promptTokens ?? 0) > 0, "failed call is charged an estimate");
});

test("I07 chat: a hung provider fails by deadline", async (t) => {
  await setup(t);
  process.env.VOCAL_AI_TIMEOUT_MS = "60";
  const { gatewayComplete } = await import("../src/lib/ai/gateway");
  const started = Date.now();
  await assert.rejects(
    gatewayComplete(() => new Promise<never>(() => undefined), chatArgs("dialogue")),
    { code: "AI_TIMEOUT" },
  );
  assert.ok(Date.now() - started < 2000);
});

test("I07 STT: budget exhausted → 429 without calling the provider; calls are accounted per owner", async (t) => {
  const prisma = await setup(t);
  process.env.VOCAL_DAILY_STT_SECONDS = "10";
  const { meteredTranscribe } = await import("../src/lib/ai/gateway");
  const { runWithOwner } = await import("../src/lib/auth/session");
  let calls = 0;
  const stt = async () => {
    calls += 1;
    return { text: "привет", segments: [], model: "mock-stt" };
  };
  await meteredTranscribe("/nonexistent.mp3", stt, { seconds: 8 });
  assert.equal(calls, 1);
  const row = await prisma.aiCall.findFirstOrThrow({ where: { kind: "stt" } });
  assert.equal(row.promptTokens, 8);
  assert.equal(row.ownerUserId, "local");

  await assert.rejects(meteredTranscribe("/nonexistent.mp3", stt, { seconds: 5 }), { code: "AI_BUDGET" });
  assert.equal(calls, 1, "no provider call after the budget is spent");

  const other = await runWithOwner({ id: "user-b", email: null }, () =>
    meteredTranscribe("/nonexistent.mp3", stt, { seconds: 5 }),
  );
  assert.equal(other.text, "привет");
  assert.equal(calls, 2);
});

test("I07 STT: a failed provider call is still charged", async (t) => {
  const prisma = await setup(t);
  const { meteredTranscribe } = await import("../src/lib/ai/gateway");
  await assert.rejects(
    meteredTranscribe(
      "/nonexistent.mp3",
      async () => {
        throw new Error("stt down");
      },
      { seconds: 7 },
    ),
    /stt down/,
  );
  const row = await prisma.aiCall.findFirstOrThrow({ where: { kind: "stt" } });
  assert.equal(row.status, "error");
  assert.equal(row.promptTokens, 7);
});

test("I07 voice: same idempotency key transcribes once (thought dialogue)", async (t) => {
  const prisma = await setup(t);
  const { createReel } = await import("../src/lib/reels");
  const { sendDialogueVoice } = await import("../src/lib/dialogue");
  const reel = await createReel({ title: "Голос" });
  let sttCalls = 0;
  let modelCalls = 0;
  const transcribe = async () => {
    sttCalls += 1;
    return { text: "Голосовой ответ автора", segments: [], model: "mock-stt" };
  };
  const extract = async () => undefined;
  const complete = async () => {
    modelCalls += 1;
    return { text: askQuestionJson("Что здесь главное?"), usage: { promptTokens: 1, completionTokens: 1 } };
  };
  const file = () => new File([new Uint8Array([1, 2, 3, 4])], "reply.webm", { type: "audio/webm" });
  await sendDialogueVoice(reel.id, { file: file(), idempotencyKey: "voice-once" }, complete, transcribe, extract);
  await sendDialogueVoice(reel.id, { file: file(), idempotencyKey: "voice-once" }, complete, transcribe, extract);
  assert.equal(sttCalls, 1);
  assert.equal(modelCalls, 1);
  assert.equal(await prisma.aiCall.count({ where: { kind: "stt" } }), 1);
});

test("I07 voice: same idempotency key transcribes once (profile dialogue)", async (t) => {
  await setup(t);
  const { startProfileDialogue, sendProfileVoice } = await import("../src/lib/profile-dialogue");
  await startProfileDialogue();
  let sttCalls = 0;
  const transcribe = async () => {
    sttCalls += 1;
    return { text: "Пишу для себя", segments: [], model: "mock-stt" };
  };
  const extract = async () => undefined;
  const complete = async () => ({ text: v04NoChangeJson(), usage: { promptTokens: 1, completionTokens: 1 } });
  const file = () => new File([new Uint8Array([1, 2, 3, 4])], "reply.webm", { type: "audio/webm" });
  await sendProfileVoice({ file: file(), idempotencyKey: "pv-once" }, complete, transcribe, extract);
  await sendProfileVoice({ file: file(), idempotencyKey: "pv-once" }, complete, transcribe, extract);
  assert.equal(sttCalls, 1);
});

test("I07 voice: oversized upload is rejected before ffmpeg and STT", async (t) => {
  await setup(t);
  const { createReel } = await import("../src/lib/reels");
  const { sendDialogueVoice } = await import("../src/lib/dialogue");
  const reel = await createReel({ title: "Большой голос" });
  let touched = 0;
  const big = new File([new Uint8Array(16 * 1024 * 1024)], "reply.webm", { type: "audio/webm" });
  await assert.rejects(
    sendDialogueVoice(
      reel.id,
      { file: big, idempotencyKey: "voice-big" },
      async () => okReply(),
      async () => {
        touched += 1;
        return { text: "x", segments: [], model: "m" };
      },
      async () => {
        touched += 1;
      },
    ),
    { code: "VOICE_TOO_LARGE" },
  );
  assert.equal(touched, 0);
});

test("I07 voice: exhausted STT budget surfaces as AI_BUDGET, not STT_FAILED", async (t) => {
  await setup(t);
  process.env.VOCAL_DAILY_STT_SECONDS = "1";
  const { createReel } = await import("../src/lib/reels");
  const { sendDialogueVoice } = await import("../src/lib/dialogue");
  const reel = await createReel({ title: "Лимит голоса" });
  let stt = 0;
  await assert.rejects(
    sendDialogueVoice(
      reel.id,
      { file: new File([new Uint8Array(64_000)], "reply.webm"), idempotencyKey: "voice-budget" },
      async () => okReply(),
      async () => {
        stt += 1;
        return { text: "x", segments: [], model: "m" };
      },
      async () => undefined,
    ),
    { code: "AI_BUDGET" },
  );
  assert.equal(stt, 0);
});

test("I07 pipeline: STT longer than the lease keeps the lease, calls STT once and finishes", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-i07-"));
  const prisma = await setup(t);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  process.env.VOCAL_JOB_LEASE_MS = "300";
  const { createReel, createTake } = await import("../src/lib/reels");
  const { processJob } = await import("../src/lib/pipeline");
  const reel = await createReel({ title: "Долгий STT" });
  const videoPath = path.join(dir, "clip.mp4");
  writeFileSync(videoPath, "fake-video");
  const job = await prisma.job.create({
    data: {
      ownerUserId: "local",
      originalName: "clip.mp4",
      videoPath,
      status: "queued",
      stage: "convert",
      maxAttempts: 3,
    },
  });
  await createTake(reel.id, { inputType: "video", jobId: job.id });

  let sttCalls = 0;
  const deps = {
    transcribeAudio: async () => {
      sttCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return { text: "долгая расшифровка", segments: [{ start: 0, end: 1, text: "долгая расшифровка" }], model: "mock-stt" };
    },
    extractAudio: async () => undefined,
    probeDuration: async () => 2,
    suggestTitle: async () => ({ text: JSON.stringify({ title: "Долгий" }), usage: {} }),
  };
  const first = processJob(job.id, deps);
  await new Promise((resolve) => setTimeout(resolve, 700)); // well past the 300 ms lease
  const second = await processJob(job.id, deps);
  assert.equal(second.ok, false, "a live job must not be re-claimed while STT runs");
  await first;
  assert.equal(sttCalls, 1);
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status, "done");
  assert.equal(await prisma.aiCall.count({ where: { kind: "stt" } }), 1);
});

test("I07 profile: a turn stuck in processing is closed with an honest error", async (t) => {
  const prisma = await setup(t);
  const { startProfileDialogue, sendProfileMessage, getProfileWorkspace } = await import(
    "../src/lib/profile-dialogue"
  );
  await startProfileDialogue();
  const thread = await prisma.dialogueThread.findFirstOrThrow({ where: { scope: "profile" } });
  const old = new Date(Date.now() - 10 * 60_000);
  await prisma.dialogueMessage.create({
    data: { threadId: thread.id, role: "user", kind: "text", body: "Ответ до падения", idempotencyKey: "crashed", createdAt: old },
  });
  const processing = await prisma.dialogueMessage.create({
    data: { threadId: thread.id, role: "assistant", kind: "processing", body: "Собираю портрет…", status: "pending", createdAt: old },
  });

  let modelCalls = 0;
  await sendProfileMessage({ text: "Ответ до падения", idempotencyKey: "crashed" }, async () => {
    modelCalls += 1;
    return { text: v04NoChangeJson(), usage: { promptTokens: 1, completionTokens: 1 } };
  });
  assert.equal(modelCalls, 0, "replay of a used key never calls the model");
  const closed = await prisma.dialogueMessage.findUniqueOrThrow({ where: { id: processing.id } });
  assert.equal(closed.kind, "error");
  assert.equal(closed.status, "error");
  const workspace = await getProfileWorkspace();
  assert.ok(!workspace.dialogue.messages.some((item) => item.kind === "processing"));
});
