import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { AgentActionError } from "../src/lib/agent-action";
import { resetPrismaClient } from "../src/lib/db";
import { buildThoughtMaterialContext, sendDialogueMessage } from "../src/lib/dialogue";
import { createThoughtFromText } from "../src/lib/thought-create";
import { applyThoughtState, getThoughtState } from "../src/lib/thought-state";
import {
  FIXTURE_CRAFT_CATALOG,
  PRODUCTION_CRAFT_CATALOG,
  parseCraftCatalog,
  v07CraftSeam,
} from "../src/lib/v07-craft/catalog";
import { assertCraftNotAuthorEvidence } from "../src/lib/v07-craft/guard";
import { CRAFT_SELECT_LIMIT, selectCraftCards, selectCurrentOpenGap } from "../src/lib/v07-craft/select";
import { askQuestionJson, c00SignalFor, suggestTakeJson } from "./helpers/agent-action-json";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resetCraftSeam() {
  v07CraftSeam.enabled = null;
  v07CraftSeam.catalog = null;
}

async function thoughtWithGap(title: string, key: string, gapId = "gap_example") {
  const { reel } = await createThoughtFromText({
    title,
    body: `Исходник ${key}`,
    idempotencyKey: `${key}-create`,
  });
  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: 0,
    patch: {
      openGaps: [{ id: gapId, text: "Нужен конкретный пример", status: "open" }],
    },
  });
  return reel;
}

function snapshotOf(raw: string) {
  return JSON.parse(raw) as { craft?: { enabled: boolean; catalogVersion: string; cardIds: string[]; selectedGapId: string | null } };
}

test("production catalog is empty research; fixtures stay in their file", () => {
  assert.equal(PRODUCTION_CRAFT_CATALOG.version, "v07-1");
  assert.deepEqual(PRODUCTION_CRAFT_CATALOG.cards, []);
  assert.equal(FIXTURE_CRAFT_CATALOG.cards.every((card) => card.layer === "fixture"), true);
  assert.equal(FIXTURE_CRAFT_CATALOG.cards.some((card) => card.id === "craft_example_a"), true);
  const src = readFileSync(path.join(repoRoot, "src/lib/v07-craft/catalog.ts"), "utf8");
  const select = readFileSync(path.join(repoRoot, "src/lib/v07-craft/select.ts"), "utf8");
  const dialogue = readFileSync(path.join(repoRoot, "src/lib/dialogue.ts"), "utf8");
  assert.equal(src.includes("playbook"), false);
  assert.equal(select.includes("playbook"), false);
  assert.equal(dialogue.includes("@/lib/playbook"), false);
});

test("catalog rejects extra keys and mixed layers", () => {
  assert.throws(
    () => parseCraftCatalog({ version: "x", cards: [], extra: true }),
    /строгую проверку/,
  );
  assert.throws(
    () =>
      parseCraftCatalog(
        {
          version: "x",
          cards: [
            {
              id: "craft_bad",
              version: "1",
              layer: "fixture",
              applicableGapKey: "gap_example",
              contentModes: ["unspecified"],
              mechanism: "m",
              questionStrategy: "q",
              contraindications: [],
            },
          ],
        },
        "research",
      ),
    /слоя research/,
  );
});

test("selector uses the first open gap by id and does not invent a gap", () => {
  const later = { id: "gap_z", text: "позже", status: "open" as const };
  const earlier = { id: "gap_example", text: "пример", status: "open" as const };
  assert.equal(selectCurrentOpenGap([later, earlier])?.id, "gap_example");
  assert.equal(selectCurrentOpenGap([{ id: "gap_example", text: "x", status: "resolved" }]), null);
  const none = selectCraftCards({
    gaps: [],
    contentMode: "unspecified",
    catalog: FIXTURE_CRAFT_CATALOG,
  });
  assert.deepEqual(none, { selectedGapId: null, cards: [] });
});

