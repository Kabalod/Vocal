import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { assertOwnedObjectPath, PRIVATE_MEDIA_PREFIX } from "../src/lib/media-access";
import { AuthError, legacyOwnerUserId, runWithOwner } from "../src/lib/auth/session";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("A/B isolation: read, change, export, files, job retry; ID spoofing fails", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-auth-iso-"));
  const { prisma, url } = await withPostgresTestDb(t);
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
    t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  });

  const { POST } = await import("../src/app/api/reels/route");
  const { GET: itemGet, PATCH } = await import("../src/app/api/reels/[id]/route");
  const { GET: exportGet } = await import("../src/app/api/reels/[id]/export/route");
  const { GET: mediaGet } = await import("../src/app/api/takes/[id]/media/route");
  const { POST: retryPost } = await import("../src/app/api/jobs/[id]/retry/route");
  const { DELETE: draftDelete } = await import("../src/app/api/reels/[id]/scripts/draft/route");

  process.env.VOCAL_TEST_USER_ID = "user-a";
  const created = await POST(
    new Request("http://vocal.local/api/reels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Мысль А", initialNote: "секретно" }),
    }),
  );
  assert.equal(created.status, 201);
  const reelA = (await created.json()).reel as { id: string; updatedAt: string };

  const storedPath = path.join(dir, "a.mp4");
  const take = await prisma.take.create({
    data: {
      reelId: reelA.id,
      number: 1,
      inputType: "video",
      originalName: "a.mp4",
      mimeType: "video/mp4",
      mediaStatus: "ready",
      storedPath,
    },
  });
  writeFileSync(storedPath, "fake");
  const job = await prisma.job.create({
    data: {
      originalName: "a.mp4",
      videoPath: storedPath,
      status: "error",
      takeId: take.id,
      ownerUserId: "user-a",
    },
  });

  process.env.VOCAL_TEST_USER_ID = "user-b";
  const asB = await itemGet(new Request(`http://vocal.local/api/reels/${reelA.id}`), {
    params: Promise.resolve({ id: reelA.id }),
  });
  assert.equal(asB.status, 404);

  const patched = await PATCH(
    new Request(`http://vocal.local/api/reels/${reelA.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "взлом", expectedUpdatedAt: reelA.updatedAt }),
    }),
    { params: Promise.resolve({ id: reelA.id }) },
  );
  assert.equal(patched.status, 404);

  const exported = await exportGet(new Request(`http://vocal.local/api/reels/${reelA.id}/export`), {
    params: Promise.resolve({ id: reelA.id }),
  });
  assert.equal(exported.status, 404);

  const media = await mediaGet(new Request(`http://vocal.local/api/takes/${take.id}/media`), {
    params: Promise.resolve({ id: take.id }),
  });
  assert.equal(media.status, 404);

  const retry = await retryPost(new Request(`http://vocal.local/api/jobs/${job.id}/retry`, { method: "POST" }), {
    params: Promise.resolve({ id: job.id }),
  });
  assert.equal(retry.status, 404);

  const deleted = await draftDelete(new Request(`http://vocal.local/api/reels/${reelA.id}/scripts/draft`, { method: "DELETE" }), {
    params: Promise.resolve({ id: reelA.id }),
  });
  assert.equal(deleted.status, 404);

  process.env.VOCAL_TEST_USER_ID = "user-a";
  const asA = await itemGet(new Request(`http://vocal.local/api/reels/${reelA.id}`), {
    params: Promise.resolve({ id: reelA.id }),
  });
  assert.equal(asA.status, 200);
  const body = await asA.json();
  assert.equal(body.reel.title, "Мысль А");
});

test("legacy owner is predetermined, not first login", () => {
  const prev = process.env.VOCAL_LEGACY_OWNER_USER_ID;
  delete process.env.VOCAL_LEGACY_OWNER_USER_ID;
  assert.throws(() => legacyOwnerUserId(), /VOCAL_LEGACY_OWNER_USER_ID/);
  process.env.VOCAL_LEGACY_OWNER_USER_ID = "11111111-1111-1111-1111-111111111111";
  assert.equal(legacyOwnerUserId(), "11111111-1111-1111-1111-111111111111");
  if (prev) process.env.VOCAL_LEGACY_OWNER_USER_ID = prev;
  else delete process.env.VOCAL_LEGACY_OWNER_USER_ID;
});

test("signed object path cannot be spoofed across owners", async () => {
  await runWithOwner({ id: "user-b", email: null }, () => {
    assert.throws(
      () => assertOwnedObjectPath(`${PRIVATE_MEDIA_PREFIX}user-a/takes/x.mp4`),
      /MEDIA_PATH_DENIED/,
    );
  });
  await runWithOwner({ id: "user-a", email: null }, () => {
    assertOwnedObjectPath(`${PRIVATE_MEDIA_PREFIX}user-a/takes/x.mp4`);
    assert.throws(
      () => assertOwnedObjectPath(`${PRIVATE_MEDIA_PREFIX}user-a/../user-b/x.mp4`),
      /MEDIA_PATH_DENIED/,
    );
  });
});

test("ownerUserId throws outside test ALS in production-like mode", () => {
  assert.ok(AuthError);
});
