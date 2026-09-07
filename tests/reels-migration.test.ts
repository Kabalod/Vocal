import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { backfillReels } from "../scripts/backfill-reels";
import { sha256Utf8 } from "../scripts/db-counts";
import { applyExistingSqlite, inspectSqlite } from "../scripts/migrate-existing-sqlite";
import { resetPrismaClient } from "../src/lib/db";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const initSql = readFileSync(
  path.join(repoRoot, "prisma/migrations/20260907120000_init/migration.sql"),
  "utf8",
);

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

function sqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((part) =>
      part
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

async function execSql(prisma: PrismaClient, sql: string) {
  for (const statement of sqlStatements(sql)) {
    await prisma.$executeRawUnsafe(statement);
  }
}

function tempDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-reels-"));
  const dbPath = path.join(dir, "test.db");
  return { dir, dbPath, url: fileUrl(dbPath) };
}

async function disconnectQuiet(prisma: PrismaClient, dir: string) {
  await prisma.$disconnect();
  try {
    await resetPrismaClient();
  } catch {
    /* клиент мог не создаваться */
  }
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* SQLite на Windows иногда держит файл */
  }
}

test("baseline migrate, backfill, idempotent job retry, concurrent bind", async (t) => {
  const { dir, url } = tempDb();
  process.env.DATABASE_URL = url;
  await resetPrismaClient();
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  t.after(() => disconnectQuiet(prisma, dir));

  migrateDeploy(url);

  const jobA = await prisma.job.create({
    data: { originalName: "sample-a.mp4", videoPath: "memory://a", status: "done" },
  });
  const jobB = await prisma.job.create({
    data: { originalName: "sample-b.mp4", videoPath: "memory://b", status: "done" },
  });
  await prisma.analysisResult.create({
    data: { jobId: jobA.id, overallScore: 4.1, summary: "a", payload: '{"keep":"a"}' },
  });
  await prisma.analysisResult.create({
    data: { jobId: jobB.id, overallScore: 5.4, summary: "b", payload: '{"keep":"b"}' },
  });

  const first = await backfillReels(prisma);
  const second = await backfillReels(prisma);
  assert.equal(first.created, 2);
  assert.equal(second.created, 0);
  assert.equal(second.reels, first.reels);
  assert.equal(second.takes, first.takes);

  const { createReel, createTake, archiveReel, updateReel, getReel, ReelError } = await import(
    "../src/lib/reels"
  );

  const card = await createReel({ title: "Идея", initialNote: "заметка" });
  const [t1, t2] = await Promise.all([
    createTake(card.id, { inputType: "text", authorNote: "один" }),
    createTake(card.id, { inputType: "text", authorNote: "два" }),
  ]);
  assert.notEqual(t1.number, t2.number);

  const freeJob = await prisma.job.create({
    data: { originalName: "retry.mp4", videoPath: "memory://retry", status: "queued" },
  });
  const takesBeforeRetry = await prisma.take.count();
  const firstReq = await createTake(card.id, {
    inputType: "video",
    jobId: freeJob.id,
    idempotencyKey: "upload-1",
  });
  const secondReq = await createTake(card.id, {
    inputType: "video",
    jobId: freeJob.id,
    idempotencyKey: "upload-1",
  });
  assert.equal(firstReq.id, secondReq.id);
  assert.equal(await prisma.take.count(), takesBeforeRetry + 1);
  const rebound = await prisma.job.findUnique({ where: { id: freeJob.id } });
  assert.equal(rebound?.takeId, firstReq.id);

  const contestJob = await prisma.job.create({
    data: { originalName: "race.mp4", videoPath: "memory://race", status: "queued" },
  });
  const reelX = await createReel({ title: "Карточка X" });
  const reelY = await createReel({ title: "Карточка Y" });
  const takesBeforeRace = await prisma.take.count();
  const raced = await Promise.allSettled([
    createTake(reelX.id, { inputType: "video", jobId: contestJob.id }),
    createTake(reelY.id, { inputType: "video", jobId: contestJob.id }),
  ]);
  const fulfilled = raced.filter((row) => row.status === "fulfilled");
  const rejected = raced.filter((row) => row.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
  assert.ok(rejectedReason instanceof ReelError && rejectedReason.code === "JOB_HAS_TAKE");
  assert.equal(await prisma.take.count(), takesBeforeRace + 1);
  const contest = await prisma.job.findUnique({ where: { id: contestJob.id } });
  assert.ok(contest?.takeId);
  const winner = fulfilled[0] as PromiseFulfilledResult<{ id: string }>;
  assert.equal(contest.takeId, winner.value.id);

  const textTake = await createTake(card.id, { inputType: "text" });
  assert.equal(await prisma.job.count({ where: { takeId: textTake.id } }), 0);

  const linked = await prisma.job.findMany({
    where: { originalName: { in: ["sample-a.mp4", "sample-b.mp4"] } },
  });
  await assert.rejects(
    () => updateReel(card.id, { selectedTakeId: linked[0].takeId }),
    (err: unknown) => err instanceof ReelError && err.code === "TAKE_NOT_IN_REEL",
  );
  const selected = await updateReel(card.id, { selectedTakeId: t1.id });
  assert.equal(selected.selectedTakeId, t1.id);
  const archived = await archiveReel(card.id);
  assert.equal(archived.status, "archived");
  const afterArchive = await getReel(card.id);
  assert.ok(afterArchive && afterArchive.takes.length >= 3);
});

test("empty sqlite uses migrate deploy, not baseline", async (t) => {
  const { dir, url } = tempDb();
  t.after(async () => {
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    await disconnectQuiet(prisma, dir);
  });

  assert.equal((await inspectSqlite(url)).kind, "empty");
  const kind = await applyExistingSqlite(url);
  assert.equal(kind, "empty");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  await prisma.$disconnect();
  const names = tables.map((row) => row.name);
  assert.ok(names.includes("Job"));
  assert.ok(names.includes("Reel"));
  assert.ok(names.includes("_prisma_migrations"));
});

test("unknown sqlite schema does not get a fake baseline", async (t) => {
  const { dir, url } = tempDb();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  t.after(() => disconnectQuiet(prisma, dir));

  await prisma.$executeRawUnsafe(`CREATE TABLE "Odd" ("id" TEXT NOT NULL PRIMARY KEY)`);
  const inspection = await inspectSqlite(url);
  assert.equal(inspection.kind, "unknown");
  await assert.rejects(() => applyExistingSqlite(url), /Нельзя помечать baseline/);
  const migrations = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE name='_prisma_migrations'`,
  );
  assert.equal(migrations.length, 0);
});

test("legacy db-push database survives Job rewrite, payload and fk check", async (t) => {
  const { dir, url } = tempDb();
  const raw = new PrismaClient({ datasources: { db: { url } } });
  t.after(() => disconnectQuiet(raw, dir));

  await execSql(raw, initSql);
  assert.equal((await inspectSqlite(url)).kind, "legacy_db_push");

  const payloadA = '{"keep":"legacy-a","z":true}';
  const payloadB = '{"keep":"legacy-b","items":[1,2]}';
  await raw.$executeRawUnsafe(
    `INSERT INTO "Job" ("id","originalName","videoPath","audioPath","durationSec","status","errorCode","errorMessage","createdAt","updatedAt")
     VALUES ('job-legacy-a','old-a.mp4','memory://old-a',NULL,12.5,'done',NULL,NULL,'2026-01-02T03:04:05.000Z','2026-01-02T03:04:05.000Z')`,
  );
  await raw.$executeRawUnsafe(
    `INSERT INTO "Job" ("id","originalName","videoPath","audioPath","durationSec","status","errorCode","errorMessage","createdAt","updatedAt")
     VALUES ('job-legacy-b','old-b.mp4','memory://old-b','memory://old-b.mp3',40,'error','STT','нет речи','2026-01-03T03:04:05.000Z','2026-01-03T03:04:05.000Z')`,
  );
  await raw.$executeRawUnsafe(
    `INSERT INTO "AnalysisResult" ("id","jobId","overallScore","summary","payload","createdAt")
     VALUES ('ar-legacy-a','job-legacy-a',4.1,'sa',?, '2026-01-02T03:04:06.000Z')`,
    payloadA,
  );
  await raw.$executeRawUnsafe(
    `INSERT INTO "AnalysisResult" ("id","jobId","overallScore","summary","payload","createdAt")
     VALUES ('ar-legacy-b','job-legacy-b',5.4,'sb',?, '2026-01-03T03:04:06.000Z')`,
    payloadB,
  );

  const kind = await applyExistingSqlite(url);
  assert.equal(kind, "legacy_db_push");

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const jobA = await prisma.job.findUnique({ where: { id: "job-legacy-a" } });
  const jobB = await prisma.job.findUnique({ where: { id: "job-legacy-b" } });
  assert.equal(jobA?.originalName, "old-a.mp4");
  assert.equal(jobA?.videoPath, "memory://old-a");
  assert.equal(jobA?.durationSec, 12.5);
  assert.equal(jobA?.status, "done");
  assert.equal(jobA?.takeId, null);
  assert.equal(jobB?.audioPath, "memory://old-b.mp3");
  assert.equal(jobB?.errorCode, "STT");
  assert.equal(jobB?.errorMessage, "нет речи");

  const first = await backfillReels(prisma);
  const second = await backfillReels(prisma);
  assert.equal(first.created, 2);
  assert.equal(second.created, 0);
  assert.equal(second.reels, 2);
  assert.equal(second.takes, 2);

  const afterA = await prisma.job.findUnique({ where: { id: "job-legacy-a" } });
  const afterB = await prisma.job.findUnique({ where: { id: "job-legacy-b" } });
  assert.ok(afterA?.takeId);
  assert.ok(afterB?.takeId);
  assert.notEqual(afterA.takeId, afterB.takeId);

  const takeA = await prisma.take.findUnique({ where: { id: afterA.takeId } });
  const takeB = await prisma.take.findUnique({ where: { id: afterB.takeId } });
  assert.equal(takeA?.number, 1);
  assert.equal(takeB?.number, 1);
  assert.notEqual(takeA?.reelId, takeB?.reelId);

  const results = await prisma.analysisResult.findMany({ orderBy: { id: "asc" } });
  assert.equal(results[0].jobId, "job-legacy-a");
  assert.equal(results[0].payload, payloadA);
  assert.equal(results[1].payload, payloadB);
  assert.equal(sha256Utf8(results[0].payload), sha256Utf8(payloadA));
  assert.equal(sha256Utf8(results[1].payload), sha256Utf8(payloadB));

  const fk = await prisma.$queryRawUnsafe<Array<unknown>>(`PRAGMA foreign_key_check`);
  assert.equal(fk.length, 0);
  await prisma.$disconnect();
});
