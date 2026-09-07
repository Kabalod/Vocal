import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ReelError, createTake, getReel } from "@/lib/reels";
import { toTakeDto } from "@/lib/serialize";
import { ensureStorageDirs, takeMediaPathFor } from "@/lib/storage";
import { mimeFromName } from "@/lib/take-playback";
import {
  ALLOWED_AUDIO_EXTENSIONS,
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_MB,
} from "@/lib/config";
import {
  TAKE_NOTE_MAX,
  TAKE_TEXT_MAX,
  type TakeDto,
  type TakeInputType,
  type UpdateTakeInput,
} from "@/types/reel";

const takeInclude = {
  jobs: {
    select: { id: true, status: true, videoPath: true, audioPath: true },
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

  const data: { authorNote?: string; bodyText?: string } = {};
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
  if (Object.keys(data).length === 0) {
    throw new ReelError("Нет полей для сохранения.", "EMPTY_PATCH");
  }

  await prisma.take.update({ where: { id }, data });
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
      mimeType: take.mimeType,
    };
  }
  for (const job of take.jobs) {
    if (job.videoPath && job.videoPath !== "pending") {
      return {
        storedPath: job.videoPath,
        originalName: job.originalName,
        mimeType: take.mimeType,
      };
    }
    if (job.audioPath) {
      return {
        storedPath: job.audioPath,
        originalName: job.originalName,
        mimeType: take.mimeType,
      };
    }
  }
  return null;
}

export async function saveUploadedTake(options: {
  reelId: string;
  file: File;
  inputType: TakeInputType;
  authorNote?: string;
  idempotencyKey?: string;
}): Promise<TakeDto> {
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

  await ensureStorageDirs();
  const take = await createTake(options.reelId, {
    inputType: options.inputType,
    authorNote: options.authorNote,
    idempotencyKey: options.idempotencyKey,
    mediaStatus: "pending",
    originalName: options.file.name,
    mimeType: options.file.type || mimeFromName(options.file.name),
  });

  if (take.mediaStatus === "ready" && take.storedPath) {
    const dto = await getTakeDto(take.id);
    if (!dto) throw new ReelError("Дубль не найден.", "TAKE_NOT_FOUND", 404);
    return dto;
  }

  const dest = take.storedPath ?? takeMediaPathFor(take.id, options.file.name, options.inputType);
  try {
    const buffer = Buffer.from(await options.file.arrayBuffer());
    await writeFile(dest, buffer);
    const updated = await prisma.take.update({
      where: { id: take.id },
      data: {
        storedPath: dest,
        mediaStatus: "ready",
        originalName: options.file.name,
        mimeType: options.file.type || mimeFromName(options.file.name),
      },
      include: takeInclude,
    });
    return toTakeDto(updated);
  } catch (error) {
    try {
      await unlink(dest);
    } catch {
      /* файла могло не быть */
    }
    await prisma.take.update({
      where: { id: take.id },
      data: { mediaStatus: "failed", storedPath: null },
    });
    throw error;
  }
}
