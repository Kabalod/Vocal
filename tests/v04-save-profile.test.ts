import assert from "node:assert/strict";
import { test } from "node:test";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { ProfileError } from "../src/lib/profile";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { seedPublishedPortrait } from "./helpers/seed-published-portrait";

test("PUT /api/profile and saveProfile do not write portrait fields", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  await seedPublishedPortrait({
    whyRecord: { text: "говорить своими словами", usage: "understanding" },
  });
  const { saveProfile } = await import("../src/lib/profile");
  await assert.rejects(
    () => saveProfile({ fields: [{ id: "whyRecord", text: "обход журнала", usage: "in_text" }] }),
    (error: unknown) => error instanceof ProfileError && error.code === "SAVE_PROFILE_REMOVED" && error.status === 410,
  );

  const { GET: getProfile, PUT: putProfile } = await import("../src/app/api/profile/route");
  const put = await putProfile(
    new Request("http://vocal.local/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: [{ id: "whyRecord", text: "обход журнала", usage: "in_text" }],
      }),
    }),
  );
  assert.equal(put.status, 410);
  const putBody = await put.json();
  assert.equal(putBody.code, "SAVE_PROFILE_REMOVED");

  const listed = await (await getProfile()).json();
  assert.equal(listed.profile.fields.find((field: { id: string }) => field.id === "whyRecord")?.text, "говорить своими словами");
});
