import assert from "node:assert/strict";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { PROFILE_DIALOGUE_KIND } from "../src/lib/ai/profile";
import { portraitProfileId, ownerUserId } from "../src/lib/auth/session";
import { persistProfilePayload } from "../src/lib/profile";
import { ProfileDialogueError } from "../src/lib/profile-dialogue";
import { emptyStoredPayload } from "../src/lib/profile-portrait";
import { emptyProfileFields } from "../src/types/profile";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const legacyPatch = JSON.stringify({
  reply: "Для кого это?",
  coveredKeys: ["whyRecord"],
  missingKeys: ["audience"],
  patch: { whyRecord: { text: "Говорить своими словами", usage: "understanding" } },
  complete: false,
});

test("V04-04 does not restore portrait fields from a legacy profile_dialogue AiCall", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  await persistProfilePayload(emptyStoredPayload());
  await prisma.aiCall.create({
    data: {
      kind: PROFILE_DIALOGUE_KIND,
      profileId: portraitProfileId(),
      model: "test",
      status: "done",
      ownerUserId: ownerUserId(),
      promptText: "legacy",
      inputSnapshotJson: "{}",
      responseText: legacyPatch,
      resultJson: legacyPatch,
    },
  });
  const startRevisions = await prisma.profileRevision.count({ where: { profileId: portraitProfileId() } });
  const { getProfileWorkspace } = await import("../src/lib/profile-dialogue");
  const workspace = await getProfileWorkspace();
  assert.equal(workspace.portrait, null);
  assert.equal(workspace.profile.fields.find((field) => field.id === "whyRecord")?.text, "");
  assert.equal(
    await prisma.profileRevision.count({ where: { profileId: portraitProfileId() } }),
    startRevisions,
  );
});

test("V04-04 does not publish a readyToConfirm pending without confirm", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const draftFields = emptyProfileFields().map((field) =>
    field.id === "whyRecord" ? { ...field, text: "Говорить своими словами" } : field,
  );
  await persistProfilePayload({
    ...emptyStoredPayload(),
    pending: {
      mode: "intake",
      understood: "",
      openQuestions: [],
      draftFields,
      readyToConfirm: true,
    },
  });
  const startRevisions = await prisma.profileRevision.count({ where: { profileId: portraitProfileId() } });
  const { getProfileWorkspace, confirmProfilePortrait } = await import("../src/lib/profile-dialogue");
  const before = await getProfileWorkspace();
  assert.equal(before.portrait, null);
  assert.equal(before.awaitingConfirm, false);
  assert.equal(before.phase, "idle");
  assert.equal(before.profile.fields.find((field) => field.id === "whyRecord")?.text, "");
  assert.equal(
    await prisma.profileRevision.count({ where: { profileId: portraitProfileId() } }),
    startRevisions,
  );

  await assert.rejects(
    () => confirmProfilePortrait(),
    (err: unknown) => err instanceof ProfileDialogueError && err.code === "CONFIRM_REMOVED",
  );
  const after = await getProfileWorkspace();
  assert.equal(after.portrait, null);
  assert.equal(after.profile.fields.find((field) => field.id === "whyRecord")?.text, "");
});
