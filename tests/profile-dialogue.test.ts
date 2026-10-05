import assert from "node:assert/strict";
import { test } from "node:test";
import { resetProfileLockSeamForTests, setProfileLockSeamForTests } from "../src/lib/profile-lock-seam";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { assembleReelContext } from "../src/lib/reel-context";
import {
  applyFieldOperations,
  buildPortrait,
  decidePortraitComplete,
  mergeProfileFields,
  sanitizeFieldOperations,
  sanitizePortraitPatch,
} from "../src/lib/profile-portrait";
import { fallbackProfileReply, parseProfileAiReply } from "../src/lib/ai/profile";
import { emptyProfileFields, LOCAL_PROFILE_ID } from "../src/types/profile";
import { v04NoChangeJson, v04ReplaceExplicitJson } from "./helpers/v04-profile-reply";

test("merge keeps confirmed meanings and empty patch does not wipe", () => {
  const current = emptyProfileFields().map((field) =>
    field.id === "whyRecord" ? { ...field, text: "Хочу говорить своими словами" } : field,
  );
  const merged = mergeProfileFields(current, {
    whyRecord: { text: "   " },
    boundaries: { text: "не хочу говорить о теме работы" },
  });
  assert.equal(merged.find((field) => field.id === "whyRecord")?.text, "Хочу говорить своими словами");
  assert.equal(merged.find((field) => field.id === "boundaries")?.text, "не хочу говорить о теме работы");
  const portrait = buildPortrait(merged, true);
  assert.ok(portrait.sections.some((section) => section.id === "goals"));
  assert.ok(portrait.sections.some((section) => section.id === "boundaries"));
  assert.equal(
    portrait.sections.some((section) => section.id === "topics"),
    false,
  );
  assert.equal(
    decidePortraitComplete({
      fields: current,
      modelComplete: true,
      mode: "intake",
      hasChange: false,
    }),
    false,
  );
  assert.equal(
    decidePortraitComplete({
      fields: merged,
      modelComplete: true,
      mode: "intake",
      hasChange: true,
    }),
    false,
  );
  const withAudience = mergeProfileFields(merged, { audience: { text: "свои" } });
  assert.equal(
    decidePortraitComplete({
      fields: withAudience,
      modelComplete: true,
      mode: "intake",
      hasChange: true,
    }),
    true,
  );
  assert.equal(
    decidePortraitComplete({
      fields: withAudience,
      modelComplete: false,
      mode: "intake",
      hasChange: true,
    }),
    false,
  );
  assert.equal(
    decidePortraitComplete({
      fields: withAudience,
      modelComplete: true,
      mode: "intake",
      hasChange: true,
      openQuestions: ["Цель противоречит аудитории"],
    }),
    false,
  );
  assert.equal(
    decidePortraitComplete({
      fields: withAudience,
      modelComplete: true,
      mode: "intake",
      hasChange: true,
      kind: "clarify",
    }),
    false,
  );
  const cleared = applyFieldOperations(withAudience, [{ field: "audience", op: "clear" }]);
  assert.equal(cleared.find((field) => field.id === "audience")?.text, "");
  assert.equal(
    decidePortraitComplete({
      fields: withAudience,
      modelComplete: true,
      mode: "amend",
      hasChange: false,
    }),
    false,
  );
  assert.equal(
    decidePortraitComplete({
      fields: withAudience,
      modelComplete: true,
      mode: "amend",
      hasChange: true,
    }),
    true,
  );
});

test("sanitize and parse accept live Groq value patch and empty reply", () => {
  const patch = sanitizePortraitPatch({
    whyRecord: { value: "Говорить своими словами", usage: "understanding" },
    blogGoal: "Помогать говорить яснее",
    audience: { text: "Коллеги", usage: "in_text" },
  });
  assert.equal(patch.whyRecord?.text, "Говорить своими словами");
  assert.equal(patch.blogGoal?.text, "Помогать говорить яснее");
  assert.equal(patch.audience?.text, "Коллеги");
  assert.equal(patch.audience?.usage, "in_text");

  const parsed = parseProfileAiReply({
    reply: "",
    coveredKeys: ["whyRecord"],
    missingKeys: ["audience"],
    patch: { whyRecord: { value: "Своими словами", usage: "understanding" } },
    operations: [{ field: "whyRecord", op: "set", value: "Своими словами", usage: "understanding" }],
    complete: false,
  });
  assert.equal(parsed.patch.whyRecord?.text, "Своими словами");
  assert.equal(parsed.operations[0]?.op, "set");
  assert.equal(parsed.operations[0]?.text, "Своими словами");
  assert.equal(parsed.reply, fallbackProfileReply(["audience"]));
  assert.ok(!parsed.reply.includes("too_small"));
  assert.equal(sanitizeFieldOperations([{ field: "audience", op: "delete", text: "все" }]).length, 0);
});

