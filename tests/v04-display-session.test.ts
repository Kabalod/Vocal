import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { portraitProfileId } from "../src/lib/auth/session";
import { runtimePortraitFields } from "../src/lib/ai-runtime-context";
import { readStoredProfilePayload } from "../src/lib/profile";
import { resetProfileLockSeamForTests, setProfileLockSeamForTests } from "../src/lib/profile-lock-seam";
import { V04_DERIVED_CATEGORIES, V04_DERIVED_DISPLAY, V04_DERIVED_VALUES } from "../src/lib/v04-action";
import { v04ObservationJson, v04ReplaceExplicitJson } from "./helpers/v04-profile-reply";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const TECHNICAL_ENUM = /concreteness:|lead_style:|explanation_style:|preferred_question_form:|example_first|conclusion_first|short_choice/;

async function latestUser(prisma: PrismaClient) {
  const user = await prisma.dialogueMessage.findFirst({
    where: { role: "user" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(user);
  return user;
}

function visiblePortraitText(fields: { id: string; text: string }[], extra: string[] = []) {
  return [...fields.map((field) => field.text), ...extra].join("\n");
}

function assertNoTechnicalEnum(text: string) {
  assert.equal(TECHNICAL_ENUM.test(text), false, text);
}

async function revisionPayloads(prisma: PrismaClient, profileId: string) {
  const rows = await prisma.profileRevision.findMany({
    where: { profileId },
    orderBy: { createdAt: "asc" },
    select: { id: true, payloadJson: true },
  });
  return rows;
}

test("derived display maps every allowed category/value without technical names", () => {
  for (const category of V04_DERIVED_CATEGORIES) {
    for (const value of V04_DERIVED_VALUES[category]) {
      const line = V04_DERIVED_DISPLAY[category][value];
      assert.ok(line.trim());
      assertNoTechnicalEnum(line);
      assert.equal(line.includes(category), false);
      assert.equal(line.includes(value), false);
    }
  }
});

test("derived concreteness publishes readable portrait text, stays in slice enums, then change and remove keep other traits", async (t) => {
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

  for (const [index, key] of ["v04-disp-style-a", "v04-disp-style-b", "v04-disp-style-c"].entries()) {
    await sendProfileMessage({ text: `шаг ${index + 1}`, idempotencyKey: key }, async () => ({
      text: v04ObservationJson([(await latestUser(prisma)).id], "explanation_style", "stepwise"),
      usage: { promptTokens: 1, completionTokens: 1 },
    }));
  }
  for (const [index, key] of ["v04-disp-a", "v04-disp-b", "v04-disp-c"].entries()) {
    await sendProfileMessage({ text: `пример ${index + 1}`, idempotencyKey: key }, async () => ({
      text: v04ObservationJson([(await latestUser(prisma)).id]),
      usage: { promptTokens: 1, completionTokens: 1 },
    }));
  }

  const published = await getProfileWorkspace();
  const publishedStyle = published.profile.fields.find((field) => field.id === "speakingStyle")?.text ?? "";
  assert.match(publishedStyle, /Говорит конкретно, с деталями/);
  assert.match(publishedStyle, /Объясняет по шагам/);
  assert.ok(published.portrait?.sections.some((section) => section.text.includes("Говорит конкретно, с деталями")));
  assertNoTechnicalEnum(visiblePortraitText(published.profile.fields, published.portrait?.sections.map((section) => section.text) ?? []));
  const stored = await readStoredProfilePayload();
  assert.equal(stored.v04Slice.concreteness, "high");
  assert.equal(stored.v04Slice.explanation_style, "stepwise");
  const runtimePublished = runtimePortraitFields(stored).find((field) => field.id === "speakingStyle")?.text ?? "";
  assert.match(runtimePublished, /Говорит конкретно, с деталями/);
  assert.match(runtimePublished, /Объясняет по шагам/);
  assertNoTechnicalEnum(runtimePublished);

  const reel = await createReel({ title: "Мысль про конкретность" });
  const context = await getReelContext(reel.id);
  const thoughtStyle = context.live.understandingOnly.find((item) => item.id === "speakingStyle")?.text ?? "";
  assert.match(thoughtStyle, /Говорит конкретно, с деталями/);
  assert.match(thoughtStyle, /Объясняет по шагам/);
  assertNoTechnicalEnum(thoughtStyle);

  for (const [index, key] of ["v04-disp-low-a", "v04-disp-low-b", "v04-disp-low-c", "v04-disp-low-d"].entries()) {
    await sendProfileMessage({ text: `общее ${index + 1}`, idempotencyKey: key }, async () => ({
      text: v04ObservationJson([(await latestUser(prisma)).id], "concreteness", "low"),
      usage: { promptTokens: 1, completionTokens: 1 },
    }));
  }
  const changed = await getProfileWorkspace();
  const changedStyle = changed.profile.fields.find((field) => field.id === "speakingStyle")?.text ?? "";
  assert.match(changedStyle, /Говорит обобщённо/);
  assert.match(changedStyle, /Объясняет по шагам/);
  assert.equal(changedStyle.includes("Говорит конкретно, с деталями"), false);
  assert.equal((await readStoredProfilePayload()).v04Slice.concreteness, "low");
  assertNoTechnicalEnum(changedStyle);

  for (const [index, key] of ["v04-disp-wh1", "v04-disp-wh2"].entries()) {
    await sendProfileMessage({ text: `снять конкретику ${index + 1}`, idempotencyKey: key }, async () => ({
      text: v04ObservationJson([(await latestUser(prisma)).id], "concreteness", "high", "weaken"),
      usage: { promptTokens: 1, completionTokens: 1 },
    }));
  }
  for (const [index, key] of ["v04-disp-wl1", "v04-disp-wl2", "v04-disp-wl3"].entries()) {
    await sendProfileMessage({ text: `снять обобщение ${index + 1}`, idempotencyKey: key }, async () => ({
      text: v04ObservationJson([(await latestUser(prisma)).id], "concreteness", "low", "weaken"),
      usage: { promptTokens: 1, completionTokens: 1 },
    }));
  }

  const removed = await getProfileWorkspace();
  const removedStyle = removed.profile.fields.find((field) => field.id === "speakingStyle")?.text ?? "";
  assert.equal(removedStyle.includes("Говорит обобщённо"), false);
  assert.match(removedStyle, /Объясняет по шагам/);
  assert.equal((await readStoredProfilePayload()).v04Slice.concreteness, undefined);
  assert.equal((await readStoredProfilePayload()).v04Slice.explanation_style, "stepwise");
  assertNoTechnicalEnum(removedStyle);
  const runtimeRemoved = runtimePortraitFields(await readStoredProfilePayload()).find((field) => field.id === "speakingStyle")?.text ?? "";
  assert.match(runtimeRemoved, /Объясняет по шагам/);
});

test("first start on an empty profile does not create a portrait revision", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { startProfileDialogue } = await import("../src/lib/profile-dialogue");
  const profileId = portraitProfileId();
  assert.equal(await prisma.profileRevision.count({ where: { profileId } }), 0);
  await startProfileDialogue();
  assert.equal(await prisma.profileRevision.count({ where: { profileId } }), 0);
  assert.equal((await prisma.creatorProfile.findUnique({ where: { id: profileId } }))?.currentRevisionId, null);
  const stored = await readStoredProfilePayload();
  assert.ok(stored.dialogueSessionStartId);
  assert.equal(stored.skipped, false);
});

test("start skip supplement keep prior revision payloads byte-identical and do not mint a revision", async (t) => {
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
  const before = await revisionPayloads(prisma, profileId);
  const current = (await prisma.creatorProfile.findUnique({ where: { id: profileId } }))?.currentRevisionId;
  assert.ok(current);
  assert.ok(before.length >= 1);

  await skipProfileDialogue();
  await startProfileDialogue();
  await supplementProfileDialogue();
  await skipProfileDialogue();

  const after = await revisionPayloads(prisma, profileId);
  assert.deepEqual(
    after.map((row) => row.id),
    before.map((row) => row.id),
  );
  for (const [index, row] of after.entries()) {
    assert.equal(row.payloadJson, before[index]?.payloadJson);
  }
  assert.equal((await prisma.creatorProfile.findUnique({ where: { id: profileId } }))?.currentRevisionId, current);
  const stored = await readStoredProfilePayload();
  assert.equal(stored.v04Slice.blog_goal, "говорить своими словами");
});

test("legacy pending in a revision stays readable and is not auto-published", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { getProfileWorkspace, startProfileDialogue } = await import("../src/lib/profile-dialogue");
  const profileId = portraitProfileId();
  await prisma.creatorProfile.create({ data: { id: profileId, ownerUserId: profileId } });
  const revision = await prisma.profileRevision.create({
    data: {
      profileId,
      payloadJson: JSON.stringify({
        fields: [{ id: "whyRecord", text: "черновик цели", usage: "understanding" }],
        skipped: false,
        supplementing: false,
        portrait: null,
        pending: {
          mode: "amend",
          understood: "черновик",
          openQuestions: [],
          draftFields: [{ id: "whyRecord", text: "черновик цели", usage: "understanding" }],
          readyToConfirm: true,
        },
        dialogueSessionStartId: null,
        v04Slice: {},
      }),
    },
  });
  await prisma.creatorProfile.update({
    where: { id: profileId },
    data: { currentRevisionId: revision.id },
  });

  const before = await getProfileWorkspace();
  assert.equal(before.pending?.understood, "черновик");
  assert.equal(before.portrait, null);
  const payloadBefore = (await prisma.profileRevision.findUnique({ where: { id: revision.id } }))?.payloadJson;
  await startProfileDialogue();
  const after = await getProfileWorkspace();
  assert.equal(after.portrait, null);
  assert.equal((await prisma.profileRevision.findUnique({ where: { id: revision.id } }))?.payloadJson, payloadBefore);
  assert.equal(await prisma.profileRevision.count({ where: { profileId } }), 1);
});

test("concurrent skip waits on the commit lock and keeps the new slice", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  resetProfileLockSeamForTests();
  t.after(async () => {
    resetProfileLockSeamForTests();
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

  let releaseCommit: () => void = () => undefined;
  const commitMayFinish = new Promise<void>((resolve) => {
    releaseCommit = resolve;
  });
  let markCommitLocked: () => void = () => undefined;
  const commitLocked = new Promise<void>((resolve) => {
    markCommitLocked = resolve;
  });
  let markSkipAboutToLock: () => void = () => undefined;
  const skipAboutToLock = new Promise<void>((resolve) => {
    markSkipAboutToLock = resolve;
  });

  setProfileLockSeamForTests({
    afterCommitLocked: async () => {
      markCommitLocked();
      await commitMayFinish;
    },
    beforeSessionLock: async () => {
      markSkipAboutToLock();
    },
  });

  const apply = sendProfileMessage({ text: "Для своих.", idempotencyKey: "v04-race-audience" }, async () => ({
    text: v04ReplaceExplicitJson([(await latestUser(prisma)).id], "general_audience", "свои"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  await commitLocked;
  const skip = skipProfileDialogue();
  await skipAboutToLock;
  releaseCommit();
  await Promise.all([apply, skip]);
  resetProfileLockSeamForTests();

  const workspace = await getProfileWorkspace();
  assert.equal(workspace.profile.fields.find((field) => field.id === "whyRecord")?.text, "говорить своими словами");
  assert.equal(workspace.profile.fields.find((field) => field.id === "audience")?.text, "свои");
  const stored = await readStoredProfilePayload();
  assert.equal(stored.v04Slice.blog_goal, "говорить своими словами");
  assert.equal(stored.v04Slice.general_audience, "свои");
});
