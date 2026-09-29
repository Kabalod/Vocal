import assert from "node:assert/strict";
import { test } from "node:test";
import { replayV04Slice, sliceEqual } from "../src/lib/v04-slice";
import type { V04JournalEvent } from "../src/lib/v04-slice";

function observation(id: string, value = "high"): V04JournalEvent {
  return {
    operation: "add_observation",
    category: "concreteness",
    value,
    evidenceMessageIds: [id],
    confidence: 0.9,
    evidenceRole: "support",
  };
}

test("V04-03 admits a derived slot at weight 3 and keeps a weaker slice unchanged", () => {
  const weak: V04JournalEvent = { ...observation("a"), confidence: 0.4 };
  const afterWeak = replayV04Slice({ events: [weak], previous: {} });
  assert.equal(afterWeak.slice.concreteness, undefined);
  assert.equal(afterWeak.slotOf("concreteness", "high").systemWeight, 0);
  assert.equal(afterWeak.slotOf("concreteness", "high").slotAdmitted, false);

  const one = replayV04Slice({ events: [observation("a")], previous: {} });
  assert.equal(one.slice.concreteness, undefined);
  assert.equal(one.slotOf("concreteness", "high").systemWeight, 1);

  const three = replayV04Slice({
    events: [observation("a"), observation("b"), observation("c")],
    previous: {},
  });
  assert.equal(three.slice.concreteness, "high");
  assert.equal(three.slotOf("concreteness", "high").systemWeight, 3);
  assert.equal(three.slotOf("concreteness", "high").slotAdmitted, true);
});

test("V04-03 counts two replace_explicit ids of the same direct value", () => {
  const events: V04JournalEvent[] = [
    {
      operation: "replace_explicit",
      category: "blog_goal",
      value: "говорить своими словами",
      evidenceMessageIds: ["d1"],
      confidence: 0.9,
      evidenceRole: "support",
    },
    {
      operation: "replace_explicit",
      category: "blog_goal",
      value: "говорить своими словами",
      evidenceMessageIds: ["d2"],
      confidence: 0.9,
      evidenceRole: "support",
    },
  ];
  const replayed = replayV04Slice({ events, previous: {} });
  assert.equal(replayed.slice.blog_goal, "говорить своими словами");
  assert.equal(replayed.slotOf("blog_goal", "говорить своими словами").systemWeight, 2);
});

test("V04-03 keeps the current derived value on equal admitted weights", () => {
  const events: V04JournalEvent[] = [
    observation("a1", "high"),
    observation("a2", "high"),
    observation("a3", "high"),
    observation("b1", "low"),
    observation("b2", "low"),
    observation("b3", "low"),
  ];
  const replayed = replayV04Slice({ events, previous: { concreteness: "high" } });
  assert.equal(replayed.slice.concreteness, "high");
  assert.equal(sliceEqual(replayed.slice, { concreteness: "high" }), true);
});
