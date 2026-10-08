import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { isC00PolicyEnabled } from "@/lib/c00-policy";
import { parseC00SignalCandidate, type C00SignalCandidate } from "@/lib/c00-signal";
import { parseThoughtStateLists } from "@/lib/thought-state";

export class AgentActionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AgentActionError";
  }
}

const askQuestionSchema = z
  .object({
    action: z.literal("ask_question"),
    question: z.string().trim().min(1),
    gapId: z.string().trim().min(1).optional(),
    clarificationReason: z.string().trim().min(1).optional(),
    whyUnknown: z.string().trim().min(1),
  })
  .strict();

const suggestTakeSchema = z
  .object({
    action: z.literal("suggest_take"),
    mainIdea: z.string().trim().min(1),
    takeTask: z.string().trim().min(1),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

const contentSufficientSchema = z
  .object({
    action: z.literal("content_sufficient"),
    checkedInTranscript: z.string().trim().min(1),
    whyNoGaps: z.string().trim().min(1),
  })
  .strict();

const redirectSchema = z
  .object({
    action: z.literal("redirect_to_task"),
    currentTask: z.string().trim().min(1),
  })
  .strict();

export const agentActionSchema = z.discriminatedUnion("action", [
  askQuestionSchema,
  suggestTakeSchema,
  contentSufficientSchema,
  redirectSchema,
]);

export const thoughtUpdateSchema = z
  .object({
    fact: z
      .object({
        text: z.string().trim().min(1),
        sourceType: z.literal("dialogue_message"),
        sourceId: z.string().trim().min(1),
      })
      .strict()
      .nullable(),
    closeGapIds: z.array(z.string().trim().min(1)),
    answeredGapId: z.string().trim().min(1).optional(),
  })
  .strict();

export type AgentAction = z.infer<typeof agentActionSchema>;
export type ThoughtUpdate = z.infer<typeof thoughtUpdateSchema>;

export const emptyThoughtUpdate = (): ThoughtUpdate => ({ fact: null, closeGapIds: [] });

/** Why a part of the model's thoughtUpdate was dropped instead of failing the turn. Counted per reply. */
export const DISCARD_REASONS = [
  "update_shape",
  "gap_without_fact",
  "several_gaps",
  "answered_gap_mismatch",
  "redirect_state",
  "fact_invalid",
  /** Counter only: the model named another message as the source; the server set the author's current message. */
  "fact_source_replaced",
  "redirect_invalid",
  /** The model returned a valid redirect_to_task; the server replaced it with the fixed return phrase and a neutral question. */
  "redirect_replaced",
  "question_repeat_regenerated",
  "question_repeat_replaced",
  "question_gap_detached",
  "downgrade_evidence",
  "downgrade_gap",
  "update_dropped_at_commit",
] as const;
export type DiscardReason = (typeof DISCARD_REASONS)[number];

/**
 * The server, not the model, owns where a fact comes from: sourceType and sourceId are set from the author's current
 * message and every other key is dropped. A fact is discarded only if its text is not a non-empty string or there
 * is no author message.
 */
export function normalizeFactForAuthorMessage(fact: unknown, authorMessageId: string | null): ThoughtUpdate["fact"] {
  if (!fact || typeof fact !== "object" || !authorMessageId) return null;
  const text = (fact as { text?: unknown }).text;
  if (typeof text !== "string" || !text.trim()) return null;
  return { text: text.trim(), sourceType: "dialogue_message", sourceId: authorMessageId };
}

export function parseAgentReply(raw: unknown, ctx?: { authorMessageId: string | null }): {
  action: AgentAction;
  thoughtUpdate: ThoughtUpdate;
  c00Signal: C00SignalCandidate | null;
  /** Dropped parts of the update. A valid question is never failed because of a bad update. */
  discarded: DiscardReason[];
} {
  if (!raw || typeof raw !== "object") {
    throw new AgentActionError("Модель вернула недопустимое действие.", "AGENT_ACTION_INVALID");
  }
  const { thoughtUpdate, c00Signal: signalRaw, ...actionRaw } = raw as Record<string, unknown>;
  // The model sometimes emits suggest_take evidenceRefs with ask_question.
  // That field has no meaning for a question; keep every other action field strict.
  if (actionRaw.action === "ask_question") delete actionRaw.evidenceRefs;
  const c00Signal = isC00PolicyEnabled() ? parseC00SignalCandidate(signalRaw) : null;
  const parsed = agentActionSchema.safeParse(actionRaw);
  if (!parsed.success) {
    throw new AgentActionError("Модель вернула недопустимое действие.", "AGENT_ACTION_INVALID");
  }
  if (parsed.data.action === "ask_question" && !parsed.data.gapId && !parsed.data.clarificationReason) {
    throw new AgentActionError("Нужен id пробела или причина уточнения.", "AGENT_ACTION_INVALID");
  }
  if (thoughtUpdate === undefined) {
    return { action: parsed.data, thoughtUpdate: emptyThoughtUpdate(), c00Signal, discarded: [] };
  }
  // The question is valid from here on. An invalid update is never applied, but it does not fail the turn:
  // the invalid part is dropped and counted. A gap is never closed without an accepted fact.
  const discarded: DiscardReason[] = [];
  let candidate: unknown = thoughtUpdate;
  if (ctx && thoughtUpdate && typeof thoughtUpdate === "object") {
    const rawUpdate = thoughtUpdate as Record<string, unknown>;
    if (rawUpdate.fact !== null && rawUpdate.fact !== undefined) {
      const fact = normalizeFactForAuthorMessage(rawUpdate.fact, ctx.authorMessageId);
      if (!fact) discarded.push("fact_invalid");
      else {
        const claimed = (rawUpdate.fact as { sourceId?: unknown }).sourceId;
        if (typeof claimed === "string" && claimed.trim() && claimed !== ctx.authorMessageId) discarded.push("fact_source_replaced");
      }
      candidate = { ...rawUpdate, fact };
    }
  }
  const update = thoughtUpdateSchema.safeParse(candidate);
  if (!update.success) {
    return { action: parsed.data, thoughtUpdate: emptyThoughtUpdate(), c00Signal, discarded: [...discarded, "update_shape"] };
  }
  let next: ThoughtUpdate = update.data;
  if (parsed.data.action === "redirect_to_task" && (next.fact || next.closeGapIds.length)) {
    return { action: parsed.data, thoughtUpdate: emptyThoughtUpdate(), c00Signal, discarded: ["redirect_state"] };
  }
  if (next.closeGapIds.length && !next.fact) {
    discarded.push("gap_without_fact");
    next = { fact: null, closeGapIds: [] };
  } else if (next.closeGapIds.length > 1) {
    discarded.push("several_gaps");
    next = { fact: next.fact, closeGapIds: [] };
  } else if (next.answeredGapId && next.closeGapIds[0] !== next.answeredGapId) {
    discarded.push("answered_gap_mismatch");
    next = { fact: next.fact, closeGapIds: [] };
  }
  return { action: parsed.data, thoughtUpdate: next, c00Signal, discarded };
}

export function parseAgentAction(raw: unknown): AgentAction {
  return parseAgentReply(raw).action;
}

export function hasProcessedWorkingTake(take: {
  inputType: string;
  selectedTranscriptId: string | null;
  selectedText?: string | null;
}) {
  const text = take.selectedText?.trim() ?? "";
  return (
    (take.inputType === "audio" || take.inputType === "video") &&
    Boolean(take.selectedTranscriptId) &&
    (take.selectedText === undefined || Boolean(text))
  );
}

export async function assertAgentActionAllowed(
  tx: Prisma.TransactionClient,
  reelId: string,
  action: AgentAction,
  take: { id?: string; inputType: string; selectedTranscriptId: string | null },
) {
  let selectedText: string | undefined;
  if (action.action === "content_sufficient" && take.selectedTranscriptId && take.id) {
    const revision = await tx.transcriptRevision.findFirst({
      where: { id: take.selectedTranscriptId, takeId: take.id },
      select: { text: true },
    });
    selectedText = revision?.text ?? "";
  }
  if (
    action.action === "content_sufficient" &&
    !hasProcessedWorkingTake({ ...take, selectedText: selectedText ?? "" })
  ) {
    throw new AgentActionError(
      "Достаточность можно объявить только после обработанного дубля.",
      "ACTION_NOT_ALLOWED",
    );
  }

  const state = await tx.thoughtState.findUnique({ where: { reelId } });
  const lists = state
    ? parseThoughtStateLists(state)
    : { facts: [] as { id: string }[], openGaps: [] as { id: string; status: string }[], decisions: [] as string[] };

  if (action.action === "ask_question" && action.gapId) {
    const gap = lists.openGaps.find((item) => item.id === action.gapId);
    if (!gap || gap.status !== "open") {
      throw new AgentActionError("Вопрос должен ссылаться на открытый пробел.", "ACTION_GAP");
    }
  }

  if (action.action === "suggest_take") {
    const factIds = new Set(lists.facts.map((fact) => fact.id));
    const missing = action.evidenceRefs.filter((id) => !factIds.has(id));
    if (missing.length) {
      throw new AgentActionError("Основания suggest_take должны быть фактами этой мысли.", "ACTION_EVIDENCE");
    }
  }
}

export function actionMessage(action: AgentAction): { kind: "question" | "text"; body: string } {
  if (action.action === "ask_question") return { kind: "question", body: action.question };
  if (action.action === "suggest_take") return { kind: "text", body: action.takeTask };
  if (action.action === "content_sufficient") return { kind: "text", body: action.whyNoGaps };
  return { kind: "text", body: action.currentTask };
}
