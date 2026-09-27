import type { C00Correction, C00Decision } from "@/lib/c00-envelope";
import { C00EnvelopeError } from "@/lib/c00-signal";
import type { C00SignalCandidate } from "@/lib/c00-signal";
import type { ThoughtFact, ThoughtGap, ThoughtStatePatch } from "@/lib/thought-state";
import type { ThoughtUpdate } from "@/lib/agent-action";

export type ResolvedC00Correction = {
  decision: C00Decision;
  correction: Omit<C00Correction, "acceptedAt" | "afterThoughtRevision"> & {
    afterThoughtRevision: number;
  };
  patch: ThoughtStatePatch;
};

function defaultOperation(signalType: C00Decision["signalType"], hasReplacement: boolean) {
  if (signalType === "author_negation" || signalType === "wrong_speaker") return "clear_slot" as const;
  if (hasReplacement) return "supersede" as const;
  return "clear_slot" as const;
}

export function resolveC00Correction(input: {
  decision: C00Decision;
  candidate: C00SignalCandidate | null;
  facts: ThoughtFact[];
  openGaps: ThoughtGap[];
  thoughtUpdate: ThoughtUpdate;
  currentUserMessageId: string;
  priorDecisionIdOnTarget?: string | null;
  acceptedAt: string;
}): ResolvedC00Correction | null {
  if (input.decision.action !== "correct_thought") return null;
  if (input.decision.evidenceUserMessageIds.length !== 1) return null;
  if (input.decision.evidenceUserMessageIds[0] !== input.currentUserMessageId) return null;
  const targetKind = input.candidate?.targetKind ?? "fact";
  const replacement = input.thoughtUpdate.fact?.text.trim() ?? "";
  const operation = input.candidate?.operation ?? defaultOperation(input.decision.signalType, Boolean(replacement));
  const targetId =
    input.candidate?.targetId ??
    (targetKind === "fact" && input.facts.length === 1 ? input.facts[0]?.id : undefined);
  if (!targetId) return null;

  const before = input.decision.thoughtStateRevisionSeen;
  const patch: ThoughtStatePatch = {};
  if (targetKind === "fact") {
    const current = input.facts.find((fact) => fact.id === targetId);
    if (!current) return null;
    if (operation === "clear_slot") {
      patch.facts = input.facts.filter((fact) => fact.id !== targetId);
    } else if (operation === "supersede") {
      if (!replacement) return null;
      const claimedSource = input.thoughtUpdate.fact?.sourceId;
      if (claimedSource && claimedSource !== input.currentUserMessageId) {
        throw new C00EnvelopeError(
          "Источник новой версии факта должен быть текущим сообщением автора этой мысли.",
          "C00_EVIDENCE",
          403,
        );
      }
      patch.facts = input.facts.map((fact) =>
        fact.id === targetId
          ? {
              ...fact,
              text: replacement,
              sourceType: "dialogue_message",
              sourceId: input.currentUserMessageId,
            }
          : fact,
      );
    } else {
      return null;
    }
  } else {
    const current = input.openGaps.find((gap) => gap.id === targetId);
    if (!current) return null;
    if (operation === "reopen") {
      patch.openGaps = input.openGaps.map((gap) => (gap.id === targetId ? { ...gap, status: "open" as const } : gap));
    } else if (operation === "clear_slot") {
      patch.openGaps = input.openGaps.map((gap) =>
        gap.id === targetId ? { ...gap, status: "resolved" as const } : gap,
      );
    } else if (operation === "supersede" && replacement) {
      patch.openGaps = input.openGaps.map((gap) => (gap.id === targetId ? { ...gap, text: replacement } : gap));
    } else {
      return null;
    }
  }

  const decision: C00Decision = {
    ...input.decision,
    applyResult: "applied",
    ...(input.priorDecisionIdOnTarget && input.decision.signalType === "contradictory_correction"
      ? { contradictsDecisionId: input.priorDecisionIdOnTarget }
      : {}),
  };
  return {
    decision,
    patch,
    correction: {
      correctionId: `cor:${input.decision.decisionId}`,
      decisionId: input.decision.decisionId,
      targetKind,
      targetId,
      operation,
      beforeThoughtRevision: before,
      afterThoughtRevision: before + 1,
      replacedBecause: input.decision.reasonCode,
    },
  };
}

export function withAcceptedAt(
  resolved: ResolvedC00Correction,
  acceptedAt: string,
): { decision: C00Decision; correction: C00Correction; patch: ThoughtStatePatch } {
  return {
    decision: resolved.decision,
    patch: resolved.patch,
    correction: { ...resolved.correction, acceptedAt },
  };
}
