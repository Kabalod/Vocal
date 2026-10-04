import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { completeJob } from "../src/lib/jobs";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import {
  LEGACY_COMPARE_AI_RETIRED,
  LEGACY_QUESTIONS_RETIRED,
  LEGACY_REVIEW_RETIRED,
} from "../src/lib/legacy-ai-routes";

test("media path: STT without analyze, title fallback, replay, lease, retired POSTs", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-media-"));
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  });

  const { createThoughtFromText, DEFAULT_THOUGHT_TITLE } = await import("../src/lib/thought-create");
  const { createTake, getReel, updateReel } = await import("../src/lib/reels");
  const { processJob } = await import("../src/lib/pipeline");
  const { createEditedRevision, findOriginalRevision, saveOriginalIfAbsent } = await import(
    "../src/lib/transcripts"
  );
  const { POST: postReview, GET: getReview } = await import("../src/app/api/takes/[id]/review/route");
  const { POST: postQuestions, GET: getQuestions } = await import("../src/app/api/reels/[id]/questions/route");
  const { POST: postCompare, GET: getCompare } = await import("../src/app/api/reels/[id]/compare/route");

  const { reel } = await createThoughtFromText({
    title: DEFAULT_THOUGHT_TITLE,
    body: "Исходник MEDIA_ORIGIN",
    idempotencyKey: "media-path-create",
  });
  const originId = reel.workingTakeId;
  assert.ok(originId);
  const videoPath = path.join(dir, "clip.mp4");
  writeFileSync(videoPath, "fake-video");
  const take = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "one.webm" });
  const job = await prisma.job.create({
    data: {
      ownerUserId: "local",
      originalName: "one.webm",
      videoPath,
      status: "queued",
      stage: "convert",
      takeId: take.id,
      maxAttempts: 3,
    },
  });

  let sttCalls = 0;
  const stt = async () => {
    sttCalls += 1;
    return {
      text: "голос про кухню",
      segments: [{ start: 0, end: 1, text: "голос про кухню" }],
      language: "ru",
      model: "mock-stt",
    };
  };

  await processJob(job.id, {
    transcribeAudio: stt,
    extractAudio: async () => undefined,
    probeDuration: async () => 2,
    suggestTitle: async () => {
      throw new Error("title model down");
    },
  });

  assert.equal(sttCalls, 1);
  const original = await findOriginalRevision(take.id);
  assert.equal(original?.text, "голос про кухню");
  const done = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(done.status, "done");
  assert.equal(await prisma.analysisResult.count({ where: { jobId: job.id } }), 0);
  assert.equal(await prisma.compareResult.count({ where: { reelId: reel.id } }), 0);
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id } }), 0);
  assert.equal(await prisma.review.count({ where: { takeId: take.id } }), 0);
  assert.equal((await getReel(reel.id))?.workingTakeId, take.id);
  assert.equal((await prisma.reel.findUniqueOrThrow({ where: { id: reel.id } })).title, "голос про кухню");

  await processJob(job.id, {
    transcribeAudio: async () => {
      sttCalls += 1;
      throw new Error("replay must not transcribe");
    },
    extractAudio: async () => {
      throw new Error("replay must not extract");
    },
    probeDuration: async () => {
      throw new Error("replay must not probe");
    },
  });
  assert.equal(sttCalls, 1);
  assert.equal(await prisma.transcriptRevision.count({ where: { takeId: take.id, kind: "original" } }), 1);
  assert.equal(await prisma.take.count({ where: { reelId: reel.id } }), 2);

  await createEditedRevision(take.id, "кухня, правка автора");
  await processJob(job.id, {
    transcribeAudio: async () => {
      throw new Error("edit must stay");
    },
  });
  const afterEdit = await prisma.transcriptRevision.findFirstOrThrow({
    where: { takeId: take.id, kind: "edit" },
  });
  assert.equal(afterEdit.text, "кухня, правка автора");

  const staleAnalyze = await prisma.job.create({
    data: {
      ownerUserId: "local",
      originalName: "old-analyze.webm",
      videoPath,
      status: "error",
      stage: "analyze",
      takeId: take.id,
      attempts: 1,
      maxAttempts: 3,
      errorCode: "LLM_SCHEMA|analyze",
      errorMessage: "legacy analyze failed",
    },
  });
  let recoverStt = 0;
  await processJob(staleAnalyze.id, {
    transcribeAudio: async () => {
      recoverStt += 1;
      throw new Error("saved original must skip STT");
    },
    extractAudio: async () => undefined,
    probeDuration: async () => 2,
  });
  assert.equal(recoverStt, 0);
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: staleAnalyze.id } })).status, "done");
  assert.equal(await prisma.analysisResult.count({ where: { jobId: staleAnalyze.id } }), 0);

  const later = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "later.webm" });
  await updateReel(reel.id, { workingTakeId: originId });
  await saveOriginalIfAbsent(later.id, { text: "поздний STT", source: "stt" });
  assert.equal((await getReel(reel.id))?.workingTakeId, originId);

  await updateReel(reel.id, { finalTakeId: take.id, status: "completed" });
  const lateTake = await createTake(reel.id, { inputType: "audio", bodyText: "", originalName: "after.webm" });
  await saveOriginalIfAbsent(lateTake.id, { text: "после завершения", source: "stt" });
  const completed = await getReel(reel.id);
  assert.equal(completed?.status, "completed");
  assert.equal(completed?.workingTakeId, originId);
  assert.equal(completed?.finalTakeId, take.id);

  const stolen = await prisma.job.create({
    data: {
      ownerUserId: "local",
      originalName: "lease.webm",
      videoPath,
      status: "transcribing",
      stage: "stt",
      attempts: 1,
      maxAttempts: 3,
      leaseOwner: "alive-owner",
      leaseUntil: new Date(Date.now() + 60_000),
    },
  });
  assert.equal(await completeJob(stolen.id, "lost-owner"), false);
  const stillLive = await prisma.job.findUniqueOrThrow({ where: { id: stolen.id } });
  assert.equal(stillLive.status, "transcribing");
  assert.equal(stillLive.leaseOwner, "alive-owner");

  const reviewGone = await postReview(new Request("http://vocal.local", { method: "POST", body: "{}" }), {
    params: Promise.resolve({ id: take.id }),
  });
  assert.equal(reviewGone.status, 410);
  assert.equal(((await reviewGone.json()) as { code: string }).code, LEGACY_REVIEW_RETIRED);
  const reviewGet = await getReview(new Request("http://vocal.local"), { params: Promise.resolve({ id: take.id }) });
  assert.equal(reviewGet.status, 200);

  const qGone = await postQuestions(new Request("http://vocal.local", { method: "POST", body: "{}" }), {
    params: Promise.resolve({ id: reel.id }),
  });
  assert.equal(qGone.status, 410);
  assert.equal(((await qGone.json()) as { code: string }).code, LEGACY_QUESTIONS_RETIRED);
  const qGet = await getQuestions(new Request("http://vocal.local"), { params: Promise.resolve({ id: reel.id }) });
  assert.equal(qGet.status, 200);

  const compareAi = await postCompare(
    new Request("http://vocal.local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leftTakeId: take.id, rightTakeId: later.id, runAi: true }),
    }),
    { params: Promise.resolve({ id: reel.id }) },
  );
  assert.equal(compareAi.status, 410);
  assert.equal(((await compareAi.json()) as { code: string }).code, LEGACY_COMPARE_AI_RETIRED);
  const compareGet = await getCompare(new Request("http://vocal.local"), {
    params: Promise.resolve({ id: reel.id }),
  });
  assert.equal(compareGet.status, 200);
});
