import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { ReelError } from "@/lib/reels";
import { thoughtProcessingPhase } from "@/lib/thought-media";
import { readStrictFinalThoughtText } from "@/lib/v06-working-take";
import { thoughtUserStatus } from "@/lib/thought-preview";
import {
  normalizeReelStatus,
  reelStatusGroup,
  type ReelStatus,
  type ReelStatusGroup,
} from "@/types/reel";
import { isHeadKind } from "@/types/script";
import type { VocalUserStatusId } from "@/components/vocal-ui/kit";

export const ARCHIVE_SCRIPT_EXCERPT_MAX = 280;
export const ARCHIVE_NO_SCRIPT_HINT =
  "Сценария пока нет. Диалог откроется по исходной мысли, последнему дублю и истории.";

export type ArchivePreviewHonesty = "idle" | "processing" | "error";

export type ArchiveAcceptedScriptSummary = {
  id: string;
  versionNumber: number;
  excerpt: string;
};

export type ArchiveThoughtPreviewDto = {
  id: string;
  title: string;
  status: ReelStatus;
  statusGroup: ReelStatusGroup;
  userStatus: VocalUserStatusId;
  takeCount: number;
  completed: boolean;
  honesty: ArchivePreviewHonesty;
  honestyMessage: string | null;
  acceptedScript: ArchiveAcceptedScriptSummary | null;
  noScriptHint: string | null;
};

type PreviewScriptRow = {
  id: string;
  kind: string;
  body: string;
  createdAt: Date | string;
};

export function excerptArchiveScript(body: string): string {
  const text = body.trim().replace(/\s+/g, " ");
  if (text.length <= ARCHIVE_SCRIPT_EXCERPT_MAX) return text;
  return `${text.slice(0, ARCHIVE_SCRIPT_EXCERPT_MAX).trimEnd()}…`;
}

export function pickAcceptedArchiveScript(input: {
  selectedScriptId: string | null;
  finalScriptId: string | null;
  versions: PreviewScriptRow[];
}): PreviewScriptRow | null {
  const byId = new Map(input.versions.map((row) => [row.id, row]));
  const selected = input.selectedScriptId ? byId.get(input.selectedScriptId) : undefined;
  if (selected && isHeadKind(selected.kind)) return selected;
  const final = input.finalScriptId ? byId.get(input.finalScriptId) : undefined;
  if (final && isHeadKind(final.kind)) return final;
  const heads = input.versions.filter((row) => isHeadKind(row.kind));
  heads.sort((a, b) => {
    const byTime = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
  });
  return heads[0] ?? null;
}

export function archiveScriptVersionNumber(
  acceptedId: string,
  versions: PreviewScriptRow[],
): number {
  const readyAsc = versions
    .filter((row) => isHeadKind(row.kind))
    .sort((a, b) => {
      const byTime = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
    });
  const index = readyAsc.findIndex((row) => row.id === acceptedId);
  return index >= 0 ? index + 1 : readyAsc.length;
}

export function archivePreviewHonesty(job: {
  status: string;
  stage?: string | null;
  errorMessage?: string | null;
} | null): { honesty: ArchivePreviewHonesty; message: string | null } {
  if (!job) return { honesty: "idle", message: null };
  const phase = thoughtProcessingPhase(job);
  if (phase === "error") {
    return {
      honesty: "error",
      message: job.errorMessage?.trim() || "Не удалось обработать материал.",
    };
  }
  if (phase === "done") return { honesty: "idle", message: null };
  return {
    honesty: "processing",
    message: "Последняя версия ещё обрабатывается.",
  };
}

export async function getArchiveThoughtPreview(reelId: string): Promise<ArchiveThoughtPreviewDto> {
  const reel = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
    select: {
      id: true,
      title: true,
      status: true,
      selectedScriptId: true,
      finalScriptId: true,
      finalTakeId: true,
      _count: { select: { takes: true } },
      scripts: {
        select: { id: true, kind: true, body: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!reel) throw new ReelError("Мысль не найдена.", "REEL_NOT_FOUND", 404);

  const job = await prisma.job.findFirst({
    where: { take: { reelId } },
    orderBy: { createdAt: "desc" },
    select: { status: true, stage: true, errorMessage: true },
  });

  const status = normalizeReelStatus(reel.status);
  let accepted = pickAcceptedArchiveScript({
    selectedScriptId: reel.selectedScriptId,
    finalScriptId: reel.finalScriptId,
    versions: reel.scripts,
  });
  let missingFinalTextHint: string | null = null;
  if (status === "completed") {
    const text = await readStrictFinalThoughtText(prisma, {
      reelId,
      finalTakeId: reel.finalTakeId,
    });
    accepted = text
      ? { id: reel.finalTakeId ?? reel.id, kind: "ready", body: text, createdAt: new Date(0) }
      : null;
    if (!accepted) missingFinalTextHint = "Итоговый текст недоступен.";
  }
  const honesty = archivePreviewHonesty(job);
  const acceptedScript = accepted
    ? {
        id: accepted.id,
        versionNumber: archiveScriptVersionNumber(accepted.id, reel.scripts),
        excerpt: excerptArchiveScript(accepted.body),
      }
    : null;

  return {
    id: reel.id,
    title: reel.title,
    status,
    statusGroup: reelStatusGroup(status),
    userStatus: thoughtUserStatus(status),
    takeCount: reel._count.takes,
    completed: status === "completed",
    honesty: honesty.honesty,
    honestyMessage: honesty.message,
    acceptedScript,
    noScriptHint: acceptedScript ? null : missingFinalTextHint ?? ARCHIVE_NO_SCRIPT_HINT,
  };
}