test("profile dialogue covers keys, voice skips confirm, reload and snapshots stay", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
    delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
    t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const {
    startProfileDialogue,
    sendProfileMessage,
    sendProfileVoice,
    getProfileWorkspace,
    supplementProfileDialogue,
    skipProfileDialogue,
  } = await import("../src/lib/profile-dialogue");
  const { GET: getProfile, PUT: putProfile } = await import("../src/app/api/profile/route");

  const started = await startProfileDialogue();
  assert.equal(started.phase, "conversation");
  assert.ok(started.dialogue.messages.some((item) => item.body.includes("зачем")));

  const afterGoal = await sendProfileMessage(
    { text: "Записываю, чтобы говорить своими словами.", idempotencyKey: "a1" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return {
        text: v04ReplaceExplicitJson([user.id], "blog_goal", "Говорить своими словами"),
        usage: { promptTokens: 4, completionTokens: 3 },
      };
    },
  );
  assert.equal(afterGoal.awaitingConfirm, false);
  assert.equal(afterGoal.phase, "portrait");
  const afterAudience = await sendProfileMessage(
    { text: "Для людей, которым близка тихая речь.", idempotencyKey: "a2" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return {
        text: v04ReplaceExplicitJson([user.id], "general_audience", "Люди, которым близка тихая речь"),
        usage: { promptTokens: 4, completionTokens: 3 },
      };
    },
  );
  const done = afterAudience;
  assert.equal(done.phase, "portrait");
  assert.equal(done.pendingChange, false);
  assert.ok(done.portrait);
  assert.ok(done.portrait.coveredKeys.includes("whyRecord"));
  assert.ok(done.portrait.coveredKeys.includes("audience"));
  assert.ok(done.portrait.sections.some((section) => section.id === "goals"));
  assert.equal(
    done.portrait.sections.some((section) => section.id === "topics"),
    false,
  );
  const keptGoals = done.portrait.sections.find((section) => section.id === "goals")?.text;
  const again = await sendProfileMessage({ text: "Записываю, чтобы говорить своими словами.", idempotencyKey: "a1" }, async () => {
    throw new Error("model must not run on the same idempotency key");
  });
  assert.equal(again.dialogue.messages.filter((item) => item.body === "Записываю, чтобы говорить своими словами.").length, 1);
  await supplementProfileDialogue();
  const failedApply = await sendProfileMessage(
    { text: "добавить опыт путешествий, которых не было", idempotencyKey: "fail-1" },
    async () => {
      throw new Error("модель недоступна");
    },
  );
  assert.equal(failedApply.applyError, "модель недоступна");
  assert.equal(failedApply.phase, "conversation");
  assert.equal(failedApply.pendingChange, true);
  assert.equal(failedApply.portrait?.sections.find((section) => section.id === "goals")?.text, keptGoals);
  assert.ok(failedApply.dialogue.messages.some((item) => item.body === "добавить опыт путешествий, которых не было"));
  assert.equal(
    failedApply.dialogue.messages.some((item) => item.body === "Записываю, чтобы говорить своими словами."),
    false,
  );

  let voiceComplete = 0;
  const afterVoice = await sendProfileVoice(
    { file: new File(["x"], "reply.webm", { type: "audio/webm" }), idempotencyKey: "voice-1", voiceDurationLabel: "0:03" },
    async () => {
      voiceComplete += 1;
      return {
        text: v04ReplaceExplicitJson(
          [
            (
              await prisma.dialogueMessage.findFirst({
                where: { role: "user" },
                orderBy: { createdAt: "desc" },
              })
            )!.id,
          ],
          "standing_topic",
          "тишина и речь",
        ),
        usage: { promptTokens: 2, completionTokens: 2 },
      };
    },
    async () => ({ text: "Хочу говорить про тишину и речь", segments: [], model: "mock" }),
    async () => undefined,
  );
  assert.equal(voiceComplete, 1);
  const voiceUser = afterVoice.dialogue.messages.find((item) => item.voice?.durationLabel === "0:03");
  assert.ok(voiceUser);
  assert.equal(voiceUser.body, "Хочу говорить про тишину и речь");
  assert.ok(!afterVoice.dialogue.messages.some((item) => item.body.includes("подтвердите транскрипт")));

  const groqShape = await sendProfileMessage(
    { text: "Говорить хочу коротко и спокойно.", idempotencyKey: "value-live-shape" },
    async () => ({
      text: JSON.stringify({
        reply: "",
        coveredKeys: ["speakingStyle"],
        missingKeys: ["lifeNow"],
        patch: { speakingStyle: { value: "Коротко и спокойно", usage: "understanding" } },
        complete: false,
      }),
      usage: { promptTokens: 2, completionTokens: 2 },
    }),
  );
  assert.notEqual(groqShape.pending?.readyToConfirm, true);
  assert.equal(groqShape.draftPortrait, null);
  assert.equal(groqShape.profile.fields.find((field) => field.id === "speakingStyle")?.text, "");
  assert.ok(groqShape.dialogue.messages.some((item) => item.kind === "error" && item.body.includes("контракту портрета")));
  assert.ok(!groqShape.dialogue.messages.some((item) => item.body.includes("too_small")));

  const reloaded = await getProfileWorkspace();
  assert.ok(reloaded.dialogue.messages.length >= afterVoice.dialogue.messages.length);
  assert.ok(reloaded.portrait?.coveredKeys.includes("whyRecord"));

  const beforeBoundary = reloaded.profile.fields.find((field) => field.id === "whyRecord")?.text;
  await supplementProfileDialogue();
  const afterBoundary = await sendProfileMessage(
    { text: "не хочу говорить о теме работы", idempotencyKey: "bound-1" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return {
        text: v04ReplaceExplicitJson([user.id], "explicit_boundary", "не хочу говорить о теме работы"),
        usage: { promptTokens: 2, completionTokens: 1 },
      };
    },
  );
  assert.equal(afterBoundary.awaitingConfirm, false);
  assert.equal(afterBoundary.phase, "conversation");
  assert.equal(afterBoundary.portrait?.sections.find((section) => section.id === "goals")?.text, keptGoals);
  const confirmedBoundary = await skipProfileDialogue();
  assert.equal(confirmedBoundary.phase, "portrait");
  assert.equal(confirmedBoundary.pendingChange, false);
  assert.equal(confirmedBoundary.profile.fields.find((field) => field.id === "whyRecord")?.text, beforeBoundary);
  assert.equal(confirmedBoundary.profile.fields.find((field) => field.id === "boundaries")?.text, "не хочу говорить о теме работы");
  assert.ok(confirmedBoundary.portrait?.sections.some((section) => section.id === "boundaries"));

  const afterClear = await sendProfileMessage(
    { text: "убери границу про работу", idempotencyKey: "clear-bound-1" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return { text: v04NoChangeJson("insufficient_signal"), usage: { promptTokens: 1, completionTokens: 1 } };
    },
  );
  const confirmedClear = afterClear;
  assert.equal(confirmedClear.profile.fields.find((field) => field.id === "boundaries")?.text, "не хочу говорить о теме работы");
  assert.ok(confirmedClear.portrait?.sections.some((section) => section.id === "boundaries"));

  const calls = await prisma.aiCall.findMany({ where: { kind: "profile_dialogue" } });
  assert.ok(calls.length >= 1);
  assert.ok(calls.every((row) => row.reelId === null && row.profileId === LOCAL_PROFILE_ID));
  assert.ok(calls.some((row) => (row.promptTokens ?? 0) + (row.completionTokens ?? 0) > 0));

  const firstRevision = confirmedClear.profile.currentRevisionId;
  const { GET: getContext, PUT: putContext } = await import("../src/app/api/reels/[id]/context/route");
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { reel } = await createThoughtFromText({
    title: "Контекст",
    body: "Мысль для снимка профиля.",
    idempotencyKey: "ctx-1",
  });
  const frozen = await putContext(
    new Request("http://vocal.local/api/reels/x/context", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reelGoal: "ролик",
        reelAudience: "свои",
        selectedKeys: ["whyRecord", "boundaries"],
      }),
    }),
    { params: Promise.resolve({ id: reel.id }) },
  );
  const frozenBody = (await frozen.json()).context;
  assert.equal(frozenBody.live.profileRevisionId, firstRevision);

  await sendProfileMessage(
    { text: "Теперь цель другая", idempotencyKey: "goal-2" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return {
        text: v04ReplaceExplicitJson([user.id], "blog_goal", "другая цель"),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    },
  );
  const afterLive = await getContext(new Request("http://vocal.local/api/reels/x/context"), {
    params: Promise.resolve({ id: reel.id }),
  });
  const afterBody = (await afterLive.json()).context;
  assert.notEqual(afterBody.live.profileRevisionId, firstRevision);
  assert.equal(afterBody.snapshots[0].profileRevisionId, firstRevision);
  assert.equal(afterBody.snapshots[0].assembled.profileRevisionId, firstRevision);

  const saved = await putProfile(
    new Request("http://vocal.local/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: emptyProfileFields().map((field) =>
          field.id === "lifeNow" ? { ...field, text: "живу тихо", usage: "understanding" } : field,
        ),
      }),
    }),
  );
  assert.equal(saved.status, 410);
  const listed = await getProfile();
  const listedBody = await listed.json();
  assert.equal(listedBody.profile.fields.length, 8);
  assert.equal(listedBody.profile.fields.find((field: { id: string }) => field.id === "lifeNow")?.text, "");

  process.env.VOCAL_DAILY_TOKEN_LIMIT = "5";
  await assert.rejects(
    () =>
      sendProfileMessage({ text: "ещё одно", idempotencyKey: "budget-1" }, async () => ({
        text: JSON.stringify({ reply: "нет", coveredKeys: [], missingKeys: [], patch: {}, complete: false }),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    /лимит/i,
  );
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;

  const deterministic = assembleReelContext({
    profileRevisionId: "rev-old",
    fields: emptyProfileFields().map((field) =>
      field.id === "whyRecord" ? { ...field, text: "старый смысл", usage: "in_text" } : field,
    ),
    selectedKeys: ["whyRecord"],
    reelGoal: "цель",
    reelAudience: "свои",
  });
  assert.equal(deterministic.publicForScript[0]?.text, "старый смысл");
});

test("parallel profile answers rematch onto the latest portrait", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
    delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
    t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { startProfileDialogue, sendProfileMessage, getProfileWorkspace } = await import(
    "../src/lib/profile-dialogue"
  );
  await startProfileDialogue();

  let releaseFirst!: () => void;
  const holdFirst = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let enteredFirst!: () => void;
  const firstInModel = new Promise<void>((resolve) => {
    enteredFirst = resolve;
  });

  const whyText = "Пишу, чтобы оставить свои слова.";
  const boundText = "не хочу говорить о теме работы";

  const first = sendProfileMessage({ text: whyText, idempotencyKey: "race-why" }, async () => {
    enteredFirst();
    await holdFirst;
    return {
      text: JSON.stringify({
        reply: "Записал цель.",
        coveredKeys: ["whyRecord"],
        missingKeys: [],
        patch: { whyRecord: { text: "оставить свои слова", usage: "understanding" } },
        complete: false,
      }),
      usage: { promptTokens: 3, completionTokens: 2 },
    };
  });
  const second = sendProfileMessage({ text: boundText, idempotencyKey: "race-bound" }, async () => {
    await firstInModel;
    return {
      text: JSON.stringify({
        reply: "Записал границу.",
        coveredKeys: ["boundaries"],
        missingKeys: [],
        patch: { boundaries: { text: "не хочу говорить о теме работы", usage: "understanding" } },
        complete: false,
      }),
      usage: { promptTokens: 3, completionTokens: 2 },
    };
  });

  await second;
  releaseFirst();
  await first;

  const workspace = await getProfileWorkspace();
  assert.equal(workspace.phase, "conversation");
  assert.equal(workspace.portrait, null);
  assert.equal(workspace.draftPortrait, null);
  assert.notEqual(workspace.pending?.readyToConfirm, true);
  assert.equal(workspace.profile.fields.find((field) => field.id === "whyRecord")?.text, "");
  assert.equal(workspace.profile.fields.find((field) => field.id === "boundaries")?.text, "");

  const users = await prisma.dialogueMessage.findMany({ where: { role: "user" } });
  assert.equal(users.filter((row) => row.body === whyText).length, 1);
  assert.equal(users.filter((row) => row.body === boundText).length, 1);
  assert.equal(await prisma.aiCall.count({ where: { kind: "profile_dialogue" } }), 2);

  const calls = await prisma.aiCall.findMany({ where: { kind: "profile_dialogue" } });
  for (const call of calls) {
    const snapshot = JSON.parse(call.inputSnapshotJson) as { text?: string };
    const text = snapshot.text ?? "";
    assert.ok(text);
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const occurrences = call.promptText.match(new RegExp(escaped, "g")) ?? [];
    assert.equal(occurrences.length, 1, "current reply must appear once in the prompt");
  }
});

