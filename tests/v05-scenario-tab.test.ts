import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { v05TabPhase } from "../src/lib/v05-script";

test("V05 tab phases do not generate on inspect", () => {
  assert.equal(v05TabPhase({ ready: false, hasScript: false, stale: false, generating: false }), "not_ready");
  assert.equal(v05TabPhase({ ready: true, hasScript: false, stale: false, generating: false }), "ready_to_generate");
  assert.equal(v05TabPhase({ ready: true, hasScript: true, stale: false, generating: false }), "ready");
  assert.equal(v05TabPhase({ ready: true, hasScript: true, stale: true, generating: false }), "stale");
  assert.equal(v05TabPhase({ ready: true, hasScript: false, stale: false, generating: true }), "generating");
});

test("V05 generate is explicit, versions are immutable, STT does not mint a script", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { applyThoughtState } = await import("../src/lib/thought-state");
  const { listScriptWorkspace, openScriptDraft, patchScriptDraft } = await import("../src/lib/scripts");
  const { generateV05Script, keepCurrentScript, parseV05GenerateSnapshot, ScriptReadinessError } = await import(
    "../src/lib/v05-script"
  );
  const { applyThoughtMediaFromTranscript } = await import("../src/lib/thought-media");
  const { createTake } = await import("../src/lib/reels");
  const { ensureOriginalFromText } = await import("../src/lib/transcripts");
  const { requestScriptHelp, DialogueError, ensureReelThread, transferDialogueProposal } = await import("../src/lib/dialogue");
  const { generateScriptProposal } = await import("../src/lib/ai/script");

  const { reel } = await createThoughtFromText({
    title: "V05 мысль",
    body: "Я хочу сказать, что чай остыл на подоконнике.",
    idempotencyKey: "v05-thought-1",
  });

  const listed = await listScriptWorkspace(reel.id);
  assert.equal(listed.readyCount, 0);
  assert.equal(listed.phase, "ready_to_generate");
  assert.equal(listed.canGenerate, true);
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id, kind: { not: "from_take" } } }), 0);

  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: { openGaps: [{ id: "gap-position", text: "Какая ваша позиция?", status: "open" }] },
  });
  const blocked = await listScriptWorkspace(reel.id);
  assert.equal(blocked.phase, "not_ready");
  assert.equal(blocked.blockReason, "Какая ваша позиция?");
  assert.equal(blocked.nextQuestion?.gapId, "gap-position");
  await assert.rejects(
    () => generateV05Script(reel.id, { idempotencyKey: "blocked" }, async () => ({ text: '{"script":"нет"}' })),
    (error: unknown) => error instanceof ScriptReadinessError && error.blockReason === "Какая ваша позиция?",
  );
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id, kind: { not: "from_take" } } }), 0);

  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 1,
    patch: { openGaps: [{ id: "gap-position", text: "Какая ваша позиция?", status: "resolved" }], intent: "чай на подоконнике" },
  });

  const take = await prisma.take.findFirstOrThrow({ where: { reelId: reel.id } });
  await applyThoughtMediaFromTranscript(take.id, "Я хочу сказать, что чай остыл на подоконнике.");
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id, kind: { not: "from_take" } } }), 0);

  let calls = 0;
  const first = await generateV05Script(reel.id, { idempotencyKey: "gen-1" }, async () => {
    calls += 1;
    return { text: JSON.stringify({ script: "Чай остыл на подоконнике." }) };
  });
  assert.equal(calls, 1);
  assert.equal(first.readyCount, 1);
  assert.equal(first.viewing?.kind, "accepted_ai");
  assert.equal(first.viewing?.body, "Чай остыл на подоконнике.");
  const snap = parseV05GenerateSnapshot(
    (await prisma.scriptVersion.findFirstOrThrow({ where: { id: first.viewing!.id } })).inputSnapshotJson,
  );
  assert.ok(snap?.ownerUserId);
  assert.equal(snap?.reelId, reel.id);
  assert.equal(snap?.sourceKeys.some((key) => key.startsWith("profile")), false);

  const replay = await generateV05Script(reel.id, { idempotencyKey: "gen-1" }, async () => {
    calls += 1;
    return { text: JSON.stringify({ script: "вторая версия не должна появиться" }) };
  });
  assert.equal(calls, 1);
  assert.equal(replay.readyCount, 1);
  assert.equal(replay.viewing?.id, first.viewing?.id);

  const opened = await openScriptDraft(reel.id, first.headId);
  const patched = await patchScriptDraft(reel.id, {
    body: "Ручная правка про подоконник.",
    expectedUpdatedAt: opened.draft!.updatedAt,
    expectedSaveToken: opened.draft!.saveToken,
  });
  assert.equal(patched.draft?.body, "Ручная правка про подоконник.");
  assert.equal(patched.readyCount, 1);

  await assert.rejects(
    () =>
      generateV05Script(reel.id, { idempotencyKey: "gen-dirty" }, async () => {
        const live = await listScriptWorkspace(reel.id);
        await patchScriptDraft(reel.id, {
          body: "Ещё правка во время модели.",
          expectedUpdatedAt: live.draft!.updatedAt,
          expectedSaveToken: live.draft!.saveToken,
        });
        return { text: JSON.stringify({ script: "не должно записаться" }) };
      }),
    (error: unknown) => error instanceof Error && /изменился/.test(error.message),
  );
  const afterDirty = await listScriptWorkspace(reel.id);
  assert.equal(afterDirty.readyCount, 1);
  assert.equal(afterDirty.draft?.body, "Ещё правка во время модели.");
  assert.equal(afterDirty.versions.filter((row) => row.kind === "accepted_ai").length, 1);

  const thread = await ensureReelThread(reel.id);
  await prisma.dialogueMessage.create({
    data: {
      threadId: thread.id,
      role: "user",
      kind: "text",
      body: "Добавлю, что это было утром.",
    },
  });
  const stale = await listScriptWorkspace(reel.id);
  assert.equal(stale.stale, true);
  assert.equal(stale.phase, "stale");
  assert.equal(stale.draft?.body, "Ещё правка во время модели.");

  const kept = await keepCurrentScript(reel.id);
  assert.equal(kept.stale, false);
  const keptRow = await prisma.scriptVersion.findFirstOrThrow({ where: { id: first.viewing!.id } });
  const keptSnap = parseV05GenerateSnapshot(keptRow.inputSnapshotJson);
  assert.equal(keptSnap?.thoughtStateRevision, snap?.thoughtStateRevision);
  assert.equal(keptSnap?.lastUserMessageId, snap?.lastUserMessageId);
  assert.ok(keptSnap?.kept?.lastUserMessageId);
  assert.notEqual(keptSnap?.kept?.lastUserMessageId, snap?.lastUserMessageId);

  const updated = await generateV05Script(reel.id, { idempotencyKey: "gen-2" }, async () => ({
    text: JSON.stringify({ script: "Чай остыл на подоконнике утром." }),
  }));
  assert.equal(updated.readyCount, 2);
  assert.equal(updated.viewing?.body, "Чай остыл на подоконнике утром.");
  assert.equal((await prisma.scriptVersion.findFirstOrThrow({ where: { id: first.viewing!.id } })).body, "Чай остыл на подоконнике.");

  const take2 = await createTake(reel.id, { inputType: "text", bodyText: "новый рабочий дубль" });
  await ensureOriginalFromText(take2.id, "новый рабочий дубль");
  await prisma.reel.update({ where: { id: reel.id }, data: { workingTakeId: take2.id } });
  const afterTake = await listScriptWorkspace(reel.id);
  assert.equal(afterTake.stale, true);

  await assert.rejects(
    () =>
      generateV05Script(reel.id, { idempotencyKey: "gen-conflict" }, async () => {
        await applyThoughtState({
          reelId: reel.id,
          expectedRevision: (await prisma.thoughtState.findFirstOrThrow({ where: { reelId: reel.id } })).revision,
          patch: { position: "новая позиция" },
        });
        return { text: JSON.stringify({ script: "конфликт" }) };
      }),
    (error: unknown) => error instanceof Error && /изменились/.test((error as Error).message),
  );
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id, body: "конфликт" } }), 0);

  process.env.VOCAL_TEST_USER_ID = "user-b";
  await assert.rejects(
    () => generateV05Script(reel.id, { idempotencyKey: "foreign" }, async () => ({ text: '{"script":"x"}' })),
    /не найдена/i,
  );
  await assert.rejects(() => keepCurrentScript(reel.id), /не найдена/i);
  process.env.VOCAL_TEST_USER_ID = "local";

  await assert.rejects(() => requestScriptHelp(reel.id, { idempotencyKey: "help-1" }), (error: unknown) => {
    return error instanceof DialogueError && error.status === 410;
  });
  await assert.rejects(() => transferDialogueProposal(reel.id, "msg"), (error: unknown) => {
    return error instanceof DialogueError && error.status === 410;
  });

  const ignored = await generateScriptProposal(
    reel.id,
    { sources: [{ type: "transcript", id: "foreign-id" }], idempotencyKey: "gen-ignore-sources" },
    async () => ({ text: JSON.stringify({ script: "Сервер сам выбрал источники." }) }),
  );
  assert.ok(ignored.proposalId);
  assert.equal(ignored.bundle.versions.some((row) => row.body === "Сервер сам выбрал источники."), true);
});
