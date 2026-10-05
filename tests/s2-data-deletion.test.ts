import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { askQuestionJson } from "./helpers/agent-action-json";

const A = { id: "user-a", email: null };
const B = { id: "user-b", email: null };

async function setup(t: Parameters<typeof withPostgresTestDb>[0]) {
  const root = mkdtempSync(path.join(tmpdir(), "vocal-s2-"));
  const previousRoot = process.env.VOCAL_STORAGE_ROOT;
  process.env.VOCAL_STORAGE_ROOT = root;
  process.env.VOCAL_SKIP_JOB_ENQUEUE = "1";
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    delete process.env.VOCAL_SKIP_JOB_ENQUEUE;
    delete process.env.VOCAL_TEST_USER_ID;
    if (previousRoot === undefined) delete process.env.VOCAL_STORAGE_ROOT;
    else process.env.VOCAL_STORAGE_ROOT = previousRoot;
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
    rmSync(root, { recursive: true, force: true });
  });
  return { prisma, root };
}

async function mediaThought(owner: { id: string; email: null }, key: string) {
  const { runWithOwner } = await import("../src/lib/auth/session");
  const { createThoughtFromMedia } = await import("../src/lib/thought-media");
  return runWithOwner(owner, () =>
    createThoughtFromMedia({
      file: new File([Buffer.from(`media-${key}`)], "clip.webm", { type: "audio/webm" }),
      inputType: "audio",
      idempotencyKey: key,
    }),
  );
}

async function counts(prisma: Awaited<ReturnType<typeof setup>>["prisma"], where: { reelId?: string; owner?: string }) {
  const { reelId, owner } = where;
  return {
    reel: await prisma.reel.count({ where: reelId ? { id: reelId } : { ownerUserId: owner } }),
    takes: await prisma.take.count({ where: reelId ? { reelId } : { reel: { ownerUserId: owner } } }),
    transcripts: await prisma.transcriptRevision.count({ where: reelId ? { take: { reelId } } : { take: { reel: { ownerUserId: owner } } } }),
    jobs: await prisma.job.count({ where: owner ? { ownerUserId: owner } : { take: { reelId } } }),
    threads: await prisma.dialogueThread.count({ where: reelId ? { reelId } : { reel: { ownerUserId: owner } } }),
    messages: await prisma.dialogueMessage.count({ where: { thread: reelId ? { reelId } : { reel: { ownerUserId: owner } } } }),
    state: await prisma.thoughtState.count({ where: reelId ? { reelId } : { ownerUserId: owner } }),
    drafts: await prisma.scriptDraft.count({ where: reelId ? { reelId } : { reel: { ownerUserId: owner } } }),
    versions: await prisma.scriptVersion.count({ where: reelId ? { reelId } : { reel: { ownerUserId: owner } } }),
  };
}

test("S2 two users: deleting A's thought removes A's rows and files, B is untouched, AiCall is anonymized", async (t) => {
  const { prisma } = await setup(t);
  const { runWithOwner } = await import("../src/lib/auth/session");
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { saveManualScript } = await import("../src/lib/scripts");
  const { deleteThought } = await import("../src/lib/data-deletion");

  const aMedia = await mediaThought(A, "a-media");
  const bMedia = await mediaThought(B, "b-media");
  const aText = await runWithOwner(A, () =>
    createThoughtFromText({ title: "Текст А", body: "Мысль автора А.", idempotencyKey: "a-text" }),
  );
  await runWithOwner(A, async () => {
    await sendDialogueMessage(
      aText.reel.id,
      { text: "Секретный ответ автора А", idempotencyKey: "a-dlg-1" },
      async () => ({ text: askQuestionJson("Что дальше?"), usage: { promptTokens: 5, completionTokens: 5 } }),
    );
    await saveManualScript(aText.reel.id, { body: "Черновик А" });
  });

  const aFile = (await prisma.take.findFirstOrThrow({ where: { reelId: aMedia.reel.id } })).storedPath!;
  const bFile = (await prisma.take.findFirstOrThrow({ where: { reelId: bMedia.reel.id } })).storedPath!;
  assert.ok(existsSync(aFile) && existsSync(bFile));
  const bBefore = await counts(prisma, { owner: B.id });
  assert.ok(bBefore.reel === 1 && bBefore.takes === 1 && bBefore.jobs === 1);

  assert.ok((await counts(prisma, { reelId: aText.reel.id })).messages > 0);
  await runWithOwner(A, () => deleteThought(aText.reel.id));
  await runWithOwner(A, () => deleteThought(aMedia.reel.id));

  const aAfter = await counts(prisma, { owner: A.id });
  assert.deepEqual(aAfter, { reel: 0, takes: 0, transcripts: 0, jobs: 0, threads: 0, messages: 0, state: 0, drafts: 0, versions: 0 });
  assert.equal(existsSync(aFile), false, "A's media file is removed");
  assert.deepEqual(await counts(prisma, { owner: B.id }), bBefore);
  assert.ok(existsSync(bFile), "B's media file is untouched");

  const calls = await prisma.aiCall.findMany({ where: { ownerUserId: A.id, kind: "dialogue" } });
  assert.ok(calls.length >= 1, "accounting rows survive");
  for (const call of calls) {
    assert.equal(call.promptText, "");
    assert.equal(call.inputSnapshotJson, "{}");
    assert.equal(call.responseText, null);
    assert.equal(call.reelId, null);
    assert.ok((call.promptTokens ?? 0) > 0, "token usage is kept for the daily budget");
  }
  assert.equal(await prisma.aiCall.count({ where: { promptText: { contains: "Секретный" } } }), 0);
  assert.equal(await prisma.aiCall.count({ where: { responseText: { contains: "Что дальше" } } }), 0);
});

