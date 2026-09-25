import type { PrismaClient } from "@prisma/client";

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

export function askQuestionJson(
  question: string,
  thoughtUpdate?: {
    fact: { text: string; sourceType: "dialogue_message"; sourceId: string } | null;
    closeGapIds: string[];
    answeredGapId?: string;
  },
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
  });
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
