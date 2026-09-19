import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { enqueueJob } from "@/lib/pipeline";
import { ReelError, getReel } from "@/lib/reels";
import { toJobDto } from "@/lib/serialize";
import { saveUploadedTake } from "@/lib/takes";
import { DEFAULT_THOUGHT_TITLE } from "@/lib/thought-create";
import { applyThoughtTitleFromTranscript } from "@/lib/thought-title";
import {
  ALLOWED_AUDIO_EXTENSIONS,
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_MB,
} from "@/lib/config";
import { createReadyScriptFromTranscript } from "@/lib/scripts";
import { emptyRecording } from "@/types/script";
import type { JobDto } from "@/types/analysis";
import type { ReelDto, TakeDto, TakeInputType } from "@/types/reel";
import type { CompleteJsonFn } from "@/types/review";

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function assertThoughtMediaFile(file: File, inputType: TakeInputType) {
  if (inputType !== "audio" && inputType !== "video") {
    throw new ReelError("Для этого шага нужен голос или видео.", "INPUT_TYPE");
  }
  const ext = path.extname(file.name).toLowerCase();
  const allowed = inputType === "audio" ? ALLOWED_AUDIO_EXTENSIONS : ALLOWED_EXTENSIONS;
  if (!allowed.includes(ext)) {
    throw new ReelError(
      inputType === "audio"
        ? "Этот формат не поддерживается. Нужен файл mp3, wav, m4a, aac, ogg или webm."
        : "Этот формат не поддерживается. Нужен файл mp4, webm, mov или mkv.",
      "FILE_TYPE",
    );
  }
  const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new ReelError(`Файл больше ${MAX_UPLOAD_MB} МБ. Выберите другой файл.`, "FILE_TOO_LARGE");
  }
}

async function loadByKey(key: string): Promise<{
  reel: ReelDto;
  take: TakeDto | null;
  job: JobDto | null;
} | null> {
  const row = await prisma.thoughtCreateKey.findUnique({
    where: { key },
    select: { reelId: true },
  });
  if (!row) return null;
  const reel = await getReel(row.reelId);
  if (!reel) return null;
  const take = reel.takes[0] ?? null;
  const jobRow = take
    ? await prisma.job.findFirst({ where: { takeId: take.id }, orderBy: { createdAt: "desc" } })
    : await prisma.job.findFirst({
        where: { take: { reelId: reel.id } },
        orderBy: { createdAt: "desc" },
      });
  return { reel, take, job: jobRow ? toJobDto(jobRow) : null };
}

export async function ensureJobForTake(takeId: string, fileName: string): Promise<JobDto> {
  const take = await prisma.take.findFirst({
    where: { id: takeId, reel: { ownerUserId: ownerUserId() } },
    select: { mediaStatus: true, storedPath: true, originalName: true },
  });
  if (!take) throw new ReelError("Дубль не найден.", "TAKE_NOT_FOUND", 404);
  const existing = await prisma.job.findFirst({
    where: { takeId, ownerUserId: ownerUserId() },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return toJobDto(existing);
  if (!take || take.mediaStatus !== "ready" || !take.storedPath) {
    throw new ReelError("Файл ещё не сохранён.", "UPLOAD_FAILED");
  }
  const created = await prisma.job.create({
    data: {
      originalName: take.originalName ?? fileName,
      videoPath: take.storedPath,
      status: "queued",
      stage: "convert",
      takeId,
      ownerUserId: ownerUserId(),
    },
  });
  return toJobDto(created);
}

export async function createThoughtFromMedia(input: {
  file: File;
  inputType: TakeInputType;
  idempotencyKey: string;
}): Promise<{ reel: ReelDto; take: TakeDto; job: JobDto; created: boolean }> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new ReelError("Нужен ключ повтора запроса.", "IDEMPOTENCY_REQUIRED");
  }
  assertThoughtMediaFile(input.file, input.inputType);

  const existing = await loadByKey(idempotencyKey);
  if (existing?.take?.mediaStatus === "ready" && existing.job) {
    enqueueJob(existing.job.id);
    return { reel: existing.reel, take: existing.take, job: existing.job, created: false };
  }

  try {
    let reelId = existing?.reel.id;
    if (!reelId) {
      reelId = await prisma.$transaction(async (tx) => {
        const raced = await tx.thoughtCreateKey.findUnique({
          where: { key: idempotencyKey },
          select: { reelId: true },
        });
        if (raced) return raced.reelId;
        const reel = await tx.reel.create({
          data: { title: DEFAULT_THOUGHT_TITLE, initialNote: "", status: "idea" },
        });
        await tx.thoughtCreateKey.create({
          data: { key: idempotencyKey, reelId: reel.id },
        });
        return reel.id;
      });
    }

    const take = await saveUploadedTake({
      reelId,
      file: input.file,
      inputType: input.inputType,
      idempotencyKey,
    });
    if (take.mediaStatus !== "ready" || !take.hasFile) {
      throw new ReelError("Загрузка не записалась. Файл не сохранён как успешный.", "UPLOAD_FAILED");
    }
    const job = await ensureJobForTake(take.id, input.file.name);
    await prisma.reel.update({
      where: { id: reelId },
      data: { status: "in_progress" },
    });
    enqueueJob(job.id);
    const reel = await getReel(reelId);
    if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
    return { reel, take, job, created: !existing };
  } catch (error) {
    if (isUniqueConflict(error)) {
      const replay = await loadByKey(idempotencyKey);
      if (replay?.take && replay.job) {
        return { reel: replay.reel, take: replay.take, job: replay.job, created: false };
      }
    }
    throw error;
  }
}