test("S2 replay: old creation keys do not resurrect deleted thoughts (text and media)", async (t) => {
  const { prisma } = await setup(t);
  const { runWithOwner } = await import("../src/lib/auth/session");
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { deleteThought } = await import("../src/lib/data-deletion");

  const text = await runWithOwner(A, () =>
    createThoughtFromText({ title: "Т", body: "Текст", idempotencyKey: "replay-text" }),
  );
  const media = await mediaThought(A, "replay-media");
  await runWithOwner(A, () => deleteThought(text.reel.id));
  await runWithOwner(A, () => deleteThought(media.reel.id));

  await assert.rejects(
    runWithOwner(A, () => createThoughtFromText({ title: "Т", body: "Текст", idempotencyKey: "replay-text" })),
    { code: "THOUGHT_DELETED", status: 410 },
  );
  await assert.rejects(mediaThought(A, "replay-media"), { code: "THOUGHT_DELETED", status: 410 });
  assert.equal(await prisma.reel.count(), 0);
  assert.equal(await prisma.take.count(), 0);
  assert.equal(await prisma.job.count(), 0);
});

test("S2 foreign ids are 404 on every new route and nothing is deleted", async (t) => {
  const { prisma } = await setup(t);
  const { runWithOwner } = await import("../src/lib/auth/session");
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const reelRoute = await import("../src/app/api/reels/[id]/route");
  const takeRoute = await import("../src/app/api/takes/[id]/route");
  const a = await runWithOwner(A, () =>
    createThoughtFromText({ title: "А", body: "Мысль А", idempotencyKey: "foreign-a" }),
  );
  const take = await prisma.take.findFirstOrThrow({ where: { reelId: a.reel.id } });

  process.env.VOCAL_TEST_USER_ID = B.id;
  const reelRes = await reelRoute.DELETE(new Request("http://vocal.local/api/reels/x", { method: "DELETE" }), {
    params: Promise.resolve({ id: a.reel.id }),
  });
  assert.equal(reelRes.status, 404);
  const takeRes = await takeRoute.DELETE(new Request("http://vocal.local/api/takes/x", { method: "DELETE" }), {
    params: Promise.resolve({ id: take.id }),
  });
  assert.equal(takeRes.status, 404);
  assert.equal(await prisma.reel.count({ where: { id: a.reel.id } }), 1);
  assert.equal(await prisma.take.count({ where: { id: take.id } }), 1);

  process.env.VOCAL_TEST_USER_ID = A.id;
  const own = await reelRoute.DELETE(new Request("http://vocal.local/api/reels/x", { method: "DELETE" }), {
    params: Promise.resolve({ id: a.reel.id }),
  });
  assert.equal(own.status, 200);
  assert.equal(await prisma.reel.count({ where: { id: a.reel.id } }), 0);
});