test("late answer for the same field does not overwrite a newer value", async (t) => {
  const { prisma, url } = await withPostgresTestDb(t);
  process.env.DATABASE_URL = url;
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { startProfileDialogue, sendProfileMessage, getProfileWorkspace } = await import(
    "../src/lib/profile-dialogue"
  );
  await startProfileDialogue();

  let releaseFirst!: () => void;
  const holdFirst = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let enteredFirst!: () => void;
  const firstInModel = new Promise<void>((resolve) => {
    enteredFirst = resolve;
  });

  const first = sendProfileMessage({ text: "для коллег", idempotencyKey: "aud-old" }, async () => {
    enteredFirst();
    await holdFirst;
    return {
      text: JSON.stringify({
        reply: "Записал старую аудиторию.",
        coveredKeys: ["audience"],
        missingKeys: [],
        patch: { audience: { text: "коллеги", usage: "understanding" } },
        complete: false,
      }),
      usage: { promptTokens: 2, completionTokens: 2 },
    };
  });
  const second = sendProfileMessage({ text: "для близких", idempotencyKey: "aud-new" }, async () => {
    await firstInModel;
    return {
      text: JSON.stringify({
        reply: "Записал новую аудиторию.",
        coveredKeys: ["audience"],
        missingKeys: [],
        patch: { audience: { text: "близкие", usage: "understanding" } },
        complete: false,
      }),
      usage: { promptTokens: 2, completionTokens: 2 },
    };
  });

  await second;
  releaseFirst();
  await first;

  const workspace = await getProfileWorkspace();
  assert.equal(workspace.profile.fields.find((field) => field.id === "audience")?.text, "");
  assert.equal(workspace.draftPortrait, null);
  assert.notEqual(workspace.pending?.readyToConfirm, true);
});

