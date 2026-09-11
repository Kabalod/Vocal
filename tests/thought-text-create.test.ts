import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { emptyThoughtDraft, newThoughtIdempotencyKey } from "../src/lib/thought-draft";

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

test("text thought create is one transaction, idempotent, and keeps draft on error", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-thought-text-"));
  const url = fileUrl(path.join(dir, "test.db"));
  process.env.DATABASE_URL = url;
  delete process.env.VOCAL_FAIL_THOUGHT_CREATE;
  await resetPrismaClient();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  t.after(async () => {
    delete process.env.VOCAL_FAIL_THOUGHT_CREATE;
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  });
  migrateDeploy(url);

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
  assert.equal(await prisma.scriptVersion.count(), 1);

  const reelRes = await getReel(new Request(`http://vocal.local/api/reels/${reelId}`), {
    params: Promise.resolve({ id: reelId }),
  });
  const reelJson = await reelRes.json();
  assert.equal(reelJson.reel.takeCount, 1);
  assert.equal(reelJson.reel.hasScript, true);
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
  assert.equal(scripts.versions.length, 1);
  assert.equal(scripts.versions[0].body, expected);
  assert.equal(scripts.versions[0].kind, "manual");
  assert.equal(scripts.selectedScriptId, scripts.versions[0].id);

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
