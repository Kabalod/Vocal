import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import {
  P13_P16_TO_R_PHASE,
  productUserStatusLabels,
  scriptlessRecordingAllowed,
  unfinishedAmendPublishesPortrait,
} from "../src/lib/product-contracts";
import { STALE_PROCESSING_MS, STALE_PROCESSING_USER_MESSAGE, studioShouldSilentRefetch } from "../src/lib/recovery";
import { emptyProfileFields } from "../src/types/profile";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("R3 keeps R1 mapping and reconnect/reload helpers", () => {
  assert.deepEqual(P13_P16_TO_R_PHASE, {
    P13: "R6",
    P14: "R3+R4",
    P15: "R5+R8",
    P16: "R7",
  });
  assert.deepEqual(productUserStatusLabels(), ["Не завершена", "В работе", "Успешно завершена"]);
  assert.equal(scriptlessRecordingAllowed(), true);
  assert.equal(unfinishedAmendPublishesPortrait(emptyProfileFields()), false);
  assert.equal(studioShouldSilentRefetch({ type: "online", visibilityState: "hidden" }), true);
  assert.equal(studioShouldSilentRefetch({ type: "visibilitychange", visibilityState: "hidden" }), false);
  assert.equal(studioShouldSilentRefetch({ type: "visibilitychange", visibilityState: "visible" }), true);

  const studio = readFileSync(path.join(repoRoot, "src/components/ReelStudio.tsx"), "utf8");
  assert.match(studio, /studioShouldSilentRefetch/);
  assert.match(studio, /loadThought\("silent"\)/);
  const processing = readFileSync(path.join(repoRoot, "src/app/api/thoughts/[id]/processing/route.ts"), "utf8");
  assert.match(processing, /recoverJobIfStale/);
  const jobGet = readFileSync(path.join(repoRoot, "src/app/api/jobs/[id]/route.ts"), "utf8");
  assert.match(jobGet, /recoverJobIfStale/);
  const recovery = readFileSync(path.join(repoRoot, "src/lib/recovery.ts"), "utf8");
  assert.equal(recovery.includes("GROQ_API_KEY"), false);
  assert.equal(STALE_PROCESSING_USER_MESSAGE.includes("GROQ"), false);
});

test("R3 fails stale dialogue processing and recovers expired or exhausted jobs", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-r3-"));
  const { prisma } = await withPostgresTestDb(t);
    process.env.VOCAL_SKIP_JOB_ENQUEUE = "1";
    t.after(async () => {
    delete process.env.VOCAL_SKIP_JOB_ENQUEUE;
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows */
    }
  });

  const { createReel, createTake } = await import("../src/lib/reels");
  const { listDialoguePage, ensureReelThread } = await import("../src/lib/dialogue");
  const { recoverJobIfStale, processJob } = await import("../src/lib/pipeline");
  const { listRecoverableJobIds, EXHAUSTED_JOB_USER_MESSAGE } = await import("../src/lib/jobs");

  const reel = await createReel({ title: "R3 recovery" });
  const thread = await ensureReelThread(reel.id);
  const staleAt = new Date(Date.now() - STALE_PROCESSING_MS - 1000);
  await prisma.dialogueMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      kind: "processing",
      body: "Разбираю вашу мысль…",
      status: "pending",
      createdAt: staleAt,
    },
  });
  const freshPending = await prisma.dialogueMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      kind: "processing",
      body: "Разбираю вашу мысль…",
      status: "pending",
    },
  });
  const page = await listDialoguePage(reel.id, { limit: 20 });
  const errors = page.messages.filter((item) => item.kind === "error");
  const live = page.messages.find((item) => item.id === freshPending.id);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.status, "error");
  assert.equal(errors[0]?.body, STALE_PROCESSING_USER_MESSAGE);
  assert.equal(live?.kind, "processing");
  assert.equal(live?.status, "pending");
  assert.equal(page.analyzing, true);

  const take = await createTake(reel.id, { inputType: "text", bodyText: "дубль для job" });
  const videoPath = path.join(dir, "clip.mp4");
  writeFileSync(videoPath, "fake");
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
  assert.equal((await listRecoverableJobIds()).includes(hung.id), true);
  assert.equal(await recoverJobIfStale(hung.id), true);
  const stillHung = await prisma.job.findUnique({ where: { id: hung.id }});
  assert.equal(stillHung?.status, "analyzing");

  const exhausted = await prisma.job.create({
    data: {
      ownerUserId: "local",
      originalName: "exhausted.mp4",
      videoPath,
      status: "analyzing",
      stage: "analyze",
      attempts: 3,
      maxAttempts: 3,
      takeId: take.id,
      leaseUntil: new Date(Date.now() - 60_000),
      leaseOwner: "dead-worker",
    },
  });
  assert.equal((await listRecoverableJobIds()).includes(exhausted.id), false);
  assert.equal(await recoverJobIfStale(exhausted.id), false);
  const exhaustedRow = await prisma.job.findUnique({ where: { id: exhausted.id }});
  assert.equal(exhaustedRow?.status, "error");
  assert.equal(exhaustedRow?.errorMessage, EXHAUSTED_JOB_USER_MESSAGE);

  const runningExhausted = await prisma.job.create({
    data: {
      ownerUserId: "local",
      originalName: "running-exhausted.mp4",
      videoPath,
      status: "converting",
      stage: "convert",
      attempts: 3,
      maxAttempts: 3,
      takeId: take.id,
    },
  });
  const claimed = await processJob(runningExhausted.id);
  assert.equal(claimed.ok, false);
  const afterClaim = await prisma.job.findUnique({ where: { id: runningExhausted.id }});
  assert.equal(afterClaim?.status, "error");
});
