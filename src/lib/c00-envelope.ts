import { z } from "zod";
import { agentActionSchema, type AgentAction } from "@/lib/agent-action";

export const C00_ENVELOPE_SCHEMA = "c00-envelope-1" as const;

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

export type C00Envelope = {
  schemaVersion: typeof C00_ENVELOPE_SCHEMA;
  aiCallId: string;
  turnKey: string;
  ownerUserId: string;
  reelId: string;
  action: AgentAction;
  decision: null;
  correction: null;
};

const envelopeSchema = z
  .object({
    schemaVersion: z.literal(C00_ENVELOPE_SCHEMA),
    aiCallId: z.string().trim().min(1),
    turnKey: z.string().trim().min(1),
    ownerUserId: z.string().trim().min(1),
    reelId: z.string().trim().min(1),
    action: agentActionSchema,
    decision: z.null(),
    correction: z.null(),
  })
  .strict();

export function parseJsonValue(raw: string | null | undefined): unknown {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function parseC00Envelope(raw: string | null | undefined): C00Envelope | null {
  const value = parseJsonValue(raw);
  const parsed = envelopeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isC00Envelope(raw: string | null | undefined): boolean {
  return parseC00Envelope(raw) !== null;
}

/** Old V03 rows store the action object only. Not a C00 journal event. */
export function readThoughtAction(raw: string | null | undefined): AgentAction | null {
  const envelope = parseC00Envelope(raw);
  if (envelope) return envelope.action;
  const value = parseJsonValue(raw);
  const action = agentActionSchema.safeParse(value);
  return action.success ? action.data : null;
}

export function listC00Envelopes(rows: Array<{ resultJson: string | null }>): C00Envelope[] {
  return rows.map((row) => parseC00Envelope(row.resultJson)).filter((row): row is C00Envelope => row !== null);
}

export function buildC00Envelope(input: {
  aiCallId: string;
  turnKey: string;
  ownerUserId: string;
  reelId: string;
  action: AgentAction;
}): C00Envelope {
  return {
    schemaVersion: C00_ENVELOPE_SCHEMA,
    aiCallId: input.aiCallId,
    turnKey: input.turnKey,
    ownerUserId: input.ownerUserId,
    reelId: input.reelId,
    action: input.action,
    decision: null,
    correction: null,
  };
}

export function thoughtDialogueTurnKey(threadId: string, idempotencyKey: string) {
  return `dialogue:${threadId}:${idempotencyKey}`;
}

export function assertEnvelopeMatchesCall(
  envelope: C00Envelope,
  call: { id: string; turnKey: string | null; ownerUserId: string; reelId: string | null },
) {
  if (
    envelope.aiCallId !== call.id ||
    envelope.turnKey !== call.turnKey ||
    envelope.ownerUserId !== call.ownerUserId ||
    envelope.reelId !== call.reelId
  ) {
    throw new C00EnvelopeError("Конверт не совпадает с вызовом хода.", "C00_ENVELOPE_MISMATCH");
  }
}
