import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

test("thought media create validates, is idempotent, and does not mint a script after STT", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
    process.env.VOCAL_SKIP_JOB_ENQUEUE = "1";
    t.after(async () => {
    delete process.env.VOCAL_SKIP_JOB_ENQUEUE;
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { POST } = await import("../src/app/api/thoughts/media/route");
  const { GET: getProcessing } = await import("../src/app/api/thoughts/[id]/processing/route");
  const { processJob } = await import("../src/lib/pipeline");
  const { assertThoughtMediaFile } = await import("../src/lib/thought-media");
  const { applyThoughtTitleFromTranscript, fallbackThoughtTitle } = await import("../src/lib/thought-title");
  const { DEFAULT_THOUGHT_TITLE } = await import("../src/lib/thought-create");

  assert.throws(
    () => assertThoughtMediaFile(new File(["x"], "note.txt", { type: "text/plain" }), "video"),
    /формат/,
  );
  assert.throws(
    () => assertThoughtMediaFile({ name: "clip.mp4", size: 81 * 1024 * 1024 } as File, "video"),
    /80 МБ/,
  );
  assert.equal(await prisma.reel.count(), 0);
  assert.equal(await prisma.take.count(), 0);

  const empty = await POST(
    new Request("http://vocal.local/api/thoughts/media", {
      method: "POST",
      body: (() => {
        const form = new FormData();
        form.set("file", new File(["x"], "note.txt"));
        form.set("inputType", "video");
        form.set("idempotencyKey", "bad-format");
        return form;
      })(),
    }),
  );
  assert.equal(empty.status, 400);
  assert.equal(await prisma.reel.count(), 0);
  assert.equal(await prisma.take.count(), 0);

  const key = "idem-thought-media-1";
  const file = new File([Buffer.from("0123456789abcdef")], "clip.webm", { type: "audio/webm" });
  async function postOnce() {
    const form = new FormData();
    form.set("file", file);
    form.set("inputType", "audio");
    form.set("idempotencyKey", key);
    return POST(new Request("http://vocal.local/api/thoughts/media", { method: "POST", body: form }));
  }

  const created = await postOnce();
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  const reelId = createdBody.reel.id as string;
  const jobId = createdBody.job.id as string;
  assert.equal(createdBody.take.number, 1);
  assert.equal(createdBody.take.inputType, "audio");
  assert.equal(createdBody.take.mediaStatus, "ready");
  assert.equal(createdBody.reel.status, "in_progress");

  const again = await postOnce();
  assert.equal(again.status, 200);
  assert.equal((await again.json()).reel.id, reelId);
  assert.equal(await prisma.reel.count(), 1);
  assert.equal(await prisma.take.count(), 1);
  assert.equal(await prisma.job.count(), 1);

  const [raceA, raceB] = await Promise.all([
    POST(
      new Request("http://vocal.local/api/thoughts/media", {
        method: "POST",
        body: (() => {
          const form = new FormData();
          form.set("file", file);
          form.set("inputType", "audio");
          form.set("idempotencyKey", "idem-thought-media-race");
          return form;
        })(),
      }),
    ),
    POST(
      new Request("http://vocal.local/api/thoughts/media", {
        method: "POST",
        body: (() => {
          const form = new FormData();
          form.set("file", file);
          form.set("inputType", "audio");
          form.set("idempotencyKey", "idem-thought-media-race");
          return form;
        })(),
      }),
    ),
  ]);
  assert.ok([200, 201].includes(raceA.status));
  assert.ok([200, 201].includes(raceB.status));
  const raceId = (await raceA.json()).reel.id;
  assert.equal((await raceB.json()).reel.id, raceId);
  assert.equal(await prisma.reel.count(), 2);
  assert.equal(await prisma.take.count(), 2);

  await processJob(jobId, {
    transcribeAudio: async () => ({ text: "   ", segments: [], language: "ru", model: "mock" }),
    suggestTitle: async () => { throw new Error("title unused on empty stt"); },
    extractAudio: async () => undefined,
    probeDuration: async () => 1,
  });
  assert.equal(await prisma.transcriptRevision.count({ where: { takeId: createdBody.take.id } }), 0);
  assert.equal(await prisma.scriptVersion.count({ where: { reelId } }), 0);
  const takeAfterEmpty = await prisma.take.findUnique({ where: { id: createdBody.take.id } });
  assert.ok(takeAfterEmpty?.storedPath);
  const failedJob = await prisma.job.findUnique({ where: { id: jobId } });
  assert.equal(failedJob?.status, "error");
  assert.match(failedJob?.errorCode ?? "", /EMPTY_TRANSCRIPT/);

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "queued", stage: "convert", errorCode: null, errorMessage: null, leaseUntil: null, leaseOwner: null },
  });
  await processJob(jobId, {
    transcribeAudio: async () => ({
      text: "  голос про смысл мысли  ",
      segments: [{ start: 0, end: 1, text: "голос про смысл мысли" }],
      language: "ru",
      model: "mock",
    }),
    extractAudio: async () => undefined,
    probeDuration: async () => 1,
    suggestTitle: async () => ({ text: '{"title":"Смысл мысли"}' }),
  });

  const original = await prisma.transcriptRevision.findFirst({ where: { takeId: createdBody.take.id } });
  assert.equal(original?.text.trim(), "голос про смысл мысли");
  const scripts = await prisma.scriptVersion.findMany({ where: { reelId } });
  // R1: only the from_take base exists (stored, not shown); nothing mints a script.
  assert.equal(scripts.filter((row) => row.kind !== "from_take").length, 0);
  assert.equal(scripts.filter((row) => row.kind === "from_take" && row.body === "голос про смысл мысли").length, 1);
  const reel = await prisma.reel.findUnique({ where: { id: reelId } });
  assert.equal(reel?.title, "Смысл мысли");

  const processing = await getProcessing(new Request(`http://vocal.local/api/thoughts/${reelId}/processing`), {
    params: Promise.resolve({ id: reelId }),
  });
  const processingBody = await processing.json();
  assert.equal(processingBody.phase, "done");
  assert.equal(processingBody.scriptReady, false);

  const titleReel = await prisma.reel.create({
    data: {
      ownerUserId: "local", title: DEFAULT_THOUGHT_TITLE }});
  const title = await applyThoughtTitleFromTranscript(titleReel.id, "Первая фраза. Дальше текст.", async () => {
    throw new Error("no model");
  });
  assert.equal(title, fallbackThoughtTitle("Первая фраза. Дальше текст."));
  assert.equal((await prisma.reel.findUnique({ where: { id: titleReel.id } }))?.title, "Первая фраза");
});