test("selector matches open gap, skips closed/other/incompatible, caps at 4 in stable order", () => {
  const open = { id: "gap_example", text: "пример", status: "open" as const };
  const matched = selectCraftCards({
    gaps: [open],
    contentMode: "unspecified",
    catalog: FIXTURE_CRAFT_CATALOG,
  });
  assert.equal(matched.selectedGapId, "gap_example");
  assert.deepEqual(
    matched.cards.map((card) => card.id),
    ["craft_example_a", "craft_example_b", "craft_example_c", "craft_example_d"],
  );
  assert.equal(matched.cards.length, CRAFT_SELECT_LIMIT);
  assert.equal(matched.cards.some((card) => card.id === "craft_example_e"), false);
  assert.equal(matched.cards.some((card) => card.id === "craft_explain_only"), false);
  assert.equal(matched.cards.some((card) => card.id === "craft_other_gap"), false);

  const closed = selectCraftCards({
    gaps: [{ ...open, status: "resolved" }],
    contentMode: "unspecified",
    catalog: FIXTURE_CRAFT_CATALOG,
  });
  assert.deepEqual(closed.cards, []);
  assert.equal(closed.selectedGapId, null);

  const mode = selectCraftCards({
    gaps: [open],
    contentMode: "explanation",
    catalog: FIXTURE_CRAFT_CATALOG,
  });
  assert.deepEqual(
    mode.cards.map((card) => card.id),
    ["craft_explain_only"],
  );

  const incompatible = selectCraftCards({
    gaps: [open],
    contentMode: "observation",
    catalog: FIXTURE_CRAFT_CATALOG,
  });
  assert.deepEqual(incompatible.cards, []);
  assert.equal(incompatible.selectedGapId, "gap_example");
});