test("V04 commits are serialized by the CreatorProfile lock (fails without FOR UPDATE)", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  delete process.env.VOCAL_TEST_USER_ID;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    resetProfileLockSeamForTests();
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const { startProfileDialogue, sendProfileMessage, getProfileWorkspace } = await import(
    "../src/lib/profile-dialogue"
  );
  const { PROFILE_DIALOGUE_KIND } = await import("../src/lib/ai/profile");
  const { parseV04ResultEnvelope } = await import("../src/lib/v04-commit");
  await startProfileDialogue();

  const observation = (evidenceMessageIds: string[]) =>
    JSON.stringify({
      kind: "apply_update",
      category: "concreteness",
      value: "high",
      scope: "global",
      evidenceType: "behavioral_observation",
      evidenceMessageIds,
      confidence: 0.9,
      operation: "add_observation",
    });
  const userIdFor = async (body: string) =>
    (await prisma.dialogueMessage.findFirstOrThrow({ where: { role: "user", body } })).id;

  let entries = 0;
  let releaseFirstCommit!: () => void;
  const firstCommitHeld = new Promise<void>((resolve) => {
    releaseFirstCommit = resolve;
  });
  let firstHoldsLock!: () => void;
  const firstInLock = new Promise<void>((resolve) => {
    firstHoldsLock = resolve;
  });
  setProfileLockSeamForTests({
    afterCommitLocked: async () => {
      entries += 1;
      if (entries === 1) {
        firstHoldsLock();
        await firstCommitHeld;
      }
    },
  });

  const reply = (body: string) => async () => ({
    text: observation([await userIdFor(body)]),
    usage: { promptTokens: 2, completionTokens: 2 },
  });
  const first = sendProfileMessage({ text: "Первый ход, пример.", idempotencyKey: "lock-first" }, reply("Первый ход, пример."));
  await firstInLock;
  const second = sendProfileMessage({ text: "Второй ход, пример.", idempotencyKey: "lock-second" }, reply("Второй ход, пример."));
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(entries, 1, "the second commit must wait for the CreatorProfile row lock");
  releaseFirstCommit();
  await Promise.all([first, second]);
  assert.equal(entries, 2);

  const calls = await prisma.aiCall.findMany({ where: { kind: PROFILE_DIALOGUE_KIND } });
  const weights = calls
    .map((call) => parseV04ResultEnvelope(call.resultJson)?.event?.applyResult.systemWeight)
    .sort();
  assert.deepEqual(weights, [1, 2], "the later commit re-reads the journal written by the earlier one");

  const workspace = await getProfileWorkspace();
  assert.equal(workspace.portrait, null);
  assert.equal(workspace.draftPortrait, null);
  assert.ok(!workspace.dialogue.messages.some((item) => item.kind === "error"));
});

