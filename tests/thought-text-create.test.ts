import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { emptyThoughtDraft, newThoughtIdempotencyKey } from "../src/lib/thought-draft";
import { thoughtUserStatus } from "../src/lib/thought-preview";

test("text thought create is one transaction, idempotent, and keeps draft on error", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
    delete process.env.VOCAL_FAIL_THOUGHT_CREATE;
    t.after(async () => {
    delete process.env.VOCAL_FAIL_THOUGHT_CREATE;
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { POST } = await import("../src/app/api/thoughts/route");
  const { GET: getReel } = await import("../src/app/api/reels/[id]/route");
  const { GET: getScripts } = await import("../src/app/api/reels/[id]/scripts/route");
  const { GET: listTakes } = await import("../src/app/api/reels/[id]/takes/route");
  const { GET: getTranscript } = await import("../src/app/api/takes/[id]/transcript/route");

  const body = "  исходный текст мысли для Vocal  ";
  const expected = body.trim();
  const key = "idem-thought-text-1";
  const before = await prisma.reel.count();

  const empty = await POST(
    new Request("http://vocal.local/api/thoughts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Пусто", body: "   ", idempotencyKey: "empty-key" }),
    }),
  );
  assert.equal(empty.status, 400);
  assert.equal(await prisma.reel.count(), before);

  process.env.VOCAL_FAIL_THOUGHT_CREATE = "after-reel";
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  await assert.rejects(
    () => createThoughtFromText({ title: "Сбой", body: "не должно остаться", idempotencyKey: "fail-key" }),
    /artificial-thought-create-fail/,
  );
  delete process.env.VOCAL_FAIL_THOUGHT_CREATE;
  assert.equal(await prisma.reel.count(), before);
  assert.equal(await prisma.take.count(), 0);
  assert.equal(await prisma.scriptVersion.count(), 0);
  assert.equal(await prisma.transcriptRevision.count(), 0);

  const created = await POST(
    new Request("http://vocal.local/api/thoughts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Моя мысль", body, idempotencyKey: key }),
    }),
  );
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  const reelId = createdBody.reel.id as string;
  assert.equal(createdBody.reel.title, "Моя мысль");
  assert.equal(createdBody.reel.status, "idea");
  assert.equal(thoughtUserStatus(createdBody.reel.status), "open");

  const again = await POST(
    new Request("http://vocal.local/api/thoughts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Другое", body: "другой текст", idempotencyKey: key }),
    }),
  );
  assert.equal(again.status, 200);
  const againBody = await again.json();
  assert.equal(againBody.reel.id, reelId);
  assert.equal(await prisma.take.count(), 1);
  assert.equal(await prisma.scriptVersion.count(), 0);

  const reelRes = await getReel(new Request(`http://vocal.local/api/reels/${reelId}`), {
    params: Promise.resolve({ id: reelId }),
  });
  const reelJson = await reelRes.json();
  assert.equal(reelJson.reel.takeCount, 1);
  assert.equal(reelJson.reel.hasScript, false);
  assert.equal(reelJson.reel.takes[0].number, 1);
  assert.equal(reelJson.reel.takes[0].inputType, "text");
  assert.equal(reelJson.reel.takes[0].bodyText, expected);

  const takes = await (
    await listTakes(new Request(`http://vocal.local/api/reels/${reelId}/takes`), {
      params: Promise.resolve({ id: reelId }),
    })
  ).json();
  assert.equal(takes.takes.length, 1);

  const scripts = await (
    await getScripts(new Request(`http://vocal.local/api/reels/${reelId}/scripts`), {
      params: Promise.resolve({ id: reelId }),
    })
  ).json();
  assert.equal(scripts.versions.length, 0);
  assert.equal(scripts.viewing, null);
  assert.equal(scripts.selectedScriptId, null);

  const transcript = await (
    await getTranscript(new Request(`http://vocal.local/api/takes/${takes.takes[0].id}/transcript`), {
      params: Promise.resolve({ id: takes.takes[0].id }),
    })
  ).json();
  assert.equal(transcript.transcript.originalId, transcript.transcript.selectedId);
  assert.equal(transcript.transcript.revisions[0].text, expected);
  assert.equal(transcript.transcript.revisions[0].kind, "original");

  const untitled = await POST(
    new Request("http://vocal.local/api/thoughts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "без названия", idempotencyKey: "idem-untitled" }),
    }),
  );
  assert.equal(untitled.status, 201);
  assert.equal((await untitled.json()).reel.title, "Новая мысль");

  const draft = emptyThoughtDraft();
  assert.ok(draft.idempotencyKey);
  assert.notEqual(newThoughtIdempotencyKey(), newThoughtIdempotencyKey());
});

test("concurrent thought create with the same key returns one thought", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
    delete process.env.VOCAL_FAIL_THOUGHT_CREATE;
  await resetPrismaClient();
    t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { POST } = await import("../src/app/api/thoughts/route");
  const key = "idem-thought-race-1";
  const body = "одновременный текст мысли";
  const before = {
    reels: await prisma.reel.count(),
    takes: await prisma.take.count(),
    transcripts: await prisma.transcriptRevision.count(),
    scripts: await prisma.scriptVersion.count(),
    keys: await prisma.thoughtCreateKey.count(),
  };

  const [first, second] = await Promise.all([
    POST(
      new Request("http://vocal.local/api/thoughts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Гонка А", body, idempotencyKey: key }),
      }),
    ),
    POST(
      new Request("http://vocal.local/api/thoughts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Гонка Б", body: "другой текст", idempotencyKey: key }),
      }),
    ),
  ]);

  assert.ok([200, 201].includes(first.status), `first status ${first.status}`);
  assert.ok([200, 201].includes(second.status), `second status ${second.status}`);
  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.equal(firstBody.reel.id, secondBody.reel.id);
  assert.equal(await prisma.reel.count(), before.reels + 1);
  assert.equal(await prisma.take.count(), before.takes + 1);
  assert.equal(await prisma.transcriptRevision.count(), before.transcripts + 1);
  assert.equal(await prisma.scriptVersion.count(), before.scripts);
  assert.equal(await prisma.thoughtCreateKey.count(), before.keys + 1);
});
