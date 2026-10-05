import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const child = path.resolve(path.dirname(new URL(import.meta.url).pathname), "helpers/job-worker-child.ts");

function startChild(env: Record<string, string>): { proc: ChildProcess; output: () => string; waitFor: (text: string, ms?: number) => Promise<void>; exited: Promise<number | null> } {
  const proc = spawn(process.execPath, ["--import", "tsx", child], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  proc.stdout!.on("data", (chunk) => (out += chunk));
  proc.stderr!.on("data", (chunk) => (out += chunk));
  const exited = new Promise<number | null>((resolve) => proc.on("exit", (code) => resolve(code)));
  const waitFor = async (text: string, ms = 60_000) => {
    const deadline = Date.now() + ms;
    while (!out.includes(text)) {
      if (Date.now() > deadline) throw new Error(`timeout waiting for "${text}". output:\n${out}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  return { proc, output: () => out, waitFor, exited };
}

async function prepare(t: Parameters<typeof withPostgresTestDb>[0]) {
  const root = mkdtempSync(path.join(tmpdir(), "vocal-s4-"));
  process.env.VOCAL_STORAGE_ROOT = root;
  process.env.VOCAL_SKIP_JOB_ENQUEUE = "1";
  const { prisma, url } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(async () => {
    delete process.env.VOCAL_STORAGE_ROOT;
    delete process.env.VOCAL_SKIP_JOB_ENQUEUE;
    await prisma.$disconnect();
    await resetPrismaClient();
    rmSync(root, { recursive: true, force: true });
  });
  const { createThoughtFromMedia } = await import("../src/lib/thought-media");
  const media = await createThoughtFromMedia({
    file: new File([Buffer.from("restart-media")], "clip.webm", { type: "audio/webm" }),
    inputType: "audio",
    idempotencyKey: `restart-${Date.now()}`,
  });
  const take = await prisma.take.findFirstOrThrow({ where: { reelId: media.reel.id } });
  const sttLog = path.join(root, "stt.log");
  writeFileSync(sttLog, "");
  const env = {
    NODE_ENV: "test",
    TEST_DATABASE_URL: url,
    DATABASE_URL: url,
    VOCAL_STORAGE_ROOT: root,
    VOCAL_JOB_LEASE_MS: "1500",
    VOCAL_SKIP_JOB_ENQUEUE: "1",
    STT_LOG: sttLog,
    JOB_ID: media.job.id,
  };
  return { prisma, env, media, take, sttLog };
}

const sttCalls = (file: string) => readFileSync(file, "utf8").split("\n").filter(Boolean).length;

test("S4 hard kill during STT: after the lease the job is recovered and finishes once, the file stays", async (t) => {
  const { prisma, env, media, take, sttLog } = await prepare(t);

  const first = startChild({ ...env, MODE: "run", STT_MS: "30000" });
  await first.waitFor("IN_STT");
  first.proc.kill("SIGKILL");
  await first.exited;
  assert.equal(sttCalls(sttLog), 1);
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: media.job.id } })).status, "transcribing");

  await new Promise((resolve) => setTimeout(resolve, 2000)); // lease (1.5 s) expires
  const second = startChild({ ...env, MODE: "recover", STT_MS: "200" });
  await second.waitFor("RECOVERED");
  await second.exited;

  const job = await prisma.job.findUniqueOrThrow({ where: { id: media.job.id } });
  assert.equal(job.status, "done");
  assert.equal(job.attempts, 2, "one attempt per process");
  assert.equal(await prisma.transcriptRevision.count({ where: { takeId: take.id, kind: "original" } }), 1);
  assert.equal(sttCalls(sttLog), 2, "the killed STT is not shared, the replay runs once");
  const stored = (await prisma.take.findUniqueOrThrow({ where: { id: take.id } })).storedPath!;
  assert.ok(existsSync(stored), "the uploaded media file is still there");

  const third = startChild({ ...env, MODE: "recover", STT_MS: "200" });
  await third.waitFor("RECOVERED");
  await third.exited;
  assert.equal(sttCalls(sttLog), 2, "a finished job is never processed again");
  assert.equal(await prisma.transcriptRevision.count({ where: { takeId: take.id, kind: "original" } }), 1);
});

test("S4 SIGTERM during STT: the running job is allowed to finish before the process exits", async (t) => {
  const { prisma, env, media, take, sttLog } = await prepare(t);
  const proc = startChild({ ...env, MODE: "graceful", STT_MS: "1500" });
  await proc.waitFor("IN_STT");
  proc.proc.kill("SIGTERM");
  await proc.waitFor("SHUTDOWN");
  assert.match(proc.output(), /SHUTDOWN drained=true released=0/);
  assert.equal(await proc.exited, 0);

  const job = await prisma.job.findUniqueOrThrow({ where: { id: media.job.id } });
  assert.equal(job.status, "done");
  assert.equal(await prisma.transcriptRevision.count({ where: { takeId: take.id, kind: "original" } }), 1);
  assert.equal(sttCalls(sttLog), 1);
});

test("S4 SIGTERM with a job that outlives the grace period: the lease is released for immediate takeover", async (t) => {
  const { prisma, env, media, sttLog } = await prepare(t);
  const proc = startChild({ ...env, MODE: "graceful", STT_MS: "60000", VOCAL_JOB_LEASE_MS: "600000" });
  await proc.waitFor("IN_STT");
  proc.proc.kill("SIGTERM");
  await proc.waitFor("SHUTDOWN", 30_000);
  assert.match(proc.output(), /released=1/);
  await proc.exited;

  const job = await prisma.job.findUniqueOrThrow({ where: { id: media.job.id } });
  assert.equal(job.leaseOwner, null);
  assert.equal(job.leaseUntil, null);
  assert.notEqual(job.status, "done");

  // The next process takes it over immediately, although the old lease was ten minutes long.
  const next = startChild({ ...env, MODE: "recover", STT_MS: "200", VOCAL_JOB_LEASE_MS: "600000" });
  await next.waitFor("RECOVERED");
  await next.exited;
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: media.job.id } })).status, "done");
  assert.equal(sttCalls(sttLog), 2);
});
