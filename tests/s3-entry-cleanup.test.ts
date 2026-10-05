import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("S3 /jobs/[id]: another owner's job is not found, own job resolves to its thought", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { runWithOwner } = await import("../src/lib/auth/session");
  const { ownedJobReelId } = await import("../src/lib/job-deeplink");
  const { createReel, createTake } = await import("../src/lib/reels");

  const mine = await runWithOwner({ id: "user-a", email: null }, async () => {
    const reel = await createReel({ title: "Моя" });
    const job = await prisma.job.create({
      data: { ownerUserId: "user-a", originalName: "a.mp4", videoPath: "x", status: "queued", stage: "convert", maxAttempts: 3 },
    });
    await createTake(reel.id, { inputType: "video", jobId: job.id });
    return { reelId: reel.id, jobId: job.id };
  });

  assert.equal(await runWithOwner({ id: "user-a", email: null }, () => ownedJobReelId(mine.jobId)), mine.reelId);
  assert.equal(
    await runWithOwner({ id: "user-b", email: null }, () => ownedJobReelId(mine.jobId)),
    undefined,
    "a foreign job must look missing (404), not redirect to the owner's thought",
  );
  assert.equal(await runWithOwner({ id: "user-a", email: null }, () => ownedJobReelId("missing")), undefined);

  const page = readFileSync(path.join(repoRoot, "src/app/jobs/[id]/page.tsx"), "utf8");
  assert.match(page, /ownedJobReelId/);
  assert.match(page, /notFound\(\)/);
});

test("S3 POST /api/uploads without reelId is gone (410) and creates nothing", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { POST } = await import("../src/app/api/uploads/route");
  const form = new FormData();
  form.set("file", new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" }));
  const response = await POST(new Request("http://vocal.local/api/uploads", { method: "POST", body: form }));
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, "GONE");
  assert.equal(await prisma.job.count(), 0);
  assert.equal(await prisma.reel.count(), 0);
});

test("S3 dialogue prompt no longer carries the unreachable goal/audience fields", () => {
  const dialogue = readFileSync(path.join(repoRoot, "src/lib/dialogue.ts"), "utf8");
  assert.equal(dialogue.includes("Цель ролика"), false);
  assert.equal(dialogue.includes("Аудитория ролика"), false);
});
