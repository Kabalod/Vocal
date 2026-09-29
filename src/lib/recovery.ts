import { prisma } from "@/lib/db";
import { JOB_LEASE_MS } from "@/lib/jobs";

export { studioShouldSilentRefetch } from "@/lib/recovery-client";

export const STALE_PROCESSING_MS = JOB_LEASE_MS;

export const STALE_PROCESSING_USER_MESSAGE =
  "Ответ прервался. Обновите экран и отправьте сообщение снова.";

export async function failStaleProcessingMessages(threadId: string, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_PROCESSING_MS);
  const result = await prisma.dialogueMessage.updateMany({
    where: {
      threadId,
      status: "pending",
      kind: "processing",
      createdAt: { lte: cutoff },
    },
    data: {
      kind: "error",
      status: "error",
      body: STALE_PROCESSING_USER_MESSAGE,
    },
  });
  return result.count;
}
