import assert from "node:assert/strict";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { PROFILE_DIALOGUE_KIND } from "../src/lib/ai/profile";
import { portraitProfileId } from "../src/lib/auth/session";
import { parseV04ResultEnvelope } from "../src/lib/v04-commit";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

function countingObservationJson(evidenceMessageIds: string[]) {
  return JSON.stringify({
    kind: "apply_update",
    category: "concreteness",
    value: "high",
    scope: "global",
    evidenceType: "behavioral_observation",
    evidenceMessageIds,
    confidence: 0.9,
    operation: "add_observation",
  });
}

test("V04-03 publishes a derived slot at weight 3 with one new revision", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { startProfileDialogue, sendProfileMessage } = await import("../src/lib/profile-dialogue");
  await startProfileDialogue();
  const startRevisions = await prisma.profileRevision.count({ where: { profileId: portraitProfileId() } });

  for (const [index, key] of ["v04-03-a", "v04-03-b", "v04-03-c"].entries()) {
    await sendProfileMessage(
      { text: `наблюдение ${index + 1}`, idempotencyKey: key },
      async () => {
        const user = await prisma.dialogueMessage.findFirst({
          where: { role: "user" },
          orderBy: { createdAt: "desc" },
        });
        assert.ok(user);
        return { text: countingObservationJson([user.id]), usage: { promptTokens: 1, completionTokens: 1 } };
      },
    );
    const call = await prisma.aiCall.findFirst({
      where: { kind: PROFILE_DIALOGUE_KIND, status: "done" },
      orderBy: { createdAt: "desc" },
    });
    const envelope = parseV04ResultEnvelope(call?.resultJson);
    assert.equal(envelope?.event?.applyResult.systemWeight, index + 1);
    if (index < 2) {
      assert.equal(envelope?.event?.applyResult.displaySliceChanged, false);
      assert.equal(envelope?.event?.applyResult.newRevisionId, null);
    } else {
      assert.equal(envelope?.event?.applyResult.slotAdmitted, true);
      assert.equal(envelope?.event?.applyResult.displaySliceChanged, true);
      assert.ok(envelope?.event?.applyResult.newRevisionId);
    }
  }

  assert.equal(
    await prisma.profileRevision.count({ where: { profileId: portraitProfileId() } }),
    startRevisions + 1,
  );
});