test("dialogue snapshot records craft; replay keeps the stored snapshot", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(resetCraftSeam);
  resetCraftSeam();
  v07CraftSeam.catalog = FIXTURE_CRAFT_CATALOG;

  const reel = await thoughtWithGap("V07 snap", "v07-snap");
  const page = await sendDialogueMessage(reel.id, { text: "уточни", idempotencyKey: "v07-snap-1" }, async () => ({
    text: askQuestionJson("Какой один случай вы произнесёте?", undefined, undefined),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  assert.ok(page.messages.some((row) => row.kind === "question"));
  const call = await prisma.aiCall.findFirstOrThrow({
    where: { reelId: reel.id, kind: "dialogue" },
    orderBy: { createdAt: "desc" },
  });
  const first = snapshotOf(call.inputSnapshotJson);
  assert.equal(first.craft?.enabled, true);
  assert.equal(first.craft?.catalogVersion, "v07-fixtures-1");
  assert.equal(first.craft?.selectedGapId, "gap_example");
  assert.deepEqual(first.craft?.cardIds, [
    "craft_example_a",
    "craft_example_b",
    "craft_example_c",
    "craft_example_d",
  ]);
  const prompt = await buildThoughtMaterialContext(reel.id);
  assert.match(prompt, /craft_example_a/);
  assert.equal(prompt.includes("playbook"), false);

  v07CraftSeam.catalog = PRODUCTION_CRAFT_CATALOG;
  await sendDialogueMessage(reel.id, { text: "уточни", idempotencyKey: "v07-snap-1" }, async () => {
    throw new Error("replay must not call the model");
  });
  const replay = await prisma.aiCall.findUniqueOrThrow({ where: { id: call.id } });
  assert.deepEqual(snapshotOf(replay.inputSnapshotJson).craft, first.craft);
});

test("empty catalog and disabled flag keep the ordinary dialogue path", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(resetCraftSeam);
  resetCraftSeam();

  const emptyReel = await thoughtWithGap("V07 empty", "v07-empty");
  await sendDialogueMessage(emptyReel.id, { text: "уточни", idempotencyKey: "v07-empty-1" }, async () => ({
    text: askQuestionJson("Что главное?"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const emptyCall = await prisma.aiCall.findFirstOrThrow({
    where: { reelId: emptyReel.id, kind: "dialogue" },
  });
  const emptySnap = snapshotOf(emptyCall.inputSnapshotJson);
  assert.equal(emptySnap.craft?.enabled, true);
  assert.deepEqual(emptySnap.craft?.cardIds, []);
  assert.equal(emptySnap.craft?.catalogVersion, "v07-1");
  const emptyPrompt = await buildThoughtMaterialContext(emptyReel.id);
  assert.equal(emptyPrompt.includes("Подсказки приёмов"), false);

  v07CraftSeam.enabled = false;
  v07CraftSeam.catalog = FIXTURE_CRAFT_CATALOG;
  const offReel = await thoughtWithGap("V07 off", "v07-off");
  await sendDialogueMessage(offReel.id, { text: "уточни", idempotencyKey: "v07-off-1" }, async () => ({
    text: askQuestionJson("Что главное?"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const offCall = await prisma.aiCall.findFirstOrThrow({ where: { reelId: offReel.id, kind: "dialogue" } });
  const offSnap = snapshotOf(offCall.inputSnapshotJson);
  assert.equal(offSnap.craft?.enabled, false);
  assert.deepEqual(offSnap.craft?.cardIds, []);
  const offPrompt = await buildThoughtMaterialContext(offReel.id);
  assert.equal(offPrompt.includes("craft_example_a"), false);
});

test("incompatible mode and closed gap snapshot to zero cards without creating a gap", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(resetCraftSeam);
  resetCraftSeam();
  v07CraftSeam.catalog = FIXTURE_CRAFT_CATALOG;

  const { reel } = await createThoughtFromText({
    title: "V07 no invent",
    body: "Исходник без подходящего пробела",
    idempotencyKey: "v07-nogap-create",
  });
  const before = await getThoughtState(reel.id);
  await sendDialogueMessage(reel.id, { text: "уточни", idempotencyKey: "v07-nogap-1" }, async () => ({
    text: askQuestionJson("Чего не хватает?"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const after = await getThoughtState(reel.id);
  assert.deepEqual(after.openGaps, before.openGaps);

  await applyThoughtState({
    reelId: reel.id,
    expectedRevision: after.revision,
    patch: {
      decisions: ["content_mode:observation"],
      openGaps: [{ id: "gap_example", text: "пример", status: "open" }],
    },
  });
  const page = await sendDialogueMessage(reel.id, { text: "ещё вопрос", idempotencyKey: "v07-mode-1" }, async () => ({
    text: askQuestionJson("Что вы наблюдали?"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  assert.ok(page.messages.some((row) => row.kind === "question"));
});

test("a craft card is not a fact, evidence, or C00 target", async (t) => {
  await withPostgresTestDb(t);
  await resetPrismaClient();
  t.after(resetCraftSeam);
  resetCraftSeam();
  v07CraftSeam.catalog = FIXTURE_CRAFT_CATALOG;

  const reel = await thoughtWithGap("V07 evidence", "v07-ev");
  const before = await getThoughtState(reel.id);
  await sendDialogueMessage(reel.id, { text: "уточни", idempotencyKey: "v07-ev-1" }, async () => ({
    text: askQuestionJson("Какой случай?"),
    usage: { promptTokens: 1, completionTokens: 1 },
  }));
  const afterAsk = await getThoughtState(reel.id);
  assert.deepEqual(afterAsk.facts, before.facts);
  assert.equal(afterAsk.openGaps.every((gap) => gap.status === "open"), true);

  await assert.rejects(
    () =>
      sendDialogueMessage(reel.id, { text: "снимай", idempotencyKey: "v07-ev-2" }, async () => ({
        text: suggestTakeJson("сказать случай", ["craft_example_a"]),
        usage: { promptTokens: 1, completionTokens: 1 },
      })),
    (error: unknown) => error instanceof AgentActionError && error.code === "CRAFT_NOT_EVIDENCE",
  );

  assert.throws(
    () =>
      assertCraftNotAuthorEvidence({
        catalog: FIXTURE_CRAFT_CATALOG,
        action: {
          action: "ask_question",
          question: "x",
          whyUnknown: "y",
          clarificationReason: "z",
        },
        thoughtUpdate: { fact: null, closeGapIds: ["craft_example_a"] },
        c00Signal: c00SignalFor("author_negation", "correct_thought", "msg", 1, {
          targetKind: "fact",
          targetId: "craft_example_a",
          operation: "clear_slot",
        }),
      }),
    (error: unknown) => error instanceof AgentActionError && error.code === "CRAFT_NOT_EVIDENCE",
  );
});
