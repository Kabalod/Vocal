import type { Criterion, Job } from "@prisma/client";
import type {
  AnalysisResultPayload,
  CriterionDto,
  JobDto,
  JobStatus,
  JobWithAnalysis,
} from "@/types/analysis";

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
