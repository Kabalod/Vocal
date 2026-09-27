import type { Prisma, PrismaClient } from "@prisma/client";
import { listAcceptedC00Corrections, parseJsonValue } from "@/lib/c00-envelope";

type Db = PrismaClient | Prisma.TransactionClient;

export type DraftBindingSnapshot = {
  thoughtStateRevision?: number;
  workingTakeId?: string;
  selectedTranscriptId?: string;
};

export function isScriptDraftStale(input: {
  updatedAt: Date;
  bound: boolean;
  binding: DraftBindingSnapshot | null;
  thoughtRevision: number;
  workingTakeId: string | null;
  selectedTranscriptId: string | null;
  correctionAcceptedAt: Date[];
}): boolean {
  const laterCorrection = input.correctionAcceptedAt.some((at) => at.getTime() > input.updatedAt.getTime());
  if (input.bound && input.binding && input.binding.thoughtStateRevision != null) {
    if (input.thoughtRevision !== input.binding.thoughtStateRevision) return true;
    if (input.binding.workingTakeId != null && input.binding.workingTakeId !== input.workingTakeId) return true;
    if (
      input.binding.selectedTranscriptId != null &&
      input.binding.selectedTranscriptId !== input.selectedTranscriptId
    ) {
      return true;
    }
    return false;
  }
  if (input.bound) {
    const takeMismatch =
      (input.binding?.workingTakeId != null && input.binding.workingTakeId !== input.workingTakeId) ||
      (input.binding?.selectedTranscriptId != null &&
        input.binding.selectedTranscriptId !== input.selectedTranscriptId);
    return takeMismatch || laterCorrection;
  }
  return laterCorrection;
}

export function isOpenQuestionStale(input: {
  status: string;
  createdAt: Date;
  reviewTranscriptRevisionId: string | null | undefined;
  selectedTranscriptId: string | null;
  roundThoughtStateRevision: number | null;
  thoughtRevision: number;
  correctionAcceptedAt: Date[];
}): boolean {
  if (input.status !== "open") return false;
  if (input.roundThoughtStateRevision != null && input.roundThoughtStateRevision !== input.thoughtRevision) {
    return true;
  }
  if (
    input.reviewTranscriptRevisionId != null &&
    input.selectedTranscriptId != null &&
    input.reviewTranscriptRevisionId !== input.selectedTranscriptId
  ) {
    return true;
  }
  return input.correctionAcceptedAt.some((at) => at.getTime() > input.createdAt.getTime());
}

function snapshotFields(raw: string | null | undefined): DraftBindingSnapshot {
  const value = parseJsonValue(raw);
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  return {
    ...(typeof row.thoughtStateRevision === "number" ? { thoughtStateRevision: row.thoughtStateRevision } : {}),
    ...(typeof row.workingTakeId === "string" ? { workingTakeId: row.workingTakeId } : {}),
    ...(typeof row.selectedTranscriptId === "string" ? { selectedTranscriptId: row.selectedTranscriptId } : {}),
  };
}

export async function loadAcceptedCorrectionTimes(reelId: string, db: Db) {
  const rows = await db.aiCall.findMany({
    where: { reelId, kind: "dialogue", status: "done" },
    select: { id: true, resultJson: true },
  });
  return listAcceptedC00Corrections(rows).map((row) => row.acceptedAt);
}

export async function loadScriptDraftBinding(
  reelId: string,
  baseVersionId: string | null,
  db: Db,
): Promise<{ bound: boolean; binding: DraftBindingSnapshot | null }> {
  if (!baseVersionId) return { bound: false, binding: null };
  const version = await db.scriptVersion.findFirst({
    where: { id: baseVersionId, reelId },
    select: { id: true, inputSnapshotJson: true },
  });
  if (!version) return { bound: false, binding: null };
  const calls = await db.aiCall.findMany({
    where: { reelId, kind: "script" },
    select: { resultJson: true, inputSnapshotJson: true },
  });
  const spawn = calls.find((call) => {
    const result = parseJsonValue(call.resultJson);
    return Boolean(result && typeof result === "object" && (result as { proposalId?: string }).proposalId === version.id);
  });
  const binding = {
    ...snapshotFields(spawn?.inputSnapshotJson),
    ...snapshotFields(version.inputSnapshotJson),
  };
  return { bound: true, binding };
}

export async function scriptDraftIsStale(input: {
  reelId: string;
  updatedAt: Date;
  baseVersionId: string | null;
  db: Db;
}): Promise<boolean> {
  const thought = await input.db.thoughtState.findFirst({
    where: { reelId: input.reelId },
    select: { revision: true },
  });
  const reel = await input.db.reel.findFirst({
    where: { id: input.reelId },
    select: { workingTakeId: true },
  });
  const take = reel?.workingTakeId
    ? await input.db.take.findFirst({
        where: { id: reel.workingTakeId, reelId: input.reelId },
        select: { selectedTranscriptId: true },
      })
    : null;
  const { bound, binding } = await loadScriptDraftBinding(input.reelId, input.baseVersionId, input.db);
  const correctionAcceptedAt = await loadAcceptedCorrectionTimes(input.reelId, input.db);
  return isScriptDraftStale({
    updatedAt: input.updatedAt,
    bound,
    binding,
    thoughtRevision: thought?.revision ?? 0,
    workingTakeId: reel?.workingTakeId ?? null,
    selectedTranscriptId: take?.selectedTranscriptId ?? null,
    correctionAcceptedAt,
  });
}

export async function openQuestionIsStale(input: {
  reelId: string;
  status: string;
  createdAt: Date;
  reviewId: string | null;
  roundId: string;
  db: Db;
}): Promise<boolean> {
  const thought = await input.db.thoughtState.findFirst({
    where: { reelId: input.reelId },
    select: { revision: true },
  });
  const reel = await input.db.reel.findFirst({
    where: { id: input.reelId },
    select: { workingTakeId: true },
  });
  const take = reel?.workingTakeId
    ? await input.db.take.findFirst({
        where: { id: reel.workingTakeId, reelId: input.reelId },
        select: { selectedTranscriptId: true },
      })
    : null;
  const review = input.reviewId
    ? await input.db.review.findFirst({
        where: { id: input.reviewId, reelId: input.reelId },
        select: { transcriptRevisionId: true },
      })
    : null;
  const round = await input.db.aiCall.findFirst({
    where: { id: input.roundId, reelId: input.reelId },
    select: { inputSnapshotJson: true },
  });
  const snap = snapshotFields(round?.inputSnapshotJson);
  const correctionAcceptedAt = await loadAcceptedCorrectionTimes(input.reelId, input.db);
  return isOpenQuestionStale({
    status: input.status,
    createdAt: input.createdAt,
    reviewTranscriptRevisionId: review?.transcriptRevisionId,
    selectedTranscriptId: take?.selectedTranscriptId ?? null,
    roundThoughtStateRevision: snap.thoughtStateRevision ?? null,
    thoughtRevision: thought?.revision ?? 0,
    correctionAcceptedAt,
  });
}
