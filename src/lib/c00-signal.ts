import { z } from "zod";

export class C00EnvelopeError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "C00EnvelopeError";
  }
}

export const C00_SIGNAL_TYPES = [
  "wrong_speaker",
  "author_negation",
  "quote_not_position",
  "local_correction",
  "repeated_correction",
  "contradictory_correction",
  "mood_or_once",
  "praise_diagnosis_label",
  "thought_episode",
  "prompt_injection",
  "stale_model",
  "foreign_user",
] as const;

export const C00_DECISION_ACTIONS = ["correct_thought", "keep_local", "discard"] as const;

export type C00SignalType = (typeof C00_SIGNAL_TYPES)[number];
export type C00DecisionAction = (typeof C00_DECISION_ACTIONS)[number];

export type C00SignalCandidate = {
  signalType: C00SignalType;
  proposedAction: C00DecisionAction;
  evidenceUserMessageIds: string[];
  thoughtStateRevisionSeen: number;
  reasonCode: C00SignalType;
  targetKind?: "fact" | "gap";
  targetId?: string;
  operation?: "supersede" | "reopen" | "clear_slot";
};

const candidateSchema = z
  .object({
    signalType: z.enum(C00_SIGNAL_TYPES),
    proposedAction: z.enum(C00_DECISION_ACTIONS),
    evidenceUserMessageIds: z.array(z.string().trim().min(1)).min(1),
    thoughtStateRevisionSeen: z.number().int().nonnegative(),
    reasonCode: z.enum(C00_SIGNAL_TYPES).optional(),
    targetKind: z.enum(["fact", "gap"]).optional(),
    targetId: z.string().trim().min(1).optional(),
    operation: z.enum(["supersede", "reopen", "clear_slot"]).optional(),
  })
  .strict();

export function parseC00SignalCandidate(raw: unknown): C00SignalCandidate | null {
  if (raw === undefined || raw === null) return null;
  const parsed = candidateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new C00EnvelopeError("Кандидат сигнала C00 недопустим.", "C00_SIGNAL_INVALID");
  }
  return {
    signalType: parsed.data.signalType,
    proposedAction: parsed.data.proposedAction,
    evidenceUserMessageIds: parsed.data.evidenceUserMessageIds,
    thoughtStateRevisionSeen: parsed.data.thoughtStateRevisionSeen,
    reasonCode: parsed.data.reasonCode ?? parsed.data.signalType,
    ...(parsed.data.targetKind ? { targetKind: parsed.data.targetKind } : {}),
    ...(parsed.data.targetId ? { targetId: parsed.data.targetId } : {}),
    ...(parsed.data.operation ? { operation: parsed.data.operation } : {}),
  };
}
