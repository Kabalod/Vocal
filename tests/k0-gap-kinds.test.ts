import assert from "node:assert/strict";
import { test } from "node:test";
import { GAP_KINDS, isGapKind, parseGaps, ThoughtStateError } from "../src/lib/thought-state";
import { parseCraftCatalog } from "../src/lib/v07-craft/catalog";
import { selectCraftCards } from "../src/lib/v07-craft/select";

function card(id: string, gap: string) {
  return {
    id: `craft_${id}`,
    version: "1",
    layer: "fixture" as const,
    applicableGapKey: gap,
    contentModes: ["unspecified" as const],
    mechanism: "m",
    questionStrategy: "q",
    contraindications: [],
  };
}

test("K0: the gap type list is closed and has no ending function", () => {
  assert.ok(GAP_KINDS.length >= 6 && GAP_KINDS.length <= 12);
  assert.equal(isGapKind("no_episode"), true);
  assert.equal(isGapKind("no_ending"), false);
  assert.equal(isGapKind("gap_example"), false);
});

test("K0: parseGaps keeps a valid type, accepts no type, rejects an unknown type", () => {
  const parsed = parseGaps([
    { id: "a", text: "нет случая", status: "open", kind: "no_episode" },
    { id: "b", text: "старый пробел", status: "open" },
  ]);
  assert.equal(parsed[0].kind, "no_episode");
  assert.equal("kind" in parsed[1], false);
  assert.throws(
    () => parseGaps([{ id: "c", text: "x", status: "open", kind: "invented" }]),
    (error: unknown) => error instanceof ThoughtStateError && error.code === "THOUGHT_STATE_GAP_KIND",
  );
});

test("K0: a card matches by gap type, not by the free-form gap id", () => {
  const catalog = parseCraftCatalog({ version: "t", cards: [card("by_kind", "no_episode"), card("by_id", "g-77")] }, "fixture");
  const typed = selectCraftCards({
    gaps: [{ id: "g-77", text: "нет случая", status: "open", kind: "no_episode" }],
    contentMode: "unspecified",
    catalog,
  });
  assert.deepEqual(typed.cards.map((item) => item.id), ["craft_by_kind"], "the id is ignored when the gap has a type");

  const untyped = selectCraftCards({
    gaps: [{ id: "g-77", text: "старый", status: "open" }],
    contentMode: "unspecified",
    catalog,
  });
  assert.deepEqual(untyped.cards.map((item) => item.id), ["craft_by_id"], "an untyped gap keeps the id fallback");
});
