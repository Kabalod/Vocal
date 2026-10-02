import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { normalizeReelStatus } from "@/types/reel";
import { syncThoughtStateWorkingTake } from "@/lib/thought-state";

export const V06_AUTO_WORK_KIND = "v06_auto_work";

export const v06TestSeams = {
  beforeAutoPromoteLock: null as (() => Promise<void>) | null,
  afterAutoPromoteLocked: null as (() => Promise<void>) | null,
  beforeWorkingPointerLock: null as (() => Promise<void>) | null,
  afterWorkingPointerLocked: null as (() => Promise<void>) | null,
  beforeRevisionWriteLock: null as (() => Promise<void>) | null,
  afterRevisionWriteLocked: null as (() => Promise<void>) | null,
  beforeCompleteLock: null as (() => Promise<void>) | null,
  afterCompleteLocked: null as (() => Promise<void>) | null,
};

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

function parsePromoted(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { promoted?: boolean };
    return parsed.promoted === true;
  } catch {
    return false;
  }
}

async function runSeam(seam: (() => Promise<void>) | null) {
  if (seam) await seam();
}

export async function lockVocalReel(tx: Prisma.TransactionClient, reelId: string) {
  const owner = ownerUserId();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Reel" WHERE id = ${reelId} AND "ownerUserId" = ${owner} FOR UPDATE
  `;
  return rows[0] ?? null;
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

export async function supersedeAutoWorkingTakeCas(tx: Prisma.TransactionClient, reelId: string) {
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

export async function readStrictFinalThoughtText(
  db: Prisma.TransactionClient | typeof prisma,
  input: { reelId: string; finalTakeId: string | null | undefined },
): Promise<string> {
  if (!input.finalTakeId) return "";
  const take = await db.take.findFirst({
    where: { id: input.finalTakeId, reelId: input.reelId },
    select: { id: true, selectedTranscriptId: true },
  });
  if (!take) return "";
  return selectedRevisionText(db, take);
}

export async function assertCompletedFinalRevisionFrozen(tx: Prisma.TransactionClient, takeId: string) {
  const take = await tx.take.findFirst({
    where: { id: takeId },
    select: { id: true, reelId: true },
  });
  if (!take) return;
  const locked = await lockVocalReel(tx, take.reelId);
  if (!locked) return;
  const reel = await tx.reel.findFirst({
    where: { id: take.reelId },
    select: { status: true, finalTakeId: true },
  });
  if (!reel) return;
  if (normalizeReelStatus(reel.status) === "completed" && reel.finalTakeId === takeId) {
    const { ReelError } = await import("@/lib/reels");
    throw new ReelError("Сначала верните мысль в работу, чтобы сменить итог.", "NEED_REOPEN", 409);
  }
}

async function finishAutoCas(
  tx: Prisma.TransactionClient,
  casId: string,
  payload: { promoted: boolean; reason?: string },
) {
  await tx.aiCall.update({
    where: { id: casId },
    data: { status: "done", resultJson: JSON.stringify(payload) },
  });
}

export async function promoteWorkingTakeInTx(tx: Prisma.TransactionClient, takeId: string): Promise<boolean> {
  const take = await tx.take.findFirst({
    where: { id: takeId },
    select: {
      id: true,
      reelId: true,
      number: true,
      inputType: true,
      selectedTranscriptId: true,
    },
  });
  if (!take) return false;
  if (take.inputType !== "audio" && take.inputType !== "video") return false;
  const reel = await tx.reel.findFirst({
    where: { id: take.reelId, ownerUserId: ownerUserId() },
    select: { ownerUserId: true, status: true, workingTakeId: true },
  });
  if (!reel) return false;
  const cas = await tx.aiCall.findUnique({ where: { turnKey: autoWorkTurnKey(take.id) } });
  if (!cas || cas.status !== "queued") return false;
  if (normalizeReelStatus(reel.status) === "completed") {
    await finishAutoCas(tx, cas.id, { promoted: false, reason: "completed" });
    return false;
  }
  const text = await selectedRevisionText(tx, take);
  if (!text) return false;
  if (reel.workingTakeId === take.id) {
    await finishAutoCas(tx, cas.id, { promoted: false, reason: "already" });
    return false;
  }

  const predecessor = parsePredecessor(cas.inputSnapshotJson);
  let allow = reel.workingTakeId === predecessor;
  if (!allow && reel.workingTakeId) {
    const current = await tx.take.findFirst({
      where: { id: reel.workingTakeId, reelId: take.reelId },
      select: { id: true, number: true },
    });
    const currentCas = current
      ? await tx.aiCall.findUnique({ where: { turnKey: autoWorkTurnKey(current.id) } })
      : null;
    const currentAuto = Boolean(currentCas && currentCas.status === "done" && parsePromoted(currentCas.resultJson));
    if (current && currentAuto && current.number < take.number) allow = true;
  }
  if (!allow) {
    await finishAutoCas(tx, cas.id, { promoted: false, reason: "blocked" });
    return false;
  }

  const updated = await tx.reel.updateMany({
    where: {
      id: take.reelId,
      ownerUserId: reel.ownerUserId,
      status: { not: "completed" },
    },
    data: { workingTakeId: take.id },
  });
  await finishAutoCas(tx, cas.id, { promoted: updated.count === 1 });
  if (updated.count !== 1) return false;
  await syncThoughtStateWorkingTake(tx, {
    reelId: take.reelId,
    ownerUserId: reel.ownerUserId,
    workingTakeId: take.id,
  });
  return true;
}

export async function maybePromoteWorkingTakeFromSelectedTranscript(takeId: string): Promise<boolean> {
  const peek = await prisma.take.findFirst({
    where: { id: takeId },
    select: { reelId: true, inputType: true },
  });
  if (!peek) return false;
  if (peek.inputType !== "audio" && peek.inputType !== "video") return false;
  await runSeam(v06TestSeams.beforeAutoPromoteLock);
  return prisma.$transaction(async (tx) => {
    const locked = await lockVocalReel(tx, peek.reelId);
    if (!locked) return false;
    await runSeam(v06TestSeams.afterAutoPromoteLocked);
    return promoteWorkingTakeInTx(tx, takeId);
  });
}

export async function selectOriginalIfUnsetInTx(
  tx: Prisma.TransactionClient,
  input: { takeId: string; originalId: string; originalText: string },
): Promise<"selected" | "kept" | "frozen"> {
  const take = await tx.take.findFirst({
    where: { id: input.takeId },
    select: { id: true, reelId: true, selectedTranscriptId: true, bodyText: true },
  });
  if (!take) return "kept";
  const reel = await tx.reel.findFirst({
    where: { id: take.reelId },
    select: { status: true, finalTakeId: true },
  });
  if (!reel) return "kept";
  if (normalizeReelStatus(reel.status) === "completed" && reel.finalTakeId === take.id) {
    return "frozen";
  }
  if (take.selectedTranscriptId) return "kept";
  await tx.take.update({
    where: { id: take.id },
    data: { selectedTranscriptId: input.originalId, bodyText: take.bodyText || input.originalText },
  });
  return "selected";
}
