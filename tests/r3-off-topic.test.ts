import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

test("R3: off-topic streak counts only the latest unbroken run of redirect_to_task and hints at two", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { ensureReelThread, offTopicStreak, offTopicHint, buildThoughtMaterialContext } = await import("../src/lib/dialogue");

  const created = await createThoughtFromText({ title: "Оффтоп", body: "Про чай.", idempotencyKey: "r3-create" });
  const thread = await ensureReelThread(created.reel.id);
  assert.equal(await offTopicStreak(thread.id), 0);
  assert.equal(offTopicHint(0), "");
  assert.equal(offTopicHint(1), "");

  async function reply(action: string, at: number) {
    await prisma.dialogueMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        kind: "question",
        body: "ответ",
        payloadJson: JSON.stringify({ action: { action } }),
        status: "done",
        createdAt: new Date(Date.UTC(2026, 9, 8, 10, 0, at)),
      },
    });
  }
  await reply("redirect_to_task", 1);
  await reply("ask_question", 2);
  await reply("redirect_to_task", 3);
  assert.equal(await offTopicStreak(thread.id), 1, "a question breaks the older run");
  assert.equal(offTopicHint(1), "");
  assert.equal((await buildThoughtMaterialContext(created.reel.id)).includes("подряд уходит от мысли"), false);

  await reply("redirect_to_task", 4);
  assert.equal(await offTopicStreak(thread.id), 2);
  const hint = offTopicHint(2);
  assert.match(hint, /продолжить эту мысль, либо отложить/);
  assert.match(hint, /Не добавляй тему ухода в thoughtUpdate/);
  assert.equal((await buildThoughtMaterialContext(created.reel.id)).includes("подряд уходит от мысли"), true);
});
