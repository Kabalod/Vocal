import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { portraitProfileId } from "../src/lib/auth/session";
import { runtimePortraitFields } from "../src/lib/ai-runtime-context";
import { readStoredProfilePayload } from "../src/lib/profile";
import { v04ObservationJson, v04ReplaceExplicitJson } from "./helpers/v04-profile-reply";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

async function latestUser(prisma: PrismaClient) {
  const user = await prisma.dialogueMessage.findFirst({
    where: { role: "user" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(user);
  return user;
}

test("derived concreteness publishes into portrait, GET fields and thought context, then clears on remove", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { startProfileDialogue, sendProfileMessage, getProfileWorkspace } = await import("../src/lib/profile-dialogue");
  const { createReel } = await import("../src/lib/reels");
  const { getReelContext } = await import("../src/lib/reel-context");
  await startProfileDialogue();

  for (const [index, key] of ["v04-disp-a", "v04-disp-b", "v04-disp-c"].entries()) {
    await sendProfileMessage({ text: `пример ${index + 1}`, idempotencyKey: key }, async () => ({
      text: v04ObservationJson([(await latestUser(prisma)).id]),
      usage: { promptTokens: 1, completionTokens: 1 },
    }));
  }

  const published = await getProfileWorkspace();
  assert.match(published.profile.fields.find((field) => field.id === "speakingStyle")?.text ?? "", /concreteness: high/);
  assert.ok(published.portrait?.sections.some((section) => section.text.includes("concreteness: high")));
  const stored = await readStoredProfilePayload();
  assert.equal(stored.v04Slice.concreteness, "high");
  assert.match(runtimePortraitFields(stored).find((field) => field.id === "speakingStyle")?.text ?? "", /concreteness: high/);

  const reel = await createReel({ title: "Мысль про конкретность" });
  const context = await getReelContext(reel.id);
  assert.ok(context.live.understandingOnly.some((item) => item.id === "speakingStyle" && item.text.includes("concreteness: high")));

  await sendProfileMessage({ text: "меньше конкретики", idempotencyKey: "v04-disp-w1" }, async () => ({
    text: v04ObservationJson([(await latestUser(prisma)).id], "concreteness", "high", "weaken"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  await sendProfileMessage({ text: "ещё меньше", idempotencyKey: "v04-disp-w2" }, async () => ({
    text: v04ObservationJson([(await latestUser(prisma)).id], "concreteness", "high", "weaken"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));

  const removed = await getProfileWorkspace();
  assert.equal(removed.profile.fields.find((field) => field.id === "speakingStyle")?.text, "");
  assert.equal(removed.portrait?.sections.some((section) => section.text.includes("concreteness: high")) ?? false, false);
  assert.equal((await readStoredProfilePayload()).v04Slice.concreteness, undefined);
});

test("start skip supplement do not add a revision when the displayed slice is unchanged", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { startProfileDialogue, sendProfileMessage, skipProfileDialogue, supplementProfileDialogue } =
    await import("../src/lib/profile-dialogue");
  await startProfileDialogue();
  await sendProfileMessage({ text: "Говорить своими словами.", idempotencyKey: "v04-sess-goal" }, async () => ({
    text: v04ReplaceExplicitJson([(await latestUser(prisma)).id], "blog_goal", "говорить своими словами"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const profileId = portraitProfileId();
  const before = await prisma.profileRevision.findMany({ where: { profileId }, select: { id: true } });
  const current = (await prisma.creatorProfile.findUnique({ where: { id: profileId } }))?.currentRevisionId;
  assert.ok(current);

  await skipProfileDialogue();
  await startProfileDialogue();
  await supplementProfileDialogue();
  await skipProfileDialogue();

  const after = await prisma.profileRevision.findMany({ where: { profileId }, select: { id: true } });
  assert.deepEqual(
    after.map((row) => row.id).sort(),
    before.map((row) => row.id).sort(),
  );
  assert.equal((await prisma.creatorProfile.findUnique({ where: { id: profileId } }))?.currentRevisionId, current);
  const stored = await readStoredProfilePayload();
  assert.equal(stored.v04Slice.blog_goal, "говорить своими словами");
});

test("concurrent skip and apply_update keep the new slice", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { startProfileDialogue, sendProfileMessage, skipProfileDialogue, getProfileWorkspace } =
    await import("../src/lib/profile-dialogue");
  await startProfileDialogue();
  await sendProfileMessage({ text: "Говорить своими словами.", idempotencyKey: "v04-race-goal" }, async () => ({
    text: v04ReplaceExplicitJson([(await latestUser(prisma)).id], "blog_goal", "говорить своими словами"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));

  await Promise.all([
    skipProfileDialogue(),
    sendProfileMessage({ text: "Для своих.", idempotencyKey: "v04-race-audience" }, async () => ({
      text: v04ReplaceExplicitJson([(await latestUser(prisma)).id], "general_audience", "свои"),
      usage: { promptTokens: 1, completionTokens: 1 },
    })),
  ]);

  const workspace = await getProfileWorkspace();
  assert.equal(workspace.profile.fields.find((field) => field.id === "whyRecord")?.text, "говорить своими словами");
  assert.equal(workspace.profile.fields.find((field) => field.id === "audience")?.text, "свои");
  const stored = await readStoredProfilePayload();
  assert.equal(stored.v04Slice.blog_goal, "говорить своими словами");
  assert.equal(stored.v04Slice.general_audience, "свои");
});