export async function applyThoughtMediaFromTranscript(
  takeId: string,
  transcript: string,
  complete?: CompleteJsonFn,
): Promise<void> {
  const take = await prisma.take.findFirst({
    where: { id: takeId, reel: { ownerUserId: ownerUserId() } },
    include: { reel: true },
  });
  if (!take) return;
  const key = await prisma.thoughtCreateKey.findUnique({ where: { reelId: take.reelId } });

  const original = await prisma.transcriptRevision.findFirst({
    where: { takeId, kind: "original" },
    orderBy: { createdAt: "asc" },
  });
  if (!original) return;

  const existingScripts = await prisma.scriptVersion.findMany({
    where: { reelId: take.reelId },
    orderBy: { createdAt: "asc" },
  });
  const alreadyFromThisTranscript = existingScripts.some((row) => {
    try {
      const parsed = JSON.parse(row.sourcesJson) as { id?: string }[];
      return Array.isArray(parsed) && parsed.some((item) => item.id === original.id);
    } catch {
      return false;
    }
  });
  const firstScript = existingScripts[0];

  if (!firstScript) {
    if (key) {
      const script = await prisma.scriptVersion.create({
        data: {
          reelId: take.reelId,
          kind: "manual",
          body: transcript,
          recordingJson: JSON.stringify(emptyRecording()),
          sourcesJson: JSON.stringify([{ type: "transcript", id: original.id, label: "Исходная мысль" }]),
          inventedIdeasJson: "[]",
        },
      });
      await prisma.take.update({
        where: { id: take.id },
        data: { selectedTranscriptId: original.id, scriptVersionId: script.id },
      });
      await prisma.reel.update({
        where: { id: take.reelId },
        data: { selectedScriptId: script.id },
      });
    }
  } else if (!alreadyFromThisTranscript) {
    await createReadyScriptFromTranscript(take.reelId, {
      body: transcript,
      transcriptId: original.id,
      takeNumber: take.number,
      parentId: take.scriptVersionId,
      select: false,
    });
    await prisma.take.update({
      where: { id: take.id },
      data: { selectedTranscriptId: original.id },
    });
  } else {
    await prisma.take.update({
      where: { id: take.id },
      data: { selectedTranscriptId: original.id },
    });
  }

  if (key) {
    await applyThoughtTitleFromTranscript(take.reelId, transcript, complete);
  }
}

export function thoughtProcessingPhase(job: {
  status: string;
  stage?: string | null;
} | null): "saved" | "stt" | "analysis" | "done" | "error" {
  if (!job) return "saved";
  if (job.status === "done") return "done";
  if (job.status === "error") return "error";
  if (job.status === "analyzing" || job.stage === "analyze") return "analysis";
  if (job.status === "transcribing" || job.stage === "stt") return "stt";
  return "saved";
}
