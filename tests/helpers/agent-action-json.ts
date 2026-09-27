import type { PrismaClient } from "@prisma/client";
import type { C00SignalCandidate } from "../../src/lib/c00-signal";

export async function insertTestScriptProposal(prisma: PrismaClient, threadId: string, body: string) {
  return prisma.dialogueMessage.create({
    data: {
      threadId,
      role: "assistant",
      kind: "script_proposal",
      body,
      payloadJson: JSON.stringify({ script: body, transferred: false }),
      status: "done",
    },
  });
}

export function suggestTakeJson(
  takeTask: string,
  evidenceRefs: string[],
  thoughtUpdate?: {
    fact: { text: string; sourceType: "dialogue_message"; sourceId: string } | null;
    closeGapIds: string[];
  },
  c00Signal?: C00SignalCandidate,
  mainIdea = "главная идея",
) {
  return JSON.stringify({
    action: "suggest_take",
    mainIdea,
    takeTask,
    evidenceRefs,
    ...(thoughtUpdate
      ? {
          thoughtUpdate: {
            fact: thoughtUpdate.fact,
            closeGapIds: thoughtUpdate.closeGapIds,
          },
        }
      : {}),
    ...(c00Signal ? { c00Signal } : {}),
  });
}

export function askQuestionJson(
  question: string,
  thoughtUpdate?: {
    fact: { text: string; sourceType: "dialogue_message"; sourceId: string } | null;
    closeGapIds: string[];
    answeredGapId?: string;
  },
  c00Signal?: C00SignalCandidate,
) {
  return JSON.stringify({
    action: "ask_question",
    question,
    clarificationReason: "нужно уточнение задачи",
    whyUnknown: "в материале этой мысли ответа ещё нет",
    ...(thoughtUpdate
      ? {
          thoughtUpdate: {
            fact: thoughtUpdate.fact,
            closeGapIds: thoughtUpdate.closeGapIds,
            ...(thoughtUpdate.answeredGapId ? { answeredGapId: thoughtUpdate.answeredGapId } : {}),
          },
        }
      : {}),
    ...(c00Signal ? { c00Signal } : {}),
  });
}

export function c00SignalFor(
  signalType: C00SignalCandidate["signalType"],
  proposedAction: C00SignalCandidate["proposedAction"],
  evidenceUserMessageId: string,
  thoughtStateRevisionSeen: number,
  extras: Partial<Pick<C00SignalCandidate, "targetKind" | "targetId" | "operation">> = {},
): C00SignalCandidate {
  return {
    signalType,
    proposedAction,
    evidenceUserMessageIds: [evidenceUserMessageId],
    thoughtStateRevisionSeen,
    reasonCode: signalType,
    ...extras,
  };
}

export async function thoughtUpdateForUserText(
  prisma: PrismaClient,
  reelId: string,
  text: string,
  closeGapIds: string[] = [],
) {
  const thread = await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId } });
  const user = await prisma.dialogueMessage.findFirstOrThrow({
    where: { threadId: thread.id, role: "user", body: text },
    orderBy: { createdAt: "desc" },
  });
  return {
    fact: { text, sourceType: "dialogue_message" as const, sourceId: user.id },
    closeGapIds,
    factId: `fact_${user.id}`,
    userMessageId: user.id,
  };
}