test("S2 take deletion keeps working/final takes and the last take, removes the rest with its files", async (t) => {
  const { prisma } = await setup(t);
  const { runWithOwner } = await import("../src/lib/auth/session");
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { saveUploadedTake } = await import("../src/lib/takes");
  const { deleteTake } = await import("../src/lib/data-deletion");
  const first = await runWithOwner(A, () =>
    createThoughtFromText({ title: "Дубли", body: "Первый дубль", idempotencyKey: "take-del" }),
  );
  const reelId = first.reel.id;
  const extra = await runWithOwner(A, () =>
    saveUploadedTake({
      reelId,
      file: new File([Buffer.from("second")], "second.webm", { type: "audio/webm" }),
      inputType: "audio",
    }),
  );
  const extraRow = await prisma.take.findUniqueOrThrow({ where: { id: extra.id } });
  const file = extraRow.storedPath!;
  assert.ok(existsSync(file));
  await prisma.transcriptRevision.create({
    data: { takeId: extra.id, kind: "original", source: "stt", text: "расшифровка второго" },
  });

  const reel = await prisma.reel.findUniqueOrThrow({ where: { id: reelId } });
  const takes = await prisma.take.findMany({ where: { reelId }, orderBy: { number: "asc" } });
  assert.equal(takes.length, 2);
  const working = reel.workingTakeId;
  assert.ok(working, "a thought with takes has a working take");
  const other = takes.find((row) => row.id !== working)!;

  await assert.rejects(runWithOwner(A, () => deleteTake(working!)), { code: "WORKING_TAKE", status: 409 });
  await prisma.reel.update({ where: { id: reelId }, data: { finalTakeId: other.id } });
  await assert.rejects(runWithOwner(A, () => deleteTake(other.id)), { code: "FINAL_TAKE", status: 409 });
  await prisma.reel.update({ where: { id: reelId }, data: { finalTakeId: null } });

  await runWithOwner(A, () => deleteTake(other.id));
  assert.equal(await prisma.take.count({ where: { reelId } }), 1);
  assert.equal(await prisma.transcriptRevision.count({ where: { takeId: other.id } }), 0);
  if (other.id === extra.id) assert.equal(existsSync(file), false);
  const after = await prisma.reel.findUniqueOrThrow({ where: { id: reelId } });
  assert.equal(after.workingTakeId, working, "the working take is not left dangling");

  await assert.rejects(runWithOwner(A, () => deleteTake(working!)), { code: "LAST_TAKE", status: 409 });
});

test("S2 delete during an active Job: the worker drops its result, nothing comes back, the stray file is swept", async (t) => {
  const { prisma, root } = await setup(t);
  const { runWithOwner } = await import("../src/lib/auth/session");
  const { processJob } = await import("../src/lib/pipeline");
  const { deleteThought, sweepOrphanMedia } = await import("../src/lib/data-deletion");
  const media = await mediaThought(A, "active-job");
  const jobId = media.job.id;

  let enteredStt!: () => void;
  const inStt = new Promise<void>((resolve) => {
    enteredStt = resolve;
  });
  let releaseStt!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseStt = resolve;
  });
  const worker = processJob(jobId, {
    extractAudio: async (_video: string, out: string) => {
      writeFileSync(out, "mp3");
    },
    probeDuration: async () => 2,
    transcribeAudio: async () => {
      enteredStt();
      await gate;
      return { text: "поздний текст", segments: [{ start: 0, end: 1, text: "поздний текст" }], model: "mock-stt" };
    },
    suggestTitle: async () => ({ text: JSON.stringify({ title: "Поздний" }), usage: {} }),
  });
  await inStt;
  const audio = path.join(root, "storage", "audio", `${jobId}.mp3`);
  assert.ok(existsSync(audio), "worker wrote the audio file before the delete");

  await runWithOwner(A, () => deleteThought(media.reel.id));
  releaseStt();
  await worker;

  assert.equal(await prisma.reel.count(), 0);
  assert.equal(await prisma.take.count(), 0);
  assert.equal(await prisma.transcriptRevision.count(), 0);
  assert.equal(await prisma.job.count(), 0);
  assert.equal(await prisma.analysisResult.count(), 0);
  assert.equal(existsSync(audio), false, "deleted with the job, or swept below");
  writeFileSync(audio, "late-write");
  assert.equal((await sweepOrphanMedia(new Date())).removed, 0, "a young file is kept (grace)");
  const old = new Date(Date.now() - 3 * 60 * 60_000);
  utimesSync(audio, old, old);
  assert.equal((await sweepOrphanMedia(new Date())).removed, 1);
  assert.equal(existsSync(audio), false);
});

