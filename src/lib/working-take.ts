import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { ReelError } from "@/lib/reels";

export type DialogueMaterialSnapshot = {
  workingTakeId: string;
  transcriptRevisionId: string | null;
  reelUpdatedAt: string;
  dialogueVersion: {
    threadId: string;
    messageCount: number;
    lastMessageId: string | null;
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

export async function captureDialogueMaterial(
  reelId: string,
  threadId: string,
): Promise<DialogueMaterialSnapshot> {
  const { reel, take } = await requireWorkingTake(reelId);
  const [messageCount, last] = await Promise.all([
    prisma.dialogueMessage.count({ where: { threadId } }),
    prisma.dialogueMessage.findFirst({
      where: { threadId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    }),
  ]);
  return {
    workingTakeId: take.id,
    transcriptRevisionId: take.selectedTranscriptId,
    reelUpdatedAt: reel.updatedAt.toISOString(),
    dialogueVersion: {
      threadId,
      messageCount,
      lastMessageId: last?.id ?? null,
    },
  };
}

export async function dialogueMaterialChanged(
  reelId: string,
  threadId: string,
  snapshot: DialogueMaterialSnapshot,
): Promise<boolean> {
  const current = await captureDialogueMaterial(reelId, threadId);
  return (
    current.workingTakeId !== snapshot.workingTakeId ||
    current.transcriptRevisionId !== snapshot.transcriptRevisionId ||
    current.reelUpdatedAt !== snapshot.reelUpdatedAt ||
    current.dialogueVersion.threadId !== snapshot.dialogueVersion.threadId ||
    current.dialogueVersion.messageCount !== snapshot.dialogueVersion.messageCount ||
    current.dialogueVersion.lastMessageId !== snapshot.dialogueVersion.lastMessageId
  );
}
