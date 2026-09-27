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

export function parseAgentReply(raw: unknown): {
  action: AgentAction;
  thoughtUpdate: ThoughtUpdate;
  c00Signal: C00SignalCandidate | null;
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
    return { action: parsed.data, thoughtUpdate: emptyThoughtUpdate(), c00Signal };
  }
  const update = thoughtUpdateSchema.safeParse(thoughtUpdate);
  if (!update.success) {
    throw new AgentActionError("Модель вернула недопустимое обновление состояния.", "AGENT_ACTION_INVALID");
  }
  if (update.data.closeGapIds.length && !update.data.fact) {
    throw new AgentActionError("Нельзя закрыть пробел без принятого факта.", "ACTION_GAP");
  }
  if (parsed.data.action === "redirect_to_task" && (update.data.fact || update.data.closeGapIds.length)) {
    throw new AgentActionError("redirect_to_task не меняет состояние мысли.", "ACTION_REDIRECT_STATE");
  }
  if (update.data.closeGapIds.length > 1) {
    throw new AgentActionError("Одним ответом можно закрыть только один пробел.", "ACTION_GAP");
  }
  if (update.data.answeredGapId && update.data.closeGapIds[0] !== update.data.answeredGapId) {
    throw new AgentActionError("answeredGapId должен совпадать с закрываемым пробелом.", "ACTION_GAP");
  }
  if (update.data.answeredGapId && !update.data.closeGapIds.length) {
    throw new AgentActionError("answeredGapId без закрытия пробела недопустим.", "ACTION_GAP");
  }
  return { action: parsed.data, thoughtUpdate: update.data, c00Signal };
}

export function parseAgentAction(raw: unknown): AgentAction {
  return parseAgentReply(raw).action;
}

export function hasProcessedWorkingTake(take: { inputType: string; selectedTranscriptId: string | null }) {
  return (take.inputType === "audio" || take.inputType === "video") && Boolean(take.selectedTranscriptId);
}

export async function assertAgentActionAllowed(
  tx: Prisma.TransactionClient,
  reelId: string,
  action: AgentAction,
  take: { inputType: string; selectedTranscriptId: string | null },
) {
  if (action.action === "content_sufficient" && !hasProcessedWorkingTake(take)) {
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