test("S2 delete during a dialogue turn: the late reply is not stored anywhere", async (t) => {
  const { prisma } = await setup(t);
  const { runWithOwner } = await import("../src/lib/auth/session");
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { deleteThought } = await import("../src/lib/data-deletion");
  const thought = await runWithOwner(A, () =>
    createThoughtFromText({ title: "Ход", body: "Мысль для хода", idempotencyKey: "turn-del" }),
  );
  let enteredModel!: () => void;
  const inModel = new Promise<void>((resolve) => {
    enteredModel = resolve;
  });
  let releaseModel!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseModel = resolve;
  });
  const turn = runWithOwner(A, () =>
    sendDialogueMessage(
      thought.reel.id,
      { text: "Тайный текст хода", idempotencyKey: "turn-del-1" },
      async () => {
        enteredModel();
        await gate;
        return { text: askQuestionJson("Поздний ответ модели"), usage: { promptTokens: 3, completionTokens: 3 } };
      },
    ),
  );
  await inModel;
  await runWithOwner(A, () => deleteThought(thought.reel.id));
  releaseModel();
  await turn.catch(() => undefined);

  assert.equal(await prisma.reel.count(), 0);
  assert.equal(await prisma.dialogueMessage.count(), 0);
  assert.equal(await prisma.dialogueThread.count(), 0);
  assert.equal(await prisma.aiCall.count({ where: { responseText: { contains: "Поздний ответ" } } }), 0);
  assert.equal(await prisma.aiCall.count({ where: { promptText: { contains: "Тайный текст" } } }), 0);
  assert.equal(await prisma.aiCall.count({ where: { inputSnapshotJson: { contains: "Тайный текст" } } }), 0);
});

test("S2 account deletion removes every row and file of A (and only A), then the login", async (t) => {
  const { prisma } = await setup(t);
  const { runWithOwner } = await import("../src/lib/auth/session");
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { startProfileDialogue, sendProfileMessage } = await import("../src/lib/profile-dialogue");
  const { accountAuthSeam } = await import("../src/lib/supabase/service");
  const accountRoute = await import("../src/app/api/account/route");
  const { v04NoChangeJson } = await import("./helpers/v04-profile-reply");

  const aMedia = await mediaThought(A, "acc-a-media");
  await runWithOwner(A, () => createThoughtFromText({ title: "А", body: "Текст А", idempotencyKey: "acc-a-text" }));
  await runWithOwner(A, async () => {
    await startProfileDialogue();
    await sendProfileMessage({ text: "Профиль автора А", idempotencyKey: "acc-a-profile" }, async () => ({
      text: v04NoChangeJson(),
      usage: { promptTokens: 4, completionTokens: 4 },
    }));
  });
  await mediaThought(B, "acc-b-media");
  const aFile = (await prisma.take.findFirstOrThrow({ where: { reelId: aMedia.reel.id } })).storedPath!;
  const bBefore = await counts(prisma, { owner: B.id });
  const bProfile = await prisma.creatorProfile.count({ where: { ownerUserId: B.id } });

  const deletedAuth: string[] = [];
  accountAuthSeam.deleteUser = async (id) => {
    deletedAuth.push(id);
  };
  t.after(() => {
    accountAuthSeam.deleteUser = null;
  });

  process.env.VOCAL_TEST_USER_ID = A.id;
  const call = (body: unknown) =>
    accountRoute.DELETE(
      new Request("http://vocal.local/api/account", { method: "DELETE", body: JSON.stringify(body) }),
      undefined as never,
    );
  assert.equal((await call({})).status, 400);
  assert.equal((await call({ confirm: "нет" })).status, 400);
  assert.equal(await prisma.reel.count({ where: { ownerUserId: A.id } }), 2, "no confirmation, no deletion");
  assert.deepEqual(deletedAuth, []);

  const done = await call({ confirm: "УДАЛИТЬ" });
  assert.equal(done.status, 200);
  assert.deepEqual(deletedAuth, [A.id]);

  assert.deepEqual(await counts(prisma, { owner: A.id }), {
    reel: 0, takes: 0, transcripts: 0, jobs: 0, threads: 0, messages: 0, state: 0, drafts: 0, versions: 0,
  });
  assert.equal(await prisma.creatorProfile.count({ where: { ownerUserId: A.id } }), 0);
  assert.equal(await prisma.profileRevision.count(), 0);
  assert.equal(await prisma.aiCall.count({ where: { ownerUserId: A.id } }), 0, "no row keeps A's account id");
  assert.equal(await prisma.aiCall.count({ where: { promptText: { contains: "Профиль автора" } } }), 0);
  assert.equal(existsSync(aFile), false);
  assert.deepEqual(await counts(prisma, { owner: B.id }), bBefore);
  assert.equal(await prisma.creatorProfile.count({ where: { ownerUserId: B.id } }), bProfile);

  // Repeating after a failed auth step is safe: nothing is left to delete, the auth call runs again.
  const again = await call({ confirm: "УДАЛИТЬ" });
  assert.equal(again.status, 200);
  assert.deepEqual(deletedAuth, [A.id, A.id]);
});

