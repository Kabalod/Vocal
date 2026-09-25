import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { ReelError } from "@/lib/reels";
import { StateVersionError } from "@/lib/ai/usage-guard";
import { v01TestSeams } from "@/lib/v01-test-seams";
import type { Prisma } from "@prisma/client";
import { actionMessage, assertAgentActionAllowed, type AgentAction } from "@/lib/agent-action";

export type DialogueMaterialSnapshot = {
  workingTakeId: string;
  transcriptRevisionId: string | null;
  reelUpdatedAt: string;
  thoughtStateRevision: number;
  dialogueVersion: {
    threadId: string;
    messageCount: number;
    lastMessageId: string | null;
    headEpoch: number;
  };
};

export async function requireWorkingTake(reelId: string) {
  const reel = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
    select: {
      id: true,
      title: true,
      workingTakeId: true,
      selectedScriptId: true,
      updatedAt: true,
      finalTakeId: true,
    },
  });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  if (!reel.workingTakeId) {
    throw new ReelError("Нужен явный рабочий дубль.", "WORKING_TAKE_REQUIRED", 409);
  }
  const take = await prisma.take.findFirst({
    where: { id: reel.workingTakeId, reelId },
  });
  if (!take) {
    throw new ReelError("Рабочий дубль должен принадлежать этой карточке.", "TAKE_NOT_IN_REEL");
  }
  return { reel, take };
}

export async function readDialogueVersion(threadId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const [thread, messageCount, last] = await Promise.all([
    db.dialogueThread.findUnique({ where: { id: threadId }, select: { headEpoch: true } }),
    db.dialogueMessage.count({ where: { threadId } }),
    db.dialogueMessage.findFirst({
      where: { threadId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    }),
  ]);
  if (!thread) {
    throw new ReelError("Диалог не найден.", "REEL_NOT_FOUND", 404);
  }
  return {
    threadId,
    messageCount,
    lastMessageId: last?.id ?? null,
    headEpoch: thread.headEpoch,
  };
}

export function snapshotFromLoaded(
  reel: { updatedAt: Date },
  take: { id: string; selectedTranscriptId: string | null },
  dialogueVersion: DialogueMaterialSnapshot["dialogueVersion"],
  thoughtStateRevision: number,
): DialogueMaterialSnapshot {
  return {
    workingTakeId: take.id,
    transcriptRevisionId: take.selectedTranscriptId,
    reelUpdatedAt: reel.updatedAt.toISOString(),
    thoughtStateRevision,
    dialogueVersion,
  };
}

export function materialSnapshotChanged(
  current: DialogueMaterialSnapshot,
  snapshot: DialogueMaterialSnapshot,
): boolean {
  return (
    current.workingTakeId !== snapshot.workingTakeId ||
    current.transcriptRevisionId !== snapshot.transcriptRevisionId ||
    current.reelUpdatedAt !== snapshot.reelUpdatedAt ||
    current.dialogueVersion.threadId !== snapshot.dialogueVersion.threadId ||
    current.dialogueVersion.messageCount !== snapshot.dialogueVersion.messageCount ||
    current.dialogueVersion.lastMessageId !== snapshot.dialogueVersion.lastMessageId ||
    current.dialogueVersion.headEpoch !== snapshot.dialogueVersion.headEpoch ||
    current.thoughtStateRevision !== snapshot.thoughtStateRevision
  );
}

export async function readMaterialSnapshot(
  reelId: string,
  threadId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<DialogueMaterialSnapshot> {
  const reel = await db.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
    select: { id: true, workingTakeId: true, updatedAt: true },
  });
  if (!reel?.workingTakeId) {
    throw new ReelError("Нужен явный рабочий дубль.", "WORKING_TAKE_REQUIRED", 409);
  }
  const take = await db.take.findFirst({
    where: { id: reel.workingTakeId, reelId },
    select: { id: true, selectedTranscriptId: true },
  });
  if (!take) {
    throw new ReelError("Рабочий дубль должен принадлежать этой карточке.", "TAKE_NOT_IN_REEL");
  }
  const thought = await db.thoughtState.findFirst({
    where: { reelId, reel: { ownerUserId: ownerUserId() } },
    select: { revision: true },
  });
  if (!thought) {
    throw new ReelError("Состояние мысли не найдено.", "THOUGHT_STATE_NOT_FOUND", 404);
  }
  return snapshotFromLoaded(reel, take, await readDialogueVersion(threadId, db), thought.revision);
}

export async function commitDialogueReply(input: {
  reelId: string;
  threadId: string;
  snapshot: DialogueMaterialSnapshot;
  callId: string;
  processingId: string;
  action: AgentAction;
  rawText: string;
  promptTokens: number | null;
  completionTokens: number | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "DialogueThread" WHERE id = ${input.threadId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Reel" WHERE id = ${input.reelId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Take" WHERE id = ${input.snapshot.workingTakeId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ThoughtState" WHERE "reelId" = ${input.reelId} FOR UPDATE`;

    const matches = async () => {
      const current = await readMaterialSnapshot(input.reelId, input.threadId, tx);
      return !materialSnapshotChanged(current, input.snapshot);
    };

    if (!(await matches())) throw new StateVersionError();
    if (v01TestSeams.afterMaterialCheck) await v01TestSeams.afterMaterialCheck();
    if (!(await matches())) throw new StateVersionError();
    if (v01TestSeams.afterLastMaterialCheck) await v01TestSeams.afterLastMaterialCheck();

    const take = await tx.take.findFirst({
      where: { id: input.snapshot.workingTakeId, reelId: input.reelId },
      select: { inputType: true, selectedTranscriptId: true },
    });
    if (!take) throw new ReelError("Рабочий дубль должен принадлежать этой карточке.", "TAKE_NOT_IN_REEL");
    await assertAgentActionAllowed(tx, input.reelId, input.action, take);

    const message = actionMessage(input.action);
    await tx.aiCall.update({
      where: { id: input.callId },
      data: {
        status: "done",
        responseText: input.rawText,
        resultJson: JSON.stringify(input.action),
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
      },
    });
    await tx.dialogueMessage.update({
      where: { id: input.processingId },
      data: {
        kind: message.kind,
        body: message.body,
        payloadJson: JSON.stringify({ action: input.action }),
        status: "done",
      },
    });
  });
}
