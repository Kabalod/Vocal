import assert from "node:assert/strict";
import { test } from "node:test";
import {
  V04ActionError,
  assertApplyUpdateCompatible,
  assertEvidenceIdsNewForSlot,
  assertProfileDialogueEvidence,
  parseV04ModelReply,
} from "../src/lib/v04-action";

function applyUpdate(overrides: Record<string, unknown> = {}) {
  return {
    kind: "apply_update",
    category: "blog_goal",
    value: "говорить своими словами",
    scope: "global",
    evidenceType: "explicit_statement",
    evidenceMessageIds: ["msg_1"],
    confidence: 0.9,
    operation: "replace_explicit",
    ...overrides,
  };
}

test("V04-01 rejects extra fields and foreign-kind fields", () => {
  assert.throws(
    () => parseV04ModelReply({ ...applyUpdate(), extra: true }),
    (err: unknown) => err instanceof V04ActionError && err.code === "V04_SHAPE",
  );
  assert.throws(
    () => parseV04ModelReply({ kind: "no_change", reasonCode: "refusal", category: "blog_goal" }),
    (err: unknown) => err instanceof V04ActionError && err.code === "V04_SHAPE",
  );
  assert.throws(
    () => parseV04ModelReply({ kind: "thought_specific", reasonCode: "thought_detail", value: "эпизод" }),
    (err: unknown) => err instanceof V04ActionError && err.code === "V04_SHAPE",
  );
});

test("V04-01 accepts no_change and thought_specific without an event-shaped payload", () => {
  const noChange = parseV04ModelReply({ kind: "no_change", reasonCode: "praise_or_support" });
  assert.equal(noChange.kind, "no_change");
  const specific = parseV04ModelReply({
    kind: "thought_specific",
    reasonCode: "reel_episode",
    auditUserMessageId: "msg_audit",
  });
  assert.equal(specific.kind, "thought_specific");
});

test("V04-01 rejects confidence outside [0, 1] and unknown category", () => {
  assert.throws(() => parseV04ModelReply(applyUpdate({ confidence: 1.2 })), V04ActionError);
  assert.throws(() => parseV04ModelReply(applyUpdate({ confidence: Number.NaN })), V04ActionError);
  assert.throws(() => parseV04ModelReply(applyUpdate({ category: "author_type" })), V04ActionError);
});

test("V04-01 rejects duplicate evidence ids in one candidate", () => {
  assert.throws(
    () => parseV04ModelReply(applyUpdate({ evidenceMessageIds: ["msg_1", "msg_1"] })),
    (err: unknown) => err instanceof V04ActionError && err.code === "V04_EVIDENCE_DUP",
  );
});

test("V04-01 rejects incompatible apply_update transitions", () => {
  const derived = parseV04ModelReply(
    applyUpdate({
      category: "concreteness",
      value: "high",
      evidenceType: "behavioral_observation",
      operation: "replace_explicit",
    }),
  );
  assert.ok(derived.kind === "apply_update");
  assert.throws(
    () => assertApplyUpdateCompatible(derived, { slotExists: false }),
    (err: unknown) => err instanceof V04ActionError && err.code === "V04_TRANSITION",
  );
  const directBehavioral = parseV04ModelReply(
    applyUpdate({ evidenceType: "behavioral_observation", operation: "add_observation" }),
  );
  assert.ok(directBehavioral.kind === "apply_update");
  assert.throws(() => assertApplyUpdateCompatible(directBehavioral, { slotExists: false }), V04ActionError);
});

test("V04-01 rejects assistant, thought-thread, and already used evidence", () => {
  const ids = ["msg_1"];
  assert.equal(
    (() => {
      try {
        assertProfileDialogueEvidence(ids, [
          {
            id: "msg_1",
            role: "assistant",
            ownerUserId: "owner",
            threadScope: "profile",
            profileId: "profile",
          },
        ], { ownerUserId: "owner", profileId: "profile" });
        return null;
      } catch (err) {
        return err instanceof V04ActionError ? err.code : null;
      }
    })(),
    "V04_EVIDENCE_ROLE",
  );
  assert.throws(
    () =>
      assertProfileDialogueEvidence(
        ids,
        [
          {
            id: "msg_1",
            role: "user",
            ownerUserId: "owner",
            threadScope: "reel",
            profileId: null,
          },
        ],
        { ownerUserId: "owner", profileId: "profile" },
      ),
    (err: unknown) => err instanceof V04ActionError && err.code === "V04_EVIDENCE_THREAD",
  );
  assert.throws(
    () => assertEvidenceIdsNewForSlot(["msg_1"], ["msg_1"]),
    (err: unknown) => err instanceof V04ActionError && err.code === "V04_EVIDENCE_USED",
  );
});

test("V04-01 accepts a compatible replace_explicit candidate", () => {
  const action = parseV04ModelReply(applyUpdate({ value: "  говорить своими словами  " }));
  assert.equal(action.kind, "apply_update");
  if (action.kind !== "apply_update") return;
  assert.equal(action.value, "говорить своими словами");
  assertApplyUpdateCompatible(action, { slotExists: false });
});
