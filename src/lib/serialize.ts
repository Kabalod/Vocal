import type { Criterion, Job } from "@prisma/client";
import type {
  AnalysisResultPayload,
  CriterionDto,
  JobDto,
  JobStatus,
  JobWithAnalysis,
} from "@/types/analysis";
import {
  isTakeInputType,
  isTakeMediaStatus,
  normalizeReelStatus,
  reelStatusGroup,
  type ReelDto,
  type ReelListItemDto,
  type TakeDto,
  REEL_LIST_PREVIEW_MAX,
} from "@/types/reel";
import { canPlayInBrowser, mimeFromName } from "@/lib/take-playback";

export function toJobDto(job: Job): JobDto {
  return {
    id: job.id,
    originalName: job.originalName,
    videoPath: job.videoPath,
    audioPath: job.audioPath,
    durationSec: job.durationSec,
    status: job.status as JobStatus,
    stage: job.stage,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function toCriterionDto(row: Criterion): CriterionDto {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    weight: row.weight,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    isExtended: row.isExtended,
    categoryId: row.categoryId,
    categoryLabel: row.categoryLabel,
    categoryWeight: row.categoryWeight,
    categoryOrder: row.categoryOrder,
  };
}

export function parsePayload(raw: string): AnalysisResultPayload {
  return JSON.parse(raw) as AnalysisResultPayload;
}

export function toJobWithAnalysis(
  job: Job & { analysis: { payload: string } | null },
): JobWithAnalysis {
  return {
    ...toJobDto(job),
    analysis: job.analysis ? parsePayload(job.analysis.payload) : null,
  };
}

type TakeWithJobs = {
  id: string;
  reelId: string;
  number: number;
  inputType: string;
  authorNote: string;
  mediaStatus?: string | null;
  originalName?: string | null;
  storedPath?: string | null;
  mimeType?: string | null;
  bodyText?: string | null;
  scriptVersionId?: string | null;
  createdAt: Date;
  jobs: {
    id: string;
    status: string;
    videoPath?: string | null;
    audioPath?: string | null;
    originalName?: string | null;
  }[];
};

function jobHasFile(job: { videoPath?: string | null; audioPath?: string | null }) {
  const video = job.videoPath?.trim();
  const audio = job.audioPath?.trim();
  return Boolean((video && video !== "pending") || audio);
}

export function toTakeDto(take: TakeWithJobs): TakeDto {
  const inputType = isTakeInputType(take.inputType) ? take.inputType : "video";
  const rawStatus = take.mediaStatus ?? "ready";
  const mediaStatus = isTakeMediaStatus(rawStatus) ? rawStatus : "ready";
  const hasOwnFile = Boolean(take.storedPath && mediaStatus === "ready");
  const fileJob = take.jobs.find(jobHasFile);
  const hasFile = hasOwnFile || Boolean(fileJob);
  const originalName = take.originalName ?? fileJob?.originalName ?? null;
  const mimeType = take.mimeType ?? (originalName ? mimeFromName(originalName) : null);
  return {
    id: take.id,
    reelId: take.reelId,
    number: take.number,
    inputType,
    authorNote: take.authorNote,
    mediaStatus,
    originalName,
    mimeType,
    bodyText: take.bodyText ?? "",
    hasFile,
    browserPlayback: hasFile && canPlayInBrowser(inputType, originalName),
    mediaUrl: hasFile ? `/api/takes/${take.id}/media` : null,
    downloadUrl: hasFile ? `/api/takes/${take.id}/media?download=1` : null,
    scriptVersionId: take.scriptVersionId ?? null,
    createdAt: take.createdAt.toISOString(),
    jobs: take.jobs.map((job) => ({ id: job.id, status: job.status })),
  };
}

export function toTakeListDto(take: TakeWithJobs): TakeDto {
  return {
    ...toTakeDto(take),
    mediaUrl: null,
    downloadUrl: null,
  };
}

type ReelWithTakes = {
  id: string;
  title: string;
  initialNote: string;
  status: string;
  selectedTakeId: string | null;
  selectedScriptId?: string | null;
  finalTakeId?: string | null;
  finalScriptId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  takes: TakeWithJobs[];
  _count?: { scripts?: number };
};

export function toReelDto(reel: ReelWithTakes): ReelDto {
  const status = normalizeReelStatus(reel.status);
  return {
    id: reel.id,
    title: reel.title,
    initialNote: reel.initialNote,
    status,
    selectedTakeId: reel.selectedTakeId,
    finalTakeId: reel.finalTakeId ?? null,
    finalScriptId: reel.finalScriptId ?? null,
    createdAt: reel.createdAt.toISOString(),
    updatedAt: reel.updatedAt.toISOString(),
    takes: reel.takes.map(toTakeListDto),
    takeCount: reel.takes.length,
    hasScript: Boolean(
      reel.selectedScriptId || reel.finalScriptId || (reel._count?.scripts ?? 0) > 0,
    ),
  };
}

type ReelListRow = {
  id: string;
  title: string;
  initialNote: string;
  status: string;
  selectedScriptId?: string | null;
  finalScriptId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { takes: number; scripts: number };
};

export function toReelListItemDto(reel: ReelListRow): ReelListItemDto {
  const status = normalizeReelStatus(reel.status);
  const note = reel.initialNote.trim();
  return {
    id: reel.id,
    title: reel.title,
    status,
    statusGroup: reelStatusGroup(status),
    preview: note.length > REEL_LIST_PREVIEW_MAX ? note.slice(0, REEL_LIST_PREVIEW_MAX) : note,
    takeCount: reel._count.takes,
    hasScript: Boolean(reel.selectedScriptId || reel.finalScriptId || reel._count.scripts > 0),
    createdAt: reel.createdAt.toISOString(),
    updatedAt: reel.updatedAt.toISOString(),
  };
}
