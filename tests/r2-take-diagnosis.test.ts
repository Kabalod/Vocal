import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

test("R2: parse and merge keep the diagnosis inside the closed type list", async () => {
  const { parseTakeDiagnosis, mergeDiagnosisGaps, DIAGNOSIS_MAX_GAPS } = await import("../src/lib/take-diagnosis");
  assert.equal(parseTakeDiagnosis("не json"), null);
  assert.equal(parseTakeDiagnosis(JSON.stringify({ contentMode: "x", gaps: [] })), null);
  assert.equal(parseTakeDiagnosis(JSON.stringify({ contentMode: "unspecified", gaps: [{ kind: "no_ending", text: "x" }] })), null);
  assert.equal(parseTakeDiagnosis(JSON.stringify({ contentMode: "unspecified", gaps: [], extra: 1 })), null);

  const many = parseTakeDiagnosis(
    JSON.stringify({
      contentMode: "personal_story",
      gaps: [
        { kind: "no_episode", text: "а" },
        { kind: "no_episode", text: "дубль типа" },
        { kind: "no_thesis", text: "б" },
        { kind: "no_mechanism", text: "в" },
        { kind: "no_boundary", text: "г" },
      ],
    }),
  );
  assert.ok(many);
  assert.equal(many.gaps.length, DIAGNOSIS_MAX_GAPS);
  assert.deepEqual(many.gaps.map((gap) => gap.kind), ["no_episode", "no_thesis", "no_mechanism"]);

  const merged = mergeDiagnosisGaps(
    [
      { id: "old", text: "старый без типа", status: "open" },
      { id: "gap_no_episode", text: "закрыт автором", status: "resolved", kind: "no_episode" },
    ],
    many,
  );
  assert.equal(merged.find((gap) => gap.kind === "no_episode")?.status, "resolved", "a resolved gap is not reopened");
  assert.equal(merged.filter((gap) => gap.kind === "no_episode").length, 1);
  assert.ok(merged.some((gap) => gap.id === "old"), "an untyped gap is kept");
  assert.equal(merged.length, 4);
});

test("R2: one gateway call per base writes typed gaps and content mode; no cuid reaches the model", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createReel, createTake } = await import("../src/lib/reels");
  const { ensureOriginalFromText } = await import("../src/lib/transcripts");
  const { getThoughtState, ensureThoughtState } = await import("../src/lib/thought-state");
  const { diagnoseLatestTake, diagnosisMarker } = await import("../src/lib/take-diagnosis");
  const { ownerUserId } = await import("../src/lib/auth/session");

  const reel = await createReel({ title: "Диагностика" });
  await prisma.$transaction((tx) => ensureThoughtState(tx, { reelId: reel.id, ownerUserId: ownerUserId() }));
  const empty = await diagnoseLatestTake(reel.id);
  assert.deepEqual(empty, { status: "skipped", reason: "no_base" });

  const take = await createTake(reel.id, { inputType: "text", bodyText: "Я вчера снова не дописал отчёт и разозлился." });
  await ensureOriginalFromText(take.id, take.bodyText);
  const base = await prisma.scriptVersion.findFirstOrThrow({ where: { reelId: reel.id, kind: "from_take" } });

  const prompts: string[] = [];
  const complete = async (args: { system: string; user: string }) => {
    prompts.push(`${args.system}\n${args.user}`);
    return {
      text: JSON.stringify({
        contentMode: "personal_story",
        gaps: [
          { kind: "no_episode", text: "Нет одного конкретного случая." },
          { kind: "no_thesis", text: "Не видна позиция автора." },
        ],
      }),
      usage: { promptTokens: 10, completionTokens: 10 },
    };
  };
  const first = await diagnoseLatestTake(reel.id, complete as never);
  assert.deepEqual(first, { status: "applied", added: 2, contentMode: "personal_story" });
  const state = await getThoughtState(reel.id);
  assert.deepEqual(state.openGaps.map((gap) => [gap.id, gap.kind, gap.status]), [
    ["gap_no_episode", "no_episode", "open"],
    ["gap_no_thesis", "no_thesis", "open"],
  ]);
  assert.ok(state.decisions.includes("content_mode:personal_story"));
  assert.ok(state.decisions.includes(diagnosisMarker(base.id)));
  assert.equal(prompts.some((text) => text.includes(base.id) || text.includes(reel.id) || text.includes(take.id)), false);
  assert.equal(await prisma.aiCall.count({ where: { reelId: reel.id, kind: "take-diagnosis" } }), 1, "accounted by the gateway");

  const again = await diagnoseLatestTake(reel.id, complete as never);
  assert.deepEqual(again, { status: "skipped", reason: "already_diagnosed" });
  assert.equal(prompts.length, 1, "the second call does not reach the model");
});

