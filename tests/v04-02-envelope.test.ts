import assert from "node:assert/strict";
import { test } from "node:test";
import { parseV04ResultEnvelope, usedEvidenceIdsForSlot, v04ApplyWithoutSliceChange } from "../src/lib/v04-commit";
import { parseV04ModelReply } from "../src/lib/v04-action";

test("V04-02 journal uniqueness is per category-value slot", () => {
  const envelopes = [
    parseV04ResultEnvelope(
      JSON.stringify({
        schemaVersion: "v04-event-1",
        kind: "apply_update",
        event: {
          userMessageId: "u1",
          kind: "apply_update",
          operation: "add_observation",
          category: "concreteness",
          value: "high",
          evidenceMessageIds: ["msg_a"],
          confidence: 0.4,
          evidenceRole: "support",
          applyResult: {
            slotAdmitted: false,
            systemWeight: 0,
            displaySliceChanged: false,
            newRevisionId: null,
          },
        },
      }),
    ),
    parseV04ResultEnvelope(
      JSON.stringify({
        schemaVersion: "v04-event-1",
        kind: "apply_update",
        event: null,
        deferred: true,
      }),
    ),
    parseV04ResultEnvelope(
      JSON.stringify({
        schemaVersion: "v04-event-1",
        kind: "no_change",
        event: null,
      }),
    ),
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  assert.deepEqual(usedEvidenceIdsForSlot(envelopes, { category: "concreteness", value: "high" }), ["msg_a"]);
  assert.deepEqual(usedEvidenceIdsForSlot(envelopes, { category: "concreteness", value: "low" }), []);
});

test("V04-02 accepts only apply_update that cannot change the displayed slice", () => {
  const weak = parseV04ModelReply({
    kind: "apply_update",
    category: "concreteness",
    value: "high",
    scope: "global",
    evidenceType: "behavioral_observation",
    evidenceMessageIds: ["msg_1"],
    confidence: 0.4,
    operation: "add_observation",
  });
  assert.equal(weak.kind, "apply_update");
  if (weak.kind !== "apply_update") return;
  assert.equal(v04ApplyWithoutSliceChange(weak).deferred, false);

  const replace = parseV04ModelReply({
    kind: "apply_update",
    category: "blog_goal",
    value: "говорить своими словами",
    scope: "global",
    evidenceType: "explicit_statement",
    evidenceMessageIds: ["msg_1"],
    confidence: 0.9,
    operation: "replace_explicit",
  });
  assert.equal(replace.kind, "apply_update");
  if (replace.kind !== "apply_update") return;
  assert.equal(v04ApplyWithoutSliceChange(replace).deferred, true);
});
