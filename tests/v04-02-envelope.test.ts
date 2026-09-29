import assert from "node:assert/strict";
import { test } from "node:test";
import { parseV04ResultEnvelope, usedEvidenceIdsForSlot } from "../src/lib/v04-commit";

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
