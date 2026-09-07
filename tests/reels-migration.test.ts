import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { backfillReels } from "../scripts/backfill-reels";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fileUrl(dbPath: string): string {
  return `file:${dbPath.replace(/\\/g, "/")}`;
}

function migrate(url: string) {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
    shell: true,
  });
}

test("baseline migrate, backfill, repeat, takes, archive", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-reels-"));
  const dbPath = path.join(dir, "test.db");
  const url = fileUrl(dbPath);
  process.env.DATABASE_URL = url;
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  t.after(async () => {
    await prisma.$disconnect();
    try {
      const db = await import("../src/lib/db");
      await db.prisma.$disconnect();
    } catch {
      /* db.ts мог не импортироваться */
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* SQLite на Windows иногда держит файл до выхода процесса */
    }
  });

  migrate(url);

  const jobA = await prisma.job.create({
    data: {
      originalName: "sample-a.mp4",
      videoPath: "memory://a",
      status: "done",
    },
  });
  const jobB = await prisma.job.create({
    data: {
      originalName: "sample-b.mp4",
      videoPath: "memory://b",
      status: "done",
    },
  });
  await prisma.analysisResult.create({
    data: {
      jobId: jobA.id,
      overallScore: 4.1,
      summary: "a",
      payload: '{"keep":"a"}',
    },
  });
  await prisma.analysisResult.create({
    data: {
      jobId: jobB.id,
      overallScore: 5.4,
      summary: "b",
      payload: '{"keep":"b"}',
    },
  });

  const first = await backfillReels(prisma);
  const second = await backfillReels(prisma);

  assert.equal(first.created, 2);
  assert.equal(first.reels, 2);
  assert.equal(first.takes, 2);
  assert.equal(first.linkedJobs, 2);
  assert.equal(second.created, 0);
  assert.equal(second.reels, 2);
  assert.equal(second.takes, 2);
  assert.equal(second.linkedJobs, 2);

  const results = await prisma.analysisResult.findMany({ orderBy: { summary: "asc" } });
  assert.equal(results[0].payload, '{"keep":"a"}');
  assert.equal(results[1].payload, '{"keep":"b"}');
  assert.equal(results[0].jobId, jobA.id);
  assert.equal(results[1].jobId, jobB.id);

  const linked = await prisma.job.findMany({ orderBy: { originalName: "asc" } });
  assert.ok(linked[0].takeId);
  assert.ok(linked[1].takeId);
  assert.notEqual(linked[0].takeId, linked[1].takeId);

  process.env.DATABASE_URL = url;
  const { createReel, createTake, archiveReel, updateReel, getReel, ReelError } = await import(
    "../src/lib/reels"
  );

  const card = await createReel({ title: "Идея", initialNote: "заметка" });
  assert.equal(card.status, "draft");
  assert.equal(card.takes.length, 0);

  const [t1, t2] = await Promise.all([
    createTake(card.id, { inputType: "text", authorNote: "один" }),
    createTake(card.id, { inputType: "text", authorNote: "два" }),
  ]);
  assert.notEqual(t1.number, t2.number);
  const numbers = [t1.number, t2.number].sort((a, b) => a - b);
  assert.deepEqual(numbers, [1, 2]);

  const sameA = await createTake(card.id, {
    inputType: "video",
    idempotencyKey: "req-1",
  });
  const sameB = await createTake(card.id, {
    inputType: "video",
    idempotencyKey: "req-1",
  });
  assert.equal(sameA.id, sameB.id);

  const textTake = await createTake(card.id, { inputType: "text" });
  assert.equal(textTake.inputType, "text");
  const jobsForText = await prisma.job.count({ where: { takeId: textTake.id } });
  assert.equal(jobsForText, 0);

  await assert.rejects(
    () => updateReel(card.id, { selectedTakeId: linked[0].takeId }),
    (err: unknown) => err instanceof ReelError && err.code === "TAKE_NOT_IN_REEL",
  );

  const selected = await updateReel(card.id, { selectedTakeId: t1.id });
  assert.equal(selected.selectedTakeId, t1.id);

  const archived = await archiveReel(card.id);
  assert.equal(archived.status, "archived");
  const afterArchive = await getReel(card.id);
  assert.ok(afterArchive);
  assert.ok(afterArchive.takes.length >= 3);
  const stillThere = await prisma.take.count({ where: { reelId: card.id } });
  assert.equal(stillThere, afterArchive.takes.length);

  const foreignJob = await prisma.job.findUnique({ where: { id: jobA.id } });
  assert.equal(foreignJob?.id, jobA.id);
  const mediaUntouched = await prisma.job.findMany({ select: { videoPath: true } });
  assert.ok(mediaUntouched.every((row) => row.videoPath.length > 0));
});
