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

export function askQuestionJson(question: string) {
  return JSON.stringify({
    action: "ask_question",
    question,
    clarificationReason: "нужно уточнение задачи",
    whyUnknown: "в материале этой мысли ответа ещё нет",
  });
}