test("R2: a broken model answer never throws and leaves the state untouched", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createReel, createTake } = await import("../src/lib/reels");
  const { ensureOriginalFromText } = await import("../src/lib/transcripts");
  const { getThoughtState, ensureThoughtState } = await import("../src/lib/thought-state");
  const { diagnoseLatestTake } = await import("../src/lib/take-diagnosis");
  const { ownerUserId } = await import("../src/lib/auth/session");

  const reel = await createReel({ title: "Сбой" });
  await prisma.$transaction((tx) => ensureThoughtState(tx, { reelId: reel.id, ownerUserId: ownerUserId() }));
  const take = await createTake(reel.id, { inputType: "text", bodyText: "Текст дубля." });
  await ensureOriginalFromText(take.id, take.bodyText);

  const garbage = async () => ({ text: "это не JSON", usage: { promptTokens: 1, completionTokens: 1 } });
  assert.deepEqual(await diagnoseLatestTake(reel.id, garbage as never), { status: "failed" });
  const thrower = async () => {
    throw new Error("модель недоступна");
  };
  assert.deepEqual(await diagnoseLatestTake(reel.id, thrower as never), { status: "failed" });
  const state = await getThoughtState(reel.id);
  assert.equal(state.openGaps.length, 0);
  assert.equal(state.decisions.some((item) => item.startsWith("diagnosed:")), false, "a failed pass can be retried");
});

test("R2: the dialogue turn diagnoses the take first, and a failed diagnosis does not stop the reply", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    delete process.env.VOCAL_TAKE_DIAGNOSIS;
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  process.env.VOCAL_TAKE_DIAGNOSIS = "1";
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { getThoughtState } = await import("../src/lib/thought-state");
  const { askQuestionJson } = await import("./helpers/agent-action-json");

  const ok = await createThoughtFromText({ title: "Диалог", body: "Я вчера не дописал отчёт.", idempotencyKey: "r2-d-create" });
  const labels: string[] = [];
  const complete = async (args: { label?: string }) => {
    labels.push(args.label ?? "chat");
    if (args.label === "take-diagnosis") {
      return {
        text: JSON.stringify({ contentMode: "personal_story", gaps: [{ kind: "no_mechanism", text: "Не сказано, почему так." }] }),
        usage: { promptTokens: 1, completionTokens: 1 },
      };
    }
    return { text: askQuestionJson("Почему так вышло?"), usage: { promptTokens: 1, completionTokens: 1 } };
  };
  const page = await sendDialogueMessage(ok.reel.id, { text: "уточни", idempotencyKey: "r2-d-1" }, complete as never);
  assert.ok(page.messages.some((row) => row.kind === "question"));
  assert.equal(labels.filter((item) => item === "take-diagnosis").length, 1);
  const state = await getThoughtState(ok.reel.id);
  assert.deepEqual(state.openGaps.map((gap) => gap.kind), ["no_mechanism"]);

  await sendDialogueMessage(ok.reel.id, { text: "уточни ещё", idempotencyKey: "r2-d-2" }, complete as never);
  assert.equal(labels.filter((item) => item === "take-diagnosis").length, 1, "diagnosed once per base");

  const failing = await createThoughtFromText({ title: "Сбой диагностики", body: "Другой дубль.", idempotencyKey: "r2-d-create-2" });
  const broken = async (args: { label?: string }) => {
    if (args.label === "take-diagnosis") throw new Error("диагностика упала");
    return { text: askQuestionJson("Что здесь главное?"), usage: { promptTokens: 1, completionTokens: 1 } };
  };
  const reply = await sendDialogueMessage(failing.reel.id, { text: "уточни", idempotencyKey: "r2-d-3" }, broken as never);
  assert.ok(reply.messages.some((row) => row.kind === "question"), "the dialogue works without a diagnosis");
  assert.equal((await getThoughtState(failing.reel.id)).openGaps.length, 0);
});
