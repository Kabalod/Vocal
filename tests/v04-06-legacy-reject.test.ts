import assert from "node:assert/strict";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { readStoredProfilePayload } from "../src/lib/profile";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

test("V04-06 rejects legacy ready/complete without a hidden confirm draft", async (t) => {
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
  const after = await sendProfileMessage(
    { text: "Говорю своими словами для близких.", idempotencyKey: "legacy-ready-1" },
    async () => ({
      text: JSON.stringify({
        reply: "Портрета достаточно.",
        kind: "ready",
        complete: true,
        coveredKeys: ["whyRecord", "audience"],
        missingKeys: [],
        patch: {
          whyRecord: { text: "говорить своими словами", usage: "understanding" },
          audience: { text: "близкие", usage: "understanding" },
        },
      }),
      usage: { promptTokens: 2, completionTokens: 2 },
    }),
  );
  const stored = await readStoredProfilePayload();
  assert.notEqual(stored.pending?.readyToConfirm, true);
  assert.equal(after.awaitingConfirm, false);
  assert.equal(after.draftPortrait, null);
  assert.equal(after.portrait, null);
  assert.equal(after.profile.fields.find((field) => field.id === "whyRecord")?.text, "");
  assert.equal(after.profile.fields.find((field) => field.id === "audience")?.text, "");
  assert.ok(
    after.dialogue.messages.some(
      (item) => item.kind === "error" && item.body.includes("контракту портрета"),
    ),
  );
});
