import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import {
  encodeDialogueCursor,
  pageDialogueItems,
} from "../src/lib/dialogue-cursor";
import { abortDialogueRequest } from "../src/lib/dialogue-client";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { createThoughtFromText } from "../src/lib/thought-create";

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

test("dialogue cursor pages last N and older without duplicates", () => {
  const items = Array.from({ length: 5 }, (_, index) => ({
    id: `m${index + 1}`,
    createdAt: `2026-09-12T00:00:0${index}.000Z`,
  }));
  const first = pageDialogueItems(items, { limit: 2 });
  assert.deepEqual(
    first.page.map((item) => item.id),
    ["m4", "m5"],
  );
  assert.ok(first.nextCursor);
  const older = pageDialogueItems(items, {
    limit: 2,
    cursor: { t: first.page[0].createdAt, id: first.page[0].id },
  });
  assert.deepEqual(
    older.page.map((item) => item.id),
    ["m2", "m3"],
  );
  const overlap = first.page.some((item) => older.page.some((row) => row.id === item.id));
  assert.equal(overlap, false);
  assert.ok(encodeDialogueCursor({ t: "2026-09-12T00:00:00.000Z", id: "m1" }).length > 4);
});

test("legacy Q&A appears in dialogue; send is idempotent; transfer is once", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-dialogue-"));
  const url = fileUrl(path.join(dir, "test.db"));
  process.env.DATABASE_URL = url;
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  });
  migrateDeploy(url);

  const { reel } = await createThoughtFromText({
    title: "Диалог",
    body: "Исходная мысль для студии.",
    idempotencyKey: "dlg-thought-1",
  });

  const review = await prisma.review.create({
    data: {
      reelId: reel.id,
      takeId: (await prisma.take.findFirstOrThrow({ where: { reelId: reel.id } })).id,
      transcriptRevisionId: (await prisma.transcriptRevision.findFirstOrThrow()).id,
      status: "done",
      resultJson: JSON.stringify({ authorThought: "Мысль автора", modelSuggestion: "Предложение" }),
    },
  });
  const question = await prisma.question.create({
    data: { reelId: reel.id, reviewId: review.id, roundId: "r1", text: "Что для вас главное?", sortOrder: 0 },
  });
  await prisma.answer.create({
    data: { questionId: question.id, text: "Главное — ясность." },
  });

  const { listDialoguePage, sendDialogueMessage, transferDialogueProposal } = await import("../src/lib/dialogue");

  const initial = await listDialoguePage(reel.id, { limit: 20 });
  assert.ok(initial.messages.some((item) => item.kind === "review" && item.body.includes("Мысль автора")));
  assert.ok(initial.messages.some((item) => item.kind === "question" && item.body.includes("главное")));
  assert.ok(initial.messages.some((item) => item.kind === "answer" && item.body.includes("ясность")));

  let completeCalls = 0;
  const complete = async () => {
    completeCalls += 1;
    return {
      text: JSON.stringify({ reply: "Давайте уточним сцену.", scriptProposal: "Говорю коротко и по делу." }),
      usage: { promptTokens: 10, completionTokens: 8 },
    };
  };

  const first = await sendDialogueMessage(
    reel.id,
    { text: "Хочу короче.", idempotencyKey: "send-1" },
    complete,
  );
  const second = await sendDialogueMessage(
    reel.id,
    { text: "Хочу короче.", idempotencyKey: "send-1" },
    complete,
  );
  assert.equal(completeCalls, 1);
  assert.equal(
    first.messages.filter((item) => item.role === "user" && item.body === "Хочу короче.").length,
    1,
  );
  assert.equal(first.messages.at(-1)?.id, second.messages.at(-1)?.id);
  const proposal = first.messages.find((item) => item.kind === "script_proposal");
  assert.ok(proposal);

  const transferred = await transferDialogueProposal(reel.id, proposal!.id);
  const again = await transferDialogueProposal(reel.id, proposal!.id);
  const versions = await prisma.scriptVersion.findMany({ where: { reelId: reel.id, kind: "accepted_ai" } });
  assert.equal(versions.length, 1);
  const after = transferred.messages.find((item) => item.id === proposal!.id);
  assert.equal(after?.proposal?.transferred, true);
  assert.equal(again.messages.find((item) => item.id === proposal!.id)?.proposal?.scriptVersionId, after?.proposal?.scriptVersionId);

  const stored = await prisma.dialogueMessage.count({ where: { threadId: first.threadId } });
  assert.ok(stored >= 3);
  assert.equal(await prisma.question.count({ where: { reelId: reel.id } }), 1);
});

test("leaving a dialogue fetch aborts the controller", () => {
  let aborted = false;
  const controller = {
    abort() {
      aborted = true;
    },
  } as AbortController;
  abortDialogueRequest(controller);
  assert.equal(aborted, true);
  abortDialogueRequest(null);
});