test("incomplete intake resume keeps the current question", async (t) => {
  const { prisma, url } = await withPostgresTestDb(t);
  process.env.DATABASE_URL = url;
  delete process.env.VOCAL_DAILY_TOKEN_LIMIT;
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });

  const {
    startProfileDialogue,
    skipProfileDialogue,
    sendProfileMessage,
    supplementProfileDialogue,
    getProfileWorkspace,
  } = await import("../src/lib/profile-dialogue");
  await startProfileDialogue();
  const afterFirst = await sendProfileMessage(
    { text: "Записываю, чтобы говорить своими словами.", idempotencyKey: "resume-1" },
    async () => ({
      text: v04NoChangeJson(),
      usage: { promptTokens: 2, completionTokens: 2 },
    }),
  );
  assert.ok(afterFirst.dialogue.messages.some((item) => item.body === "В портрет это не записываю."));
  await skipProfileDialogue();
  const resumedWithoutStart = await getProfileWorkspace();
  assert.equal(resumedWithoutStart.phase, "conversation");
  assert.ok(resumedWithoutStart.dialogue.messages.some((item) => item.body === "В портрет это не записываю."));
  const resumed = await startProfileDialogue();
  assert.equal(resumed.phase, "conversation");
  assert.ok(resumed.dialogue.messages.some((item) => item.body === "Записываю, чтобы говорить своими словами."));
  assert.ok(resumed.dialogue.messages.some((item) => item.body === "В портрет это не записываю."));
  assert.equal(resumed.dialogue.messages.filter((item) => item.body.includes("зачем вы хотите записывать")).length, 1);

  await sendProfileMessage(
    { text: "Для людей рядом.", idempotencyKey: "resume-2" },
    async () => {
      const user = await prisma.dialogueMessage.findFirst({
        where: { role: "user" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(user);
      return {
        text: v04ReplaceExplicitJson([user.id], "general_audience", "Люди рядом"),
        usage: { promptTokens: 2, completionTokens: 2 },
      };
    },
  );
  const portrait = await getProfileWorkspace();
  assert.equal(portrait.phase, "portrait");

  const amending = await supplementProfileDialogue();
  assert.ok(amending.dialogue.messages.some((item) => item.body.includes("Что изменить")));
  const afterClarify = await sendProfileMessage(
    { text: "хочу изменить аудиторию", idempotencyKey: "resume-aud" },
    async () => ({
      text: v04NoChangeJson(),
      usage: { promptTokens: 2, completionTokens: 2 },
    }),
  );
  assert.equal(afterClarify.phase, "conversation");
  await skipProfileDialogue();
  const continueAmend = await supplementProfileDialogue();
  assert.ok(continueAmend.dialogue.messages.some((item) => item.body.includes("Что изменить")));
  assert.equal(continueAmend.dialogue.messages.filter((item) => item.body === "На какую аудиторию заменить?").length, 0);
});

test("unresolved contradiction does not publish a portrait", async (t) => {
  const { prisma, url } = await withPostgresTestDb(t);
  process.env.DATABASE_URL = url;
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
    { text: "Хочу говорить для всех и ни для кого.", idempotencyKey: "contra-1" },
    async () => ({
      text: JSON.stringify({
        reply: "Цель и аудитория пока противоречат друг другу. Для кого это в первую очередь?",
        kind: "ready",
        complete: true,
        coveredKeys: ["whyRecord", "audience"],
        missingKeys: [],
        openQuestions: ["Цель и аудитория противоречат друг другу"],
        patch: {
          whyRecord: { text: "говорить для всех", usage: "understanding" },
          audience: { text: "ни для кого", usage: "understanding" },
        },
      }),
      usage: { promptTokens: 2, completionTokens: 2 },
    }),
  );
  assert.equal(after.phase, "conversation");
  assert.equal(after.portrait, null);
  assert.equal(after.draftPortrait, null);
  assert.notEqual(after.pending?.readyToConfirm, true);
});
