import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { writeFile as fsWriteFile, unlink as fsUnlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { isPathInsideRoot } from "../src/lib/storage";
import { parseByteRange } from "../src/lib/take-media";
import { canPlayInBrowser } from "../src/lib/take-playback";

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

test("byte range and browser playback helpers", () => {
  assert.deepEqual(parseByteRange(null, 10), { start: 0, end: 9, partial: false });
  assert.deepEqual(parseByteRange("bytes=0-3", 10), { start: 0, end: 3, partial: true });
  assert.deepEqual(parseByteRange("bytes=8-", 10), { start: 8, end: 9, partial: true });
  assert.equal(parseByteRange("bytes=99-100", 10), null);
  assert.equal(canPlayInBrowser("video", "a.mp4"), true);
  assert.equal(canPlayInBrowser("video", "a.mkv"), false);
  assert.equal(canPlayInBrowser("audio", "a.mp3"), true);
  const root = path.join(tmpdir(), "vocal-root");
  assert.equal(isPathInsideRoot(root, path.join(root, "clip.mp4")), true);
  assert.equal(isPathInsideRoot(root, path.join(root, "..", "secret.txt")), false);
});

test("take media API: types, idempotency, range, path deny, no auto-final, no job", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-takes-"));
  const storage = path.join(dir, "storage");
  const url = fileUrl(path.join(dir, "test.db"));
  process.env.DATABASE_URL = url;
  process.env.VOCAL_STORAGE_ROOT = storage;
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

  const { POST: createReel } = await import("../src/app/api/reels/route");
  const { GET: getReel, PATCH: patchReel } = await import("../src/app/api/reels/[id]/route");
  const { GET: listTakes, POST: postTake } = await import("../src/app/api/reels/[id]/takes/route");
  const { GET: getTake, PATCH: patchTake } = await import("../src/app/api/takes/[id]/route");
  const { GET: getMedia } = await import("../src/app/api/takes/[id]/media/route");
  const { POST: upload } = await import("../src/app/api/uploads/route");

  const created = await createReel(
    new Request("http://vocal.local/api/reels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Карточка дублей" }),
    }),
  );
  const reel = (await created.json()).reel as { id: string; selectedTakeId: string | null };

  const deniedPath = await postTake(
    new Request(`http://vocal.local/api/reels/${reel.id}/takes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputType: "text", bodyText: "ok", storedPath: "C:\\\\Windows\\\\win.ini" }),
    }),
    { params: Promise.resolve({ id: reel.id }) },
  );
  assert.equal(deniedPath.status, 400);

  const textA = await postTake(
    new Request(`http://vocal.local/api/reels/${reel.id}/takes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputType: "text", bodyText: "первая текстовая", authorNote: "черновик" }),
    }),
    { params: Promise.resolve({ id: reel.id }) },
  );
  const textB = await postTake(
    new Request(`http://vocal.local/api/reels/${reel.id}/takes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputType: "text", bodyText: "вторая текстовая" }),
    }),
    { params: Promise.resolve({ id: reel.id }) },
  );
  assert.equal(textA.status, 201);
  assert.equal(textB.status, 201);
  const takeA = (await textA.json()).take;
  const takeB = (await textB.json()).take;
  assert.notEqual(takeA.id, takeB.id);
  assert.equal(takeA.number, 1);
  assert.equal(takeB.number, 2);
  assert.equal(takeA.inputType, "text");
  assert.equal(takeA.hasFile, false);
  assert.equal(takeA.bodyText, "первая текстовая");

  const bytes = Buffer.from("0123456789abcdef");
  const file = new File([bytes], "clip.mp4", { type: "video/mp4" });
  async function uploadOnce(key: string) {
    const form = new FormData();
    form.set("file", file);
    form.set("reelId", reel.id);
    form.set("inputType", "video");
    form.set("idempotencyKey", key);
    return upload(
      new Request("http://vocal.local/api/uploads", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: form,
      }),
    );
  }
  const key = "same-upload-once";
  const up1 = await uploadOnce(key);
  const up2 = await uploadOnce(key);
  assert.equal(up1.status, 201);
  assert.equal(up2.status, 201);
  const videoTake = (await up1.json()).take;
  const videoAgain = (await up2.json()).take;
  assert.equal(videoTake.id, videoAgain.id);
  assert.equal(videoTake.hasFile, true);
  assert.equal(videoTake.browserPlayback, true);
  assert.equal(videoTake.inputType, "video");

  const audioFile = new File([bytes], "voice.mp3", { type: "audio/mpeg" });
  const audioForm = new FormData();
  audioForm.set("file", audioFile);
  audioForm.set("reelId", reel.id);
  audioForm.set("inputType", "audio");
  const audioRes = await upload(
    new Request("http://vocal.local/api/uploads", { method: "POST", body: audioForm }),
  );
  assert.equal(audioRes.status, 201);
  const audioTake = (await audioRes.json()).take;
  assert.equal(audioTake.inputType, "audio");

  const listed = await listTakes(new Request("http://vocal.local/api/reels/x/takes"), {
    params: Promise.resolve({ id: reel.id }),
  });
  const listedBody = await listed.json();
  assert.equal(listedBody.takes.length, 4);

  const afterCreates = await (await getReel(new Request(`http://vocal.local/api/reels/${reel.id}`), {
    params: Promise.resolve({ id: reel.id }),
  })).json();
  assert.equal(afterCreates.reel.selectedTakeId, null);
  assert.equal(afterCreates.reel.takeCount, 4);

  const notePatch = await patchTake(
    new Request(`http://vocal.local/api/takes/${takeA.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorNote: "что менял" }),
    }),
    { params: Promise.resolve({ id: takeA.id }) },
  );
  assert.equal(notePatch.status, 200);
  assert.equal((await notePatch.json()).take.authorNote, "что менял");

  const pathPatch = await patchTake(
    new Request(`http://vocal.local/api/takes/${takeA.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storedPath: "C:\\\\Windows\\\\win.ini" }),
    }),
    { params: Promise.resolve({ id: takeA.id }) },
  );
  assert.equal(pathPatch.status, 400);

  const finalised = await patchReel(
    new Request(`http://vocal.local/api/reels/${reel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedTakeId: takeB.id,
        expectedUpdatedAt: afterCreates.reel.updatedAt,
      }),
    }),
    { params: Promise.resolve({ id: reel.id }) },
  );
  assert.equal(finalised.status, 200);
  assert.equal((await finalised.json()).reel.selectedTakeId, takeB.id);

  const media = await getMedia(
    new Request(`http://vocal.local/api/takes/${videoTake.id}/media`, {
      headers: { Range: "bytes=0-3" },
    }),
    { params: Promise.resolve({ id: videoTake.id }) },
  );
  assert.equal(media.status, 206);
  assert.equal(media.headers.get("content-range"), "bytes 0-3/16");
  assert.equal(Buffer.from(await media.arrayBuffer()).toString(), "0123");

  const outside = path.join(dir, "outside.bin");
  writeFileSync(outside, "secret");
  await prisma.take.update({ where: { id: videoTake.id }, data: { storedPath: outside } });
  const stolen = await getMedia(new Request(`http://vocal.local/api/takes/${videoTake.id}/media`), {
    params: Promise.resolve({ id: videoTake.id }),
  });
  assert.equal(stolen.status, 404);
  assert.equal((await stolen.json()).code, "MEDIA_DENIED");

  await prisma.take.update({
    where: { id: videoTake.id },
    data: { storedPath: null, mediaStatus: "failed" },
  });
  const failed = await getTake(new Request(`http://vocal.local/api/takes/${videoTake.id}`), {
    params: Promise.resolve({ id: videoTake.id }),
  });
  const failedTake = (await failed.json()).take;
  assert.equal(failedTake.mediaStatus, "failed");
  assert.equal(failedTake.hasFile, false);

  assert.equal(await prisma.job.count(), 0);
});

