import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { assembleReelContext } from "../src/lib/reel-context";
import { emptyProfileFields, type ProfileFieldValue } from "../src/types/profile";

function fields(patch: Partial<Record<string, { text: string; usage: "in_text" | "understanding" }>>): ProfileFieldValue[] {
  return emptyProfileFields().map((field) => {
    const next = patch[field.id];
    return next ? { ...field, ...next } : field;
  });
}

test("assembleReelContext is deterministic and respects selection and usage", () => {
  const input = {
    profileRevisionId: "rev1",
    fields: fields({
      whyRecord: { text: "  вымышленный чай  ", usage: "in_text" },
      blogGoal: { text: "тест-цель", usage: "understanding" },
      audience: { text: "не должна попасть", usage: "in_text" },
      lifeNow: { text: "   ", usage: "in_text" },
      boundaries: { text: "не рассказывать про работу", usage: "understanding" },
    }),
    selectedKeys: ["boundaries", "whyRecord", "blogGoal", "lifeNow"] as const,
    reelGoal: " ролик про чай ",
    reelAudience: "друзья теста",
  };
  const a = assembleReelContext({ ...input, selectedKeys: [...input.selectedKeys] });
  const b = assembleReelContext({ ...input, selectedKeys: [...input.selectedKeys] });
  assert.deepEqual(a, b);
  assert.equal(a.reelGoal, "ролик про чай");
  assert.deepEqual(
    a.publicForScript.map((item) => item.id),
    ["whyRecord"],
  );
  assert.deepEqual(
    a.understandingOnly.map((item) => item.id),
    ["blogGoal", "boundaries"],
  );
  assert.ok(a.excludedKeys.includes("audience"));
  assert.ok(!a.publicForScript.some((item) => item.id === "audience"));
  assert.ok(!a.publicForScript.some((item) => item.id === "lifeNow"));
  assert.ok(!a.understandingOnly.some((item) => item.text.includes("не должна")));
});

test("profile and reel context API: PUT closed, snapshot survives later portrait change", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
      t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { GET: getProfile, PUT: putProfile } = await import("../src/app/api/profile/route");
  const { POST: createReel } = await import("../src/app/api/reels/route");
  const { GET: getContext, PUT: putContext } = await import("../src/app/api/reels/[id]/context/route");
  const { persistProfilePayload, readStoredProfilePayload } = await import("../src/lib/profile");
  const { buildPortrait } = await import("../src/lib/profile-portrait");

  const empty = await getProfile();
  assert.equal(empty.status, 200);
  const emptyBody = await empty.json();
  assert.equal(emptyBody.profile.fields.length, 8);
  assert.equal(emptyBody.profile.fields.every((field: { text: string }) => field.text === ""), true);

  const blocked = await putProfile(
    new Request("http://vocal.local/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: fields({
          whyRecord: { text: "вымышленный автор теста пишет про чай", usage: "in_text" },
          blogGoal: { text: "набрать 10 вымышленных роликов", usage: "understanding" },
          boundaries: { text: "не называть город", usage: "understanding" },
        }),
      }),
    }),
  );
  assert.equal(blocked.status, 410);
  const blockedBody = await blocked.json();
  assert.equal(blockedBody.code, "SAVE_PROFILE_REMOVED");
  const stillEmpty = await (await getProfile()).json();
  assert.equal(stillEmpty.profile.fields.every((field: { text: string }) => field.text === ""), true);

  const seededFields = fields({
    whyRecord: { text: "вымышленный автор теста пишет про чай", usage: "in_text" },
    blogGoal: { text: "набрать 10 вымышленных роликов", usage: "understanding" },
    boundaries: { text: "не называть город", usage: "understanding" },
  });
  const published = await persistProfilePayload({
    ...(await readStoredProfilePayload()),
    fields: seededFields,
    portrait: buildPortrait(seededFields, true),
  });
  const publishedRevision = published.currentRevisionId;

  const created = await createReel(
    new Request("http://vocal.local/api/reels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Чайный ролик" }),
    }),
  );
  const reel = (await created.json()).reel as { id: string };

  const missing = await getContext(new Request("http://vocal.local"), {
    params: Promise.resolve({ id: "no-such" }),
  });
  assert.equal(missing.status, 404);

  const stored = await putContext(
    new Request(`http://vocal.local/api/reels/${reel.id}/context`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reelGoal: "рассказать вымышленный рецепт",
        reelAudience: "тестовые друзья",
        selectedKeys: ["whyRecord", "blogGoal", "audience", "boundaries"],
      }),
    }),
    { params: Promise.resolve({ id: reel.id }) },
  );
  assert.equal(stored.status, 200);
  const storedBody = (await stored.json()).context;
  assert.equal(storedBody.live.publicForScript.length, 1);
  assert.equal(storedBody.live.publicForScript[0].id, "whyRecord");
  assert.equal(storedBody.live.understandingOnly.map((item: { id: string }) => item.id).join(","), "blogGoal,boundaries");
  assert.ok(storedBody.live.excludedKeys.includes("topics"));
  assert.equal(storedBody.live.selectedKeys.includes("audience"), true);
  assert.ok(!storedBody.live.publicForScript.some((item: { id: string }) => item.id === "audience"));
  assert.equal(storedBody.snapshots.length, 1);
  const frozenPublic = storedBody.snapshots[0].assembled.publicForScript[0].text;

  const changedFields = fields({
    whyRecord: { text: "новая вымышленная формулировка", usage: "in_text" },
    blogGoal: { text: "другая цель", usage: "in_text" },
    boundaries: { text: "не называть город", usage: "understanding" },
  });
  await persistProfilePayload({
    ...(await readStoredProfilePayload()),
    fields: changedFields,
    portrait: buildPortrait(changedFields, true),
  });

  const after = await getContext(new Request("http://vocal.local"), {
    params: Promise.resolve({ id: reel.id }),
  });
  const afterBody = (await after.json()).context;
  assert.equal(afterBody.live.publicForScript[0].text, "новая вымышленная формулировка");
  assert.equal(afterBody.snapshots[0].assembled.publicForScript[0].text, frozenPublic);
  assert.notEqual(afterBody.live.profileRevisionId, publishedRevision);
  assert.equal(afterBody.snapshots[0].profileRevisionId, publishedRevision);

  const same = await putContext(
    new Request(`http://vocal.local/api/reels/${reel.id}/context`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reelGoal: "рассказать вымышленный рецепт",
        reelAudience: "тестовые друзья",
        selectedKeys: ["whyRecord", "blogGoal", "audience", "boundaries"],
      }),
    }),
    { params: Promise.resolve({ id: reel.id }) },
  );
  const sameBody = (await same.json()).context;
  assert.equal(sameBody.snapshots.length, 2);

  const tooLong = await putProfile(
    new Request("http://vocal.local/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: [{ id: "whyRecord", text: "я".repeat(4001), usage: "in_text" }],
      }),
    }),
  );
  assert.equal(tooLong.status, 410);
});
