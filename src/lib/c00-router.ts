import type { C00Decision } from "@/lib/c00-envelope";
import { C00EnvelopeError } from "@/lib/c00-signal";
import { StateVersionError } from "@/lib/ai/usage-guard";
import type { C00DecisionAction, C00SignalCandidate, C00SignalType } from "@/lib/c00-signal";

type SignalPolicy = {
  actions: readonly C00DecisionAction[];
  scope: "thought" | "none";
  applyThoughtUpdate: boolean;
};

const SIGNAL_POLICY: Record<Exclude<C00SignalType, "stale_model" | "foreign_user">, SignalPolicy> = {
  wrong_speaker: { actions: ["correct_thought"], scope: "thought", applyThoughtUpdate: false },
  author_negation: { actions: ["correct_thought"], scope: "thought", applyThoughtUpdate: false },
  local_correction: { actions: ["correct_thought"], scope: "thought", applyThoughtUpdate: false },
  repeated_correction: { actions: ["correct_thought"], scope: "thought", applyThoughtUpdate: false },
  contradictory_correction: { actions: ["correct_thought"], scope: "thought", applyThoughtUpdate: false },
  quote_not_position: { actions: ["keep_local", "discard"], scope: "thought", applyThoughtUpdate: false },
  mood_or_once: { actions: ["keep_local", "discard"], scope: "none", applyThoughtUpdate: false },
  praise_diagnosis_label: { actions: ["discard"], scope: "none", applyThoughtUpdate: false },
  thought_episode: { actions: ["keep_local"], scope: "thought", applyThoughtUpdate: true },
  prompt_injection: { actions: ["discard"], scope: "none", applyThoughtUpdate: false },
};

export type C00RouteResult = {
  decision: C00Decision | null;
  applyThoughtUpdate: boolean;
};

/** C00-02: queued correct_thought must not reach the V03 ThoughtState reducer. */
export function allowsThoughtStatePatch(decision: C00Decision | null, policyAllows: boolean): boolean {
  if (decision?.action === "correct_thought" && decision.applyResult === "not_applied") {
    return false;
  }
  return policyAllows;
}

export function routeC00Decision(input: {
  candidate: C00SignalCandidate | null;
  ownerUserId: string;
  callOwnerUserId: string;
  currentUserMessageId: string;
  thoughtStateRevision: number;
  callId: string;
}): C00RouteResult {
  if (!input.candidate) return { decision: null, applyThoughtUpdate: true };
  if (input.ownerUserId !== input.callOwnerUserId || input.candidate.signalType === "foreign_user") {
    throw new C00EnvelopeError("Чужой владелец не пишет решение мысли.", "C00_FOREIGN_USER", 403);
  }
  if (input.candidate.signalType === "stale_model") {
    throw new StateVersionError();
  }
  if (input.candidate.thoughtStateRevisionSeen !== input.thoughtStateRevision) {
    throw new StateVersionError();
  }
  const evidence = input.candidate.evidenceUserMessageIds;
  if (evidence.length !== 1 || evidence[0] !== input.currentUserMessageId) {
    throw new C00EnvelopeError("Источник сигнала должен быть текущим сообщением автора этой мысли.", "C00_EVIDENCE", 403);
  }
  const policy = SIGNAL_POLICY[input.candidate.signalType];
  const action = policy.actions.includes(input.candidate.proposedAction)
    ? input.candidate.proposedAction
    : policy.actions[0];
  const decision: C00Decision = {
    decisionId: `dec:${input.callId}`,
    action,
    signalType: input.candidate.signalType,
    scope: policy.scope,
    evidenceUserMessageIds: [input.currentUserMessageId],
    thoughtStateRevisionSeen: input.thoughtStateRevision,
    reasonCode: input.candidate.signalType,
    applyResult: "not_applied",
  };
  return {
    applyThoughtUpdate: allowsThoughtStatePatch(decision, policy.applyThoughtUpdate),
    decision,
  };
}
