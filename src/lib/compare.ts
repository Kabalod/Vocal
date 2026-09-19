import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { ReelError } from "@/lib/reels";
import { diffTexts, type TextDiffDto } from "@/lib/text-diff";
import { COMPARE_INTENT_MAX, type CompareDto, type SemanticCompareResult } from "@/types/compare";

export class CompareError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "CompareError";
  }
}

function parseDiff(raw: string): TextDiffDto {
  try {
    const parsed = JSON.parse(raw) as Partial<TextDiffDto>;
    if (!parsed || !Array.isArray(parsed.chunks)) return diffTexts("", "");
    return {
      ...diffTexts("", ""),
      ...parsed,
      chunks: parsed.chunks,
      truncated: Boolean(parsed.truncated),
      note: typeof parsed.note === "string" ? parsed.note : diffTexts("", "").note,
    };
  } catch {
    return diffTexts("", "");
  }
}

function parseSemantic(raw: string | null): SemanticCompareResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SemanticCompareResult;
  } catch {
    return null;
  }
}

function toDto(row: {
  id: string;
  reelId: string;
  leftTakeId: string;
  rightTakeId: string;
  leftTranscriptId: string;
  rightTranscriptId: string;
  intent: string;
  textDiffJson: string;
  resultJson: string | null;
  status: string;
  errorMessage: string | null;
  model: string | null;
  promptVersion: string | null;
  createdAt: Date;
}): CompareDto {
  return {
    id: row.id,
    reelId: row.reelId,
    leftTakeId: row.leftTakeId,
    rightTakeId: row.rightTakeId,
    leftTranscriptId: row.leftTranscriptId,
    rightTranscriptId: row.rightTranscriptId,
    intent: row.intent,
    textDiff: parseDiff(row.textDiffJson),
    semantic: row.status === "done" ? parseSemantic(row.resultJson) : null,
    status: row.status === "error" ? "error" : "done",
    errorMessage: row.errorMessage,
    model: row.model,
    promptVersion: row.promptVersion,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function resolveCompareSides(
  reelId: string,
  input: {
    leftTakeId: string;
    rightTakeId: string;
    leftTranscriptId?: string | null;
    rightTranscriptId?: string | null;
  },
) {
  const reel = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
  });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  if (input.leftTakeId === input.rightTakeId) {
    throw new CompareError("Выберите два разных дубля одной карточки.", "SAME_TAKE");
  }

  const leftTake = await prisma.take.findFirst({ where: { id: input.leftTakeId, reelId } });
  const rightTake = await prisma.take.findFirst({ where: { id: input.rightTakeId, reelId } });
  if (!leftTake || !rightTake) {
    throw new CompareError("Оба дубля должны принадлежать этой карточке.", "TAKE_NOT_IN_REEL");
  }

  async function revision(takeId: string, requested: string | null | undefined, fallbackId: string | null) {
    const id = requested?.trim() || fallbackId;
    if (!id) throw new CompareError("У дубля нет текста для сравнения.", "TRANSCRIPT_REQUIRED");
    const row = await prisma.transcriptRevision.findFirst({ where: { id, takeId } });
    if (!row) throw new CompareError("Версия текста не принадлежит выбранному дублю.", "REVISION_NOT_IN_TAKE");
    return row;
  }

  const left = await revision(leftTake.id, input.leftTranscriptId, leftTake.selectedTranscriptId);
  const right = await revision(rightTake.id, input.rightTranscriptId, rightTake.selectedTranscriptId);
  return { reel, leftTake, rightTake, left, right };
}

export async function previewTextDiff(
  reelId: string,
  input: {
    leftTakeId: string;
    rightTakeId: string;
    leftTranscriptId?: string | null;
    rightTranscriptId?: string | null;
  },
) {
  const sides = await resolveCompareSides(reelId, input);
  return {
    left: { takeId: sides.leftTake.id, transcriptId: sides.left.id, text: sides.left.text },
    right: { takeId: sides.rightTake.id, transcriptId: sides.right.id, text: sides.right.text },
    textDiff: diffTexts(sides.left.text, sides.right.text),
  };
}

export async function listComparisons(reelId: string): Promise<CompareDto[]> {
  const reel = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
  });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  const rows = await prisma.compareResult.findMany({
    where: { reelId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDto);
}

export function normalizeIntent(raw: unknown): string {
  const intent = typeof raw === "string" ? raw.trim() : "";
  if (intent.length > COMPARE_INTENT_MAX) {
    throw new CompareError(`Цель правки короче ${COMPARE_INTENT_MAX} символов.`, "INTENT_TOO_LONG");
  }
  return intent;
}

export { toDto };
