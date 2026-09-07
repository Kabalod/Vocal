import type { Criterion, Job } from "@prisma/client";
import type {
  AnalysisResultPayload,
  CriterionDto,
  JobDto,
  JobStatus,
  JobWithAnalysis,
} from "@/types/analysis";
import {
  isReelStatus,
  isTakeInputType,
  type ReelDto,
  type TakeDto,
} from "@/types/reel";

export function toJobDto(job: Job): JobDto {
  return {
    id: job.id,
    originalName: job.originalName,
    videoPath: job.videoPath,
    audioPath: job.audioPath,
    durationSec: job.durationSec,
    status: job.status as JobStatus,
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
  createdAt: Date;
  jobs: { id: string; status: string }[];
};

type ReelWithTakes = {
  id: string;
  title: string;
  initialNote: string;
  status: string;
  selectedTakeId: string | null;
  createdAt: Date;
  updatedAt: Date;
  takes: TakeWithJobs[];
};

export function toTakeDto(take: TakeWithJobs): TakeDto {
  const inputType = isTakeInputType(take.inputType) ? take.inputType : "video";
  return {
    id: take.id,
    reelId: take.reelId,
    number: take.number,
    inputType,
    authorNote: take.authorNote,
    createdAt: take.createdAt.toISOString(),
    jobs: take.jobs.map((job) => ({ id: job.id, status: job.status })),
  };
}

export function toReelDto(reel: ReelWithTakes): ReelDto {
  const status = isReelStatus(reel.status) ? reel.status : "draft";
  return {
    id: reel.id,
    title: reel.title,
    initialNote: reel.initialNote,
    status,
    selectedTakeId: reel.selectedTakeId,
    createdAt: reel.createdAt.toISOString(),
    updatedAt: reel.updatedAt.toISOString(),
    takes: reel.takes.map(toTakeDto),
  };
}
