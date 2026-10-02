import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { normalizeReelStatus } from "@/types/reel";
import { syncThoughtStateWorkingTake } from "@/lib/thought-state";

export const V06_AUTO_WORK_KIND = "v06_auto_work";

function autoWorkTurnKey(takeId: string) {
  return `v06-auto-work:${takeId}`;
}

function parsePredecessor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { predecessorWorkingTakeId?: string | null };
    const id = parsed.predecessorWorkingTakeId;
    return typeof id === "string" && id.trim() ? id : null;
  } catch {
    return null;
  }
}

export async function recordAutoWorkingTakeCas(
  tx: Prisma.TransactionClient,
  input: { reelId: string; takeId: string; inputType: string; predecessorWorkingTakeId: string | null },
) {
  if (input.inputType !== "audio" && input.inputType !== "video") return;
  const turnKey = autoWorkTurnKey(input.takeId);
  const existing = await tx.aiCall.findUnique({ where: { turnKey } });
  if (existing) return;
  await tx.aiCall.create({
    data: {
      kind: V06_AUTO_WORK_KIND,
      reelId: input.reelId,
      takeId: input.takeId,
      model: "none",
      status: "queued",
      ownerUserId: ownerUserId(),
      turnKey,
      promptText: ".",
      inputSnapshotJson: JSON.stringify({
        takeId: input.takeId,
        predecessorWorkingTakeId: input.predecessorWorkingTakeId,
      }),
    },
  });
}

export async function supersedeAutoWorkingTakeCas(
  tx: Prisma.TransactionClient,
  reelId: string,
) {
  await tx.aiCall.updateMany({
    where: { reelId, kind: V06_AUTO_WORK_KIND, status: "queued" },
    data: { status: "error", errorMessage: "working_take_manual" },
  });
}

export async function selectedRevisionText(
  db: Prisma.TransactionClient | typeof prisma,
  take: { id: string; selectedTranscriptId: string | null },
): Promise<string> {
  if (!take.selectedTranscriptId) return "";
  const revision = await db.transcriptRevision.findFirst({
    where: { id: take.selectedTranscriptId, takeId: take.id },
    select: { text: true },
  });
  return revision?.text.trim() ?? "";
}

export async function assertCompletedFinalRevisionFrozen(
  db: Prisma.TransactionClient | typeof prisma,
  takeId: string,
) {
  const take = await db.take.findFirst({
    where: { id: takeId },
    select: { id: true, reelId: true },
  });
  if (!take) return;
  const reel = await db.reel.findFirst({
    where: { id: take.reelId },
    select: { status: true, finalTakeId: true },
  });
  if (!reel) return;
  if (normalizeReelStatus(reel.status) === "completed" && reel.finalTakeId === takeId) {
    const { ReelError } = await import("@/lib/reels");
    throw new ReelError("Сначала верните мысль в работу, чтобы сменить итог.", "NEED_REOPEN", 409);
  }
}

export async function maybePromoteWorkingTakeFromSelectedTranscript(takeId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const take = await tx.take.findFirst({
      where: { id: takeId },
      select: {
        id: true,
        reelId: true,
        inputType: true,
        selectedTranscriptId: true,
        reel: { select: { ownerUserId: true, status: true, workingTakeId: true, finalTakeId: true } },
      },
    });
    if (!take) return false;
    if (take.inputType !== "audio" && take.inputType !== "video") return false;
    const text = await selectedRevisionText(tx, take);
    if (!text) return false;
    if (take.reel.workingTakeId === take.id) return false;

    const cas = await tx.aiCall.findUnique({ where: { turnKey: autoWorkTurnKey(take.id) } });
    if (!cas || cas.status !== "queued") return false;
    if (normalizeReelStatus(take.reel.status) === "completed") {
      await tx.aiCall.update({
        where: { id: cas.id },
        data: { status: "done", resultJson: JSON.stringify({ promoted: false, reason: "completed" }) },
      });
      return false;
    }
    const expected = parsePredecessor(cas.inputSnapshotJson);

    const updated = await tx.reel.updateMany({
      where: {
        id: take.reelId,
        ownerUserId: take.reel.ownerUserId,
        status: { not: "completed" },
        workingTakeId: expected,
      },
      data: { workingTakeId: take.id },
    });
    await tx.aiCall.update({
      where: { id: cas.id },
      data: { status: "done", resultJson: JSON.stringify({ promoted: updated.count === 1 }) },
    });
    if (updated.count !== 1) return false;
    await syncThoughtStateWorkingTake(tx, {
      reelId: take.reelId,
      ownerUserId: take.reel.ownerUserId,
      workingTakeId: take.id,
    });
    return true;
  });
}
