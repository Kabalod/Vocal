import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";

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

test("reel workspace API: create, isolate edits, search, archive, stale", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-workspace-"));
  const url = fileUrl(path.join(dir, "test.db"));
  process.env.DATABASE_URL = url;
  await resetPrismaClient();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  });
  migrateDeploy(url);

  const { GET: listGet, POST } = await import("../src/app/api/reels/route");
  const { GET: itemGet, PATCH } = await import("../src/app/api/reels/[id]/route");
  const { GET: jobsGet } = await import("../src/app/api/jobs/route");

  const createdA = await POST(
    new Request("http://vocal.local/api/reels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Первая идея", initialNote: "заметка А" }),
    }),
  );
  const createdB = await POST(
    new Request("http://vocal.local/api/reels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Вторая идея", initialNote: "заметка Б" }),
    }),
  );
  assert.equal(createdA.status, 201);
  assert.equal(createdB.status, 201);
  const reelA = (await createdA.json()).reel;
  const reelB = (await createdB.json()).reel;
  assert.equal(reelA.status, "idea");
  assert.notEqual(reelA.id, reelB.id);

  const patchedA = await PATCH(
    new Request(`http://vocal.local/api/reels/${reelA.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Первая идея (правка)",
        initialNote: "только А",
        expectedUpdatedAt: reelA.updatedAt,
      }),
    }),
    { params: Promise.resolve({ id: reelA.id }) },
  );
  assert.equal(patchedA.status, 200);

  const stillB = await itemGet(new Request(`http://vocal.local/api/reels/${reelB.id}`), {
    params: Promise.resolve({ id: reelB.id }),
  });
  const bodyB = await stillB.json();
  assert.equal(bodyB.reel.title, "Вторая идея");
  assert.equal(bodyB.reel.initialNote, "заметка Б");

  const search = await listGet(new Request("http://vocal.local/api/reels?q=только&status=open"));
  const searchBody = await search.json();
  assert.equal(search.status, 200);
  assert.equal(searchBody.reels.length, 1);
  assert.equal(searchBody.reels[0].id, reelA.id);

  const archived = await PATCH(
    new Request(`http://vocal.local/api/reels/${reelA.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "archived",
        expectedUpdatedAt: (await patchedA.json()).reel.updatedAt,
      }),
    }),
    { params: Promise.resolve({ id: reelA.id }) },
  );
  assert.equal(archived.status, 200);
  const openList = await (await listGet(new Request("http://vocal.local/api/reels?status=open"))).json();
  assert.equal(openList.reels.some((row: { id: string }) => row.id === reelA.id), false);
  const archiveList = await (
    await listGet(new Request("http://vocal.local/api/reels?status=archived"))
  ).json();
  assert.equal(archiveList.reels.some((row: { id: string }) => row.id === reelA.id), true);

  const restored = await PATCH(
    new Request(`http://vocal.local/api/reels/${reelA.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "idea",
        expectedUpdatedAt: (await archived.json()).reel.updatedAt,
      }),
    }),
    { params: Promise.resolve({ id: reelA.id }) },
  );
  assert.equal(restored.status, 200);

  const firstB = await PATCH(
    new Request(`http://vocal.local/api/reels/${reelB.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Вторая идея v2", expectedUpdatedAt: reelB.updatedAt }),
    }),
    { params: Promise.resolve({ id: reelB.id }) },
  );
  assert.equal(firstB.status, 200);
  const staleB = await PATCH(
    new Request(`http://vocal.local/api/reels/${reelB.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "не должно записаться", expectedUpdatedAt: reelB.updatedAt }),
    }),
    { params: Promise.resolve({ id: reelB.id }) },
  );
  assert.equal(staleB.status, 409);
  const afterStale = await (await itemGet(new Request(`http://vocal.local/api/reels/${reelB.id}`), {
    params: Promise.resolve({ id: reelB.id }),
  })).json();
  assert.equal(afterStale.reel.title, "Вторая идея v2");

  const missing = await itemGet(new Request("http://vocal.local/api/reels/does-not-exist"), {
    params: Promise.resolve({ id: "does-not-exist" }),
  });
  assert.equal(missing.status, 404);

  const jobs = await jobsGet();
  assert.equal(jobs.status, 200);
  const jobsBody = await jobs.json();
  assert.ok(Array.isArray(jobsBody.jobs));

  await prisma.reel.create({
    data: { title: "legacy draft", initialNote: "", status: "draft" },
  });
  const ideas = await (await listGet(new Request("http://vocal.local/api/reels?status=idea"))).json();
  assert.ok(ideas.reels.some((row: { title: string }) => row.title === "legacy draft"));

  const race = await prisma.reel.create({
    data: { title: "гонка", initialNote: "0", status: "idea" },
  });
  const version = race.updatedAt.toISOString();
  const { updateReel, ReelError } = await import("../src/lib/reels");
  const raced = await Promise.allSettled([
    updateReel(race.id, { initialNote: "alpha", expectedUpdatedAt: version }),
    updateReel(race.id, { initialNote: "beta", expectedUpdatedAt: version }),
  ]);
  const ok = raced.filter((row) => row.status === "fulfilled");
  const bad = raced.filter((row) => row.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(bad.length, 1);
  const reason = (bad[0] as PromiseRejectedResult).reason;
  assert.ok(reason instanceof ReelError && reason.code === "STALE");
  const winner = (ok[0] as PromiseFulfilledResult<{ initialNote: string }>).value;
  const stored = await prisma.reel.findUnique({ where: { id: race.id } });
  assert.equal(stored?.initialNote, winner.initialNote);
  assert.ok(stored?.initialNote === "alpha" || stored?.initialNote === "beta");
});