test("createTake stores pending; parallel same-key upload writes once", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-takes-race-"));
  const storage = path.join(dir, "storage");
  const url = fileUrl(path.join(dir, "test.db"));
  process.env.DATABASE_URL = url;
  process.env.VOCAL_STORAGE_ROOT = storage;
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

  const { createReel } = await import("../src/lib/reels");
  const { saveUploadedTake } = await import("../src/lib/takes");
  const reel = await createReel({ title: "гонка загрузки" });
  const file = new File([Buffer.from("0123456789abcdef")], "clip.mp4", { type: "video/mp4" });
  const key = "parallel-key";

  let releaseWrite: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  let writes = 0;
  const slowIo = {
    writeFile: async (dest: string, data: Buffer) => {
      writes += 1;
      await gate;
      await fsWriteFile(dest, data);
    },
    unlink: fsUnlink,
  };

  const first = saveUploadedTake(
    { reelId: reel.id, file, inputType: "video", idempotencyKey: key },
    slowIo,
  );
  for (let i = 0; i < 40 && writes === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(writes, 1);
  const pending = await prisma.take.findFirst({ where: { reelId: reel.id } });
  assert.equal(pending?.mediaStatus, "pending");
  assert.equal(pending?.originalName, "clip.mp4");
  assert.ok(pending?.mimeType);

  const second = saveUploadedTake({
    reelId: reel.id,
    file,
    inputType: "video",
    idempotencyKey: key,
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(writes, 1);
  releaseWrite?.();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.id, b.id);
  assert.equal(a.mediaStatus, "ready");
  assert.equal(b.mediaStatus, "ready");
  assert.equal(writes, 1);
  assert.ok(a.hasFile);
  assert.equal(await prisma.take.count({ where: { reelId: reel.id } }), 1);
});

test("failed parallel upload does not delete a sibling success path; only claimer writes", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-takes-fail-"));
  const storage = path.join(dir, "storage");
  const url = fileUrl(path.join(dir, "test.db"));
  process.env.DATABASE_URL = url;
  process.env.VOCAL_STORAGE_ROOT = storage;
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

  const { createReel } = await import("../src/lib/reels");
  const { saveUploadedTake } = await import("../src/lib/takes");
  const reel = await createReel({ title: "сбой загрузки" });
  const file = new File([Buffer.from("0123456789abcdef")], "clip.mp4", { type: "video/mp4" });
  const key = "fail-key";
  let writes = 0;
  let releaseFail: (() => void) | undefined;
  const failGate = new Promise<void>((resolve) => {
    releaseFail = resolve;
  });
  const failIo = {
    writeFile: async () => {
      writes += 1;
      await failGate;
      throw new Error("disk full");
    },
    unlink: fsUnlink,
  };
  const spyIo = {
    writeFile: async () => {
      writes += 1;
      throw new Error("second writer must not run");
    },
    unlink: async () => undefined,
  };

  const first = saveUploadedTake(
    { reelId: reel.id, file, inputType: "video", idempotencyKey: key },
    failIo,
  );
  for (let i = 0; i < 40 && writes === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(writes, 1);
  const second = saveUploadedTake(
    { reelId: reel.id, file, inputType: "video", idempotencyKey: key },
    spyIo,
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(writes, 1);
  releaseFail?.();
  const raced = await Promise.allSettled([first, second]);
  assert.equal(raced.filter((row) => row.status === "rejected").length, 2);
  assert.equal(writes, 1);
  const take = await prisma.take.findFirst({ where: { reelId: reel.id } });
  assert.equal(take?.mediaStatus, "failed");
  assert.equal(take?.storedPath, null);
  assert.equal(existsSync(path.join(storage, "storage", "videos", `take-${take?.id}.mp4`)), false);
});

test("backfilled job take plays in browser and serves Range", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-takes-legacy-"));
  const storage = path.join(dir, "storage");
  const url = fileUrl(path.join(dir, "test.db"));
  process.env.DATABASE_URL = url;
  process.env.VOCAL_STORAGE_ROOT = storage;
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

  const videos = path.join(storage, "storage", "videos");
  mkdirSync(videos, { recursive: true });
  const videoPath = path.join(videos, "legacy-job.mp4");
  writeFileSync(videoPath, "0123456789abcdef");
  await prisma.job.create({
    data: { originalName: "old.mp4", videoPath, status: "done" },
  });

  const { backfillReels } = await import("../scripts/backfill-reels");
  await backfillReels(prisma);

  const takeRow = await prisma.take.findFirst({ include: { jobs: true } });
  assert.ok(takeRow);
  const { getTakeDto } = await import("../src/lib/takes");
  const dto = await getTakeDto(takeRow.id);
  assert.equal(dto?.originalName, "old.mp4");
  assert.equal(dto?.hasFile, true);
  assert.equal(dto?.browserPlayback, true);
  assert.equal(dto?.mediaUrl, `/api/takes/${takeRow.id}/media`);
  assert.equal(dto?.mimeType, "video/mp4");

  await prisma.take.update({
    where: { id: takeRow.id },
    data: { originalName: null, mimeType: null },
  });
  const fallback = await getTakeDto(takeRow.id);
  assert.equal(fallback?.originalName, "old.mp4");
  assert.equal(fallback?.browserPlayback, true);
  assert.equal(fallback?.mimeType, "video/mp4");

  const { GET: getMedia } = await import("../src/app/api/takes/[id]/media/route");
  const media = await getMedia(
    new Request(`http://vocal.local/api/takes/${takeRow.id}/media`, {
      headers: { Range: "bytes=0-3" },
    }),
    { params: Promise.resolve({ id: takeRow.id }) },
  );
  assert.equal(media.status, 206);
  assert.equal(media.headers.get("content-type"), "video/mp4");
  assert.equal(media.headers.get("content-range"), "bytes 0-3/16");
  assert.equal(Buffer.from(await media.arrayBuffer()).toString(), "0123");
});