test("S2 account deletion refuses before touching data when the server cannot delete the login", async (t) => {
  const { prisma } = await setup(t);
  const { runWithOwner } = await import("../src/lib/auth/session");
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  await runWithOwner(A, () => createThoughtFromText({ title: "А", body: "Текст", idempotencyKey: "acc-refuse" }));

  const env = process.env as Record<string, string | undefined>;
  const saved = { node: env.NODE_ENV, ui: env.VOCAL_UI_TEST_DB, key: env.SUPABASE_SERVICE_ROLE_KEY };
  t.after(() => {
    env.NODE_ENV = saved.node;
    if (saved.ui === undefined) delete env.VOCAL_UI_TEST_DB;
    if (saved.key === undefined) delete env.SUPABASE_SERVICE_ROLE_KEY;
  });
  env.NODE_ENV = "production"; // not a test runtime: the service-role key is mandatory
  delete env.VOCAL_UI_TEST_DB;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  const { accountAuthDeletionAvailable } = await import("../src/lib/supabase/service");
  assert.equal(accountAuthDeletionAvailable(), false);
  env.NODE_ENV = "test";
  assert.equal(await prisma.reel.count({ where: { ownerUserId: A.id } }), 1);
});

test("S2 sweeper keeps referenced and young files, removes only unreferenced old ones", async (t) => {
  const { prisma, root } = await setup(t);
  const { sweepOrphanMedia } = await import("../src/lib/data-deletion");
  const media = await mediaThought(A, "sweep-keep");
  const kept = (await prisma.take.findFirstOrThrow({ where: { reelId: media.reel.id } })).storedPath!;
  const orphan = path.join(root, "storage", "videos", "cabcdefghijklmnopqrstuvwx.mp4");
  const note = path.join(root, "storage", "videos", "README.txt");
  writeFileSync(orphan, "x");
  writeFileSync(note, "x");
  const old = new Date(Date.now() - 3 * 60 * 60_000);
  for (const file of [orphan, note, kept]) utimesSync(file, old, old);
  const result = await sweepOrphanMedia(new Date());
  assert.equal(result.removed, 1);
  assert.equal(existsSync(orphan), false);
  assert.ok(existsSync(kept), "a referenced file is never swept, however old");
  assert.ok(existsSync(note), "files that do not look like Vocal media are ignored");
});

test("S2 UI: delete actions are confirmed, account deletion needs the typed phrase", async () => {
  const { readFileSync } = await import("node:fs");
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const actions = readFileSync(path.join(root, "src/components/DeleteActions.tsx"), "utf8");
  assert.match(actions, /Удалить мысль\?/);
  assert.match(actions, /Удалить дубль\?/);
  assert.match(actions, /Удалить аккаунт\?/);
  assert.match(actions, /canConfirm=\{phrase === ACCOUNT_DELETE_PHRASE\}/);
  assert.match(actions, /data-vocal-initial="safe"/, "focus starts on the safe action");
  assert.equal(actions.includes("SERVICE_ROLE"), false, "the service-role key never reaches client code");
  assert.match(readFileSync(path.join(root, "src/components/ReelStudio.tsx"), "utf8"), /DeleteThoughtAction/);
  assert.match(readFileSync(path.join(root, "src/components/ReelTakes.tsx"), "utf8"), /DeleteTakeAction/);
  assert.match(readFileSync(path.join(root, "src/app/profile/page.tsx"), "utf8"), /DeleteAccountAction/);
  const service = readFileSync(path.join(root, "src/lib/supabase/service.ts"), "utf8");
  assert.equal(service.includes('"use client"'), false);
  const clientFiles = ["DeleteActions", "LogoutButton", "NewThoughtSheet"].map((name) =>
    readFileSync(path.join(root, `src/components/${name}.tsx`), "utf8"),
  );
  for (const source of clientFiles) assert.equal(source.includes("supabase/service"), false);
});
