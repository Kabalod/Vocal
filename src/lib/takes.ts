import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ReelError, createTake, getReel } from "@/lib/reels";
import { assertScriptOnReel, ScriptError } from "@/lib/scripts";
import { toTakeDto } from "@/lib/serialize";
import { ensureStorageDirs, takeMediaPathFor } from "@/lib/storage";
import { mimeFromName } from "@/lib/take-playback";
import {
  ALLOWED_AUDIO_EXTENSIONS,
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_MB,
} from "@/lib/config";
import { JOB_LEASE_MS } from "@/lib/jobs";
import {
  TAKE_NOTE_MAX,
  TAKE_TEXT_MAX,
  type TakeDto,
  type TakeInputType,
  type UpdateTakeInput,
} from "@/types/reel";

const takeInclude = {
  jobs: {
    select: { id: true, status: true, videoPath: true, audioPath: true, originalName: true },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export async function getTakeDto(id: string): Promise<TakeDto | null> {
  const row = await prisma.take.findUnique({ where: { id }, include: takeInclude });
  return row ? toTakeDto(row) : null;
}

export async function listTakeDtos(reelId: string): Promise<TakeDto[]> {
  const reel = await getReel(reelId);
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  return reel.takes;
}

export async function updateTake(id: string, input: UpdateTakeInput): Promise<TakeDto> {
  const existing = await prisma.take.findUnique({ where: { id } });
  if (!existing) throw new ReelError("Дубль не найден.", "TAKE_NOT_FOUND", 404);

  const data: { authorNote?: string; bodyText?: string; scriptVersionId?: string | null } = {};
  if (input.authorNote !== undefined) {
    const note = input.authorNote.trim();
    if (note.length > TAKE_NOTE_MAX) {
      throw new ReelError(`Заметка короче ${TAKE_NOTE_MAX} символов.`, "NOTE_TOO_LONG");
    }
    data.authorNote = note;
  }
  if (input.bodyText !== undefined) {
    if (existing.inputType !== "text") {
      throw new ReelError("Текст можно править только у текстовой попытки.", "NOT_TEXT_TAKE");
    }
    const text = input.bodyText;
    if (text.length > TAKE_TEXT_MAX) {
      throw new ReelError(`Текст короче ${TAKE_TEXT_MAX} символов.`, "TEXT_TOO_LONG");
    }
    if (!text.trim()) throw new ReelError("Введите текст попытки.", "TEXT_REQUIRED");
    data.bodyText = text;
  }
  if (input.scriptVersionId !== undefined) {
    if (input.scriptVersionId === null || input.scriptVersionId === "") {
      data.scriptVersionId = null;
    } else {
      try {
        await assertScriptOnReel(existing.reelId, input.scriptVersionId);
      } catch (error) {
        if (error instanceof ScriptError) {
          throw new ReelError(error.message, error.code, error.status);
        }
        throw error;
      }
      data.scriptVersionId = input.scriptVersionId;
    }
  }
  if (Object.keys(data).length === 0) {
    throw new ReelError("Нет полей для сохранения.", "EMPTY_PATCH");
  }

  await prisma.take.update({ where: { id }, data });
  if (data.bodyText) {
    const existingOriginal = await prisma.transcriptRevision.findFirst({
      where: { takeId: id, kind: "original" },
    });
    if (existingOriginal) {
      const { createEditedRevision } = await import("@/lib/transcripts");
      await createEditedRevision(id, data.bodyText);
    } else {
      const { ensureOriginalFromText } = await import("@/lib/transcripts");
      await ensureOriginalFromText(id, data.bodyText);
    }
  }
  const row = await prisma.take.findUnique({ where: { id }, include: takeInclude });
  if (!row) throw new ReelError("Дубль не найден.", "TAKE_NOT_FOUND", 404);
  return toTakeDto(row);
}

export async function resolveTakeFilePath(takeId: string): Promise<{
  storedPath: string;
  originalName: string | null;
  mimeType: string | null;
} | null> {
  const take = await prisma.take.findUnique({
    where: { id: takeId },
    include: { jobs: { orderBy: { createdAt: "asc" } } },
  });
  if (!take) return null;
  if (take.storedPath && take.mediaStatus === "ready") {
    return {
      storedPath: take.storedPath,
      originalName: take.originalName,
      mimeType: take.mimeType ?? (take.originalName ? mimeFromName(take.originalName) : null),
    };
  }
  for (const job of take.jobs) {
    if (job.videoPath && job.videoPath !== "pending") {
      const originalName = take.originalName ?? job.originalName;
      return {
        storedPath: job.videoPath,
        originalName,
        mimeType: take.mimeType ?? mimeFromName(originalName),
      };
    }
    if (job.audioPath) {
      const originalName = take.originalName ?? job.originalName;
      return {
        storedPath: job.audioPath,
        originalName,
        mimeType: take.mimeType ?? mimeFromName(originalName),
      };
    }
  }
  return null;
}

export type TakeUploadIo = {
  writeFile: (dest: string, data: Buffer) => Promise<void>;
  unlink: (dest: string) => Promise<void>;
};

const defaultUploadIo: TakeUploadIo = {
  writeFile: (dest, data) => writeFile(dest, data),
  unlink: (dest) => unlink(dest),
};

export const TAKE_UPLOAD_STALE_MS = JOB_LEASE_MS;

export function takeUploadClaimable(
  take: { mediaStatus: string; storedPath: string | null; createdAt: Date },
  now: Date,
  staleMs = TAKE_UPLOAD_STALE_MS,
): boolean {
  if (take.mediaStatus === "ready") return false;
  if (take.mediaStatus === "failed") return true;
  if (take.mediaStatus !== "pending") return false;
  if (!take.storedPath) return true;
  return now.getTime() - take.createdAt.getTime() >= staleMs;
}

async function waitForSettledUpload(takeId: string): Promise<TakeDto> {
  for (let attempt = 0; attempt < 80; attempt++) {
    const row = await prisma.take.findUnique({ where: { id: takeId }, include: takeInclude });
    if (!row) throw new ReelError("Дубль не найден.", "TAKE_NOT_FOUND", 404);
    if (row.mediaStatus === "ready" && row.storedPath) return toTakeDto(row);
    if (row.mediaStatus === "failed") {
      throw new ReelError("Загрузка не записалась. Файл не сохранён как успешный.", "UPLOAD_FAILED");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new ReelError("Загрузка ещё выполняется. Повторите позже.", "UPLOAD_IN_PROGRESS");
}

export async function saveUploadedTake(
  options: {
    reelId: string;
    file: File;
    inputType: TakeInputType;
    authorNote?: string;
    idempotencyKey?: string;
    scriptVersionId?: string;
    now?: Date;
  },
  io: TakeUploadIo = defaultUploadIo,
): Promise<TakeDto> {
  if (options.inputType !== "video" && options.inputType !== "audio") {
    throw new ReelError("Загрузка файла — только для видео или аудио.", "INPUT_TYPE");
  }
  const ext = path.extname(options.file.name).toLowerCase();
  const allowed = options.inputType === "audio" ? ALLOWED_AUDIO_EXTENSIONS : ALLOWED_EXTENSIONS;
  if (!allowed.includes(ext)) {
    throw new ReelError(
      options.inputType === "audio"
        ? "Нужен файл mp3, wav, m4a, aac, ogg или webm."
        : "Нужен файл mp4, webm, mov или mkv.",
      "FILE_TYPE",
    );
  }
  const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
  if (options.file.size > maxBytes) {
    throw new ReelError(`Файл больше ${MAX_UPLOAD_MB} МБ.`, "FILE_TOO_LARGE");
  }

  const mimeType = options.file.type || mimeFromName(options.file.name);
  await ensureStorageDirs();
  const take = await createTake(options.reelId, {
    inputType: options.inputType,
    authorNote: options.authorNote,
    idempotencyKey: options.idempotencyKey,
    mediaStatus: "pending",
    originalName: options.file.name,
    mimeType,
    scriptVersionId: options.scriptVersionId,
  });

  const now = options.now ?? new Date();
  const current = await prisma.take.findUnique({ where: { id: take.id } });
  if (!current) throw new ReelError("Дубль не найден.", "TAKE_NOT_FOUND", 404);
  if (current.mediaStatus === "ready" && current.storedPath) {
    const dto = await getTakeDto(take.id);
    if (!dto) throw new ReelError("Дубль не найден.", "TAKE_NOT_FOUND", 404);
    return dto;
  }
  if (!takeUploadClaimable(current, now)) {
    return waitForSettledUpload(take.id);
  }

  const dest = takeMediaPathFor(take.id, take.originalName || options.file.name, options.inputType);
  const staleBefore = new Date(now.getTime() - TAKE_UPLOAD_STALE_MS);
  const claimed = await prisma.take.updateMany({
    where: {
      id: take.id,
      mediaStatus: { in: ["pending", "failed"] },
      OR: [{ storedPath: null }, { mediaStatus: "failed" }, { createdAt: { lte: staleBefore } }],
    },
    data: {
      mediaStatus: "pending",
      storedPath: dest,
      originalName: options.file.name,
      mimeType,
    },
  });
  if (claimed.count !== 1) {
    return waitForSettledUpload(take.id);
  }

  try {
    const buffer = Buffer.from(await options.file.arrayBuffer());
    await io.writeFile(dest, buffer);
    const ready = await prisma.take.updateMany({
      where: { id: take.id, mediaStatus: "pending" },
      data: { mediaStatus: "ready", storedPath: dest },
    });
    if (ready.count !== 1) {
      return waitForSettledUpload(take.id);
    }
    const dto = await getTakeDto(take.id);
    if (!dto) throw new ReelError("Дубль не найден.", "TAKE_NOT_FOUND", 404);
    return dto;
  } catch (error) {
    try {
      await io.unlink(dest);
    } catch {
      /* файла могло не быть */
    }
    await prisma.take.updateMany({
      where: { id: take.id, mediaStatus: "pending" },
      data: { mediaStatus: "failed", storedPath: null },
    });
    if (error instanceof ReelError) throw error;
    throw new ReelError(
      error instanceof Error ? error.message : "Загрузка не записалась.",
      "UPLOAD_FAILED",
    );
  }
}
