import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

test("pipeline recovery: STT saved, replay skips STT, lease, exhausted, versions", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-jobs-"));
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

  const { createReel, createTake } = await import("../src/lib/reels");
  const { processJob } = await import("../src/lib/pipeline");
  const { claimJob, listRecoverableJobIds } = await import("../src/lib/jobs");
  const { findOriginalRevision } = await import("../src/lib/transcripts");
  const { POST: postTranscript, GET: getTranscript, PATCH: patchTranscript } = await import(
    "../src/app/api/takes/[id]/transcript/route"
  );
  const { POST: retryJob } = await import("../src/app/api/jobs/[id]/retry/route");

  const reel = await createReel({ title: "Пайплайн" });
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
  const take = await createTake(reel.id, { inputType: "video", jobId: job.id });

  let sttCalls = 0;
  const stt = async () => {
    sttCalls += 1;
    return {
      text: "привет мир",
      segments: [{ start: 0, end: 1, text: "привет мир" }],
      language: "ru",
      model: "mock-stt",
    };
  };
  const extractAudio = async () => undefined;
  const probeDuration = async () => 2;

  await processJob(job.id, {
    transcribeAudio: stt,
    extractAudio,
    probeDuration,
  });

  assert.equal(sttCalls, 1);
  const original = await findOriginalRevision(take.id);
  assert.ok(original);
  assert.equal(original?.text, "привет мир");
  const afterStt = await prisma.job.findUnique({ where: { id: job.id }});
  assert.equal(afterStt?.status, "done");
  assert.equal(afterStt?.stage, "done");
  assert.equal(await prisma.analysisResult.count({ where: { jobId: job.id } }), 0);

  await processJob(job.id, {
    transcribeAudio: stt,
    extractAudio,
    probeDuration,
  });
  assert.equal(sttCalls, 1);
  const done = await prisma.job.findUnique({ where: { id: job.id } });
  assert.equal(done?.status, "done");

  const created = await postTranscript(
    new Request(`http://vocal.local/api/takes/${take.id}/transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "привет, мир" }),
    }),
    { params: Promise.resolve({ id: take.id }) },
  );
  assert.equal(created.status, 201);
  const bundle = (await created.json()).transcript;
  assert.equal(bundle.revisions.length, 2);
  const listed = await getTranscript(new Request("http://vocal.local"), {
    params: Promise.resolve({ id: take.id }),
  });
  const listedBody = (await listed.json()).transcript;
  const origRow = listedBody.revisions.find((row: { kind: string }) => row.kind === "original");
  assert.equal(origRow.text, "привет мир");
  assert.ok(origRow.segments);
  const editRow = listedBody.revisions.find((row: { kind: string }) => row.kind === "edit");
  assert.equal(editRow.segments, null);

  const selected = await patchTranscript(
    new Request(`http://vocal.local/api/takes/${take.id}/transcript`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedId: origRow.id }),
    }),
    { params: Promise.resolve({ id: take.id }) },
  );
  assert.equal(selected.status, 200);

  const hung = await prisma.job.create({
    data: {
      ownerUserId: "local",
      originalName: "hung.mp4",
      videoPath,
      status: "analyzing",
      stage: "analyze",
      attempts: 1,
      maxAttempts: 3,
      takeId: take.id,
      leaseUntil: new Date(Date.now() - 60_000),
      leaseOwner: "dead-worker",
    },
  });
  const recoverable = await listRecoverableJobIds();
  assert.ok(recoverable.includes(hung.id));
  const live = await prisma.job.create({
    data: {
      ownerUserId: "local",
      originalName: "live.mp4",
      videoPath,
      status: "analyzing",
      stage: "analyze",
      attempts: 1,
      maxAttempts: 3,
      takeId: take.id,
      leaseUntil: new Date(Date.now() + 120_000),
      leaseOwner: "alive",
    },
  });
  const recoverable2 = await listRecoverableJobIds();
  assert.equal(recoverable2.includes(live.id), false);

  await processJob(hung.id, {
    transcribeAudio: stt,
    extractAudio,
    probeDuration,
  });
  assert.equal(sttCalls, 1);
  const hungDone = await prisma.job.findUnique({ where: { id: hung.id }});
  assert.equal(hungDone?.status, "done");

  const race = await prisma.job.create({
    data: {
      ownerUserId: "local",
      originalName: "race.mp4",
      videoPath,
      status: "queued",
      stage: "convert",
      maxAttempts: 3,
      takeId: take.id,
    },
  });
  const first = await claimJob(race.id);
  const second = await claimJob(race.id);
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, "busy");

  const exhaustedJob = await prisma.job.create({
    data: {
      ownerUserId: "local",
      originalName: "exhausted.mp4",
      videoPath,
      status: "error",
      stage: "stt",
      attempts: 3,
      maxAttempts: 3,
      takeId: take.id,
      errorMessage: "STT fail",
    },
  });
  const exhaustedClaim = await claimJob(exhaustedJob.id);
  assert.equal(exhaustedClaim.ok, false);
  assert.equal(exhaustedClaim.reason, "exhausted");
  const retryRes = await retryJob(new Request("http://vocal.local"), {
    params: Promise.resolve({ id: exhaustedJob.id }),
  });
  assert.equal(retryRes.status, 409);
  const retryBody = await retryRes.json();
  assert.equal(retryBody.code, "RETRY_EXHAUSTED");
  const sameTake = await prisma.take.count({ where: { id: take.id }});
  assert.equal(sameTake, 1);

  const sttFailTakeReel = reel;
  const sttFailJob = await prisma.job.create({
    data: {
      ownerUserId: "local",
      originalName: "stt-fail.mp4",
      videoPath,
      status: "queued",
      stage: "convert",
      maxAttempts: 3,
    },
  });
  const sttFailTake = await createTake(sttFailTakeReel.id, { inputType: "video", jobId: sttFailJob.id });
  let sttFailCalls = 0;
  await processJob(sttFailJob.id, {
    transcribeAudio: async () => {
      sttFailCalls += 1;
      throw Object.assign(new Error("STT down"), { code: "GROQ_NETWORK" });
    },
    extractAudio,
    probeDuration,
  });
  assert.equal(sttFailCalls, 1);
  assert.equal(await findOriginalRevision(sttFailTake.id), null);
  await processJob(sttFailJob.id, {
    transcribeAudio: async () => {
      sttFailCalls += 1;
      return {
        text: "второй заход",
        segments: [{ start: 0, end: 1, text: "второй заход" }],
        language: "ru",
        model: "mock-stt",
      };
    },
    extractAudio,
    probeDuration,
  });
  assert.equal(sttFailCalls, 2);
  assert.equal((await findOriginalRevision(sttFailTake.id))?.text, "второй заход");

  const payloadJob = await prisma.job.create({
    data: {
      ownerUserId: "local",
      originalName: "payload.mp4",
      videoPath,
      status: "done",
      stage: "done",
    },
  });
  const payloadTake = await createTake(reel.id, { inputType: "video", jobId: payloadJob.id });
  await prisma.analysisResult.create({
    data: {
      jobId: payloadJob.id,
      overallScore: 5,
      summary: "old",
      payload: JSON.stringify({
        transcript: { text: "старый текст", segments: [{ start: 0, end: 1, text: "старый" }] },
      }),
    },
  });
  const imported = await getTranscript(new Request("http://vocal.local"), {
    params: Promise.resolve({ id: payloadTake.id }),
  });
  const importedBody = (await imported.json()).transcript;
  assert.equal(importedBody.revisions[0].text, "старый текст");
  assert.equal(importedBody.revisions[0].source, "payload_import");
});
