import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Take as TakeRow } from "@prisma/client";
import {
  parseReelStatusInput,
  isTakeInputType,
  type CreateReelInput,
  type CreateTakeInput,
  type ReelDto,
  type ReelListQuery,
  type UpdateReelInput,
  REEL_LIST_LIMIT,
  REEL_NOTE_MAX,
  REEL_TITLE_MAX,
  TAKE_NOTE_MAX,
  TAKE_TEXT_MAX,
} from "@/types/reel";
import { toReelDto } from "@/lib/serialize";

const reelInclude = {
  takes: {
    orderBy: { number: "asc" as const },
    include: {
      jobs: {
        select: { id: true, status: true, videoPath: true, audioPath: true, originalName: true },
        orderBy: { createdAt: "asc" as const },
      },
    },
  },
  _count: { select: { scripts: true } },
} satisfies Prisma.ReelInclude;

export class ReelError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ReelError";
  }
}

function asReelDto(
  row: Prisma.ReelGetPayload<{ include: typeof reelInclude }>,
): ReelDto {
  return toReelDto(row);
}

export async function createReel(input: CreateReelInput): Promise<ReelDto> {
  const title = input.title.trim();
  if (!title) throw new ReelError("Нужно название карточки.", "TITLE_REQUIRED");
  if (title.length > REEL_TITLE_MAX) {
    throw new ReelError(`Название короче ${REEL_TITLE_MAX} символов.`, "TITLE_TOO_LONG");
  }
  const initialNote = input.initialNote?.trim() ?? "";
  if (initialNote.length > REEL_NOTE_MAX) {
    throw new ReelError(`Заметка короче ${REEL_NOTE_MAX} символов.`, "NOTE_TOO_LONG");
  }
  const row = await prisma.reel.create({
    data: {
      title,
      initialNote,
      status: "idea",
    },
    include: reelInclude,
  });
  return asReelDto(row);
}

export async function getReel(id: string): Promise<ReelDto | null> {
  const row = await prisma.reel.findUnique({ where: { id }, include: reelInclude });
  return row ? asReelDto(row) : null;
}

export async function listReels(
  query: ReelListQuery = {},
): Promise<{ reels: ReelDto[]; truncated: boolean }> {
  const limit = Math.min(Math.max(query.limit ?? REEL_LIST_LIMIT, 1), REEL_LIST_LIMIT);
  const q = query.q?.trim();
  const status = query.status ?? "open";
  const sort = query.sort ?? "updated";

  const where: Prisma.ReelWhereInput = {};
  if (status === "open") {
    where.NOT = { status: "archived" };
  } else if (status !== "all") {
    if (status === "idea") where.status = { in: ["idea", "draft"] };
    else if (status === "in_progress") where.status = { in: ["in_progress", "active"] };
    else where.status = status;
  }
  if (q) {
    where.OR = [{ title: { contains: q } }, { initialNote: { contains: q } }];
  }

  const orderBy: Prisma.ReelOrderByWithRelationInput =
    sort === "title"
      ? { title: "asc" }
      : sort === "created"
        ? { createdAt: "desc" }
        : { updatedAt: "desc" };

  const rows = await prisma.reel.findMany({
    where,
    orderBy,
    take: limit + 1,
    include: reelInclude,
  });
  const truncated = rows.length > limit;
  return {
    reels: rows.slice(0, limit).map(asReelDto),
    truncated,
  };
}

export async function updateReel(id: string, input: UpdateReelInput): Promise<ReelDto> {
  const data: Prisma.ReelUpdateManyMutationInput = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new ReelError("Нужно название карточки.", "TITLE_REQUIRED");
    if (title.length > REEL_TITLE_MAX) {
      throw new ReelError(`Название короче ${REEL_TITLE_MAX} символов.`, "TITLE_TOO_LONG");
    }
    data.title = title;
  }
  if (input.initialNote !== undefined) {
    const note = input.initialNote.trim();
    if (note.length > REEL_NOTE_MAX) {
      throw new ReelError(`Заметка короче ${REEL_NOTE_MAX} символов.`, "NOTE_TOO_LONG");
    }
    data.initialNote = note;
  }
  if (input.status !== undefined) {
    const status = parseReelStatusInput(input.status);
    if (!status) throw new ReelError("Неизвестный статус карточки.", "REEL_STATUS");
    data.status = status;
  }
  if (input.selectedTakeId !== undefined) {
    if (input.selectedTakeId === null) {
      data.selectedTakeId = null;
    } else {
      const take = await prisma.take.findUnique({ where: { id: input.selectedTakeId } });
      if (!take || take.reelId !== id) {
        throw new ReelError("Финальный дубль должен принадлежать этой карточке.", "TAKE_NOT_IN_REEL");
      }
      data.selectedTakeId = take.id;
    }
  }

  if (Object.keys(data).length === 0) {
    throw new ReelError("Нет полей для сохранения.", "EMPTY_PATCH");
  }

  const where: Prisma.ReelWhereInput = { id };
  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      throw new ReelError("Некорректная версия карточки.", "STALE", 400);
    }
    where.updatedAt = expected;
  }

  const updated = await prisma.reel.updateMany({ where, data });
  if (updated.count !== 1) {
    const exists = await prisma.reel.findUnique({ where: { id } });
    if (!exists) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
    throw new ReelError("Карточка уже изменилась. Обновите данные и повторите.", "STALE", 409);
  }

  const row = await prisma.reel.findUnique({ where: { id }, include: reelInclude });
  if (!row) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  return asReelDto(row);
}

export async function archiveReel(id: string): Promise<ReelDto> {
  return updateReel(id, { status: "archived" });
}

async function nextTakeNumber(tx: Prisma.TransactionClient, reelId: string): Promise<number> {
  const last = await tx.take.findFirst({
    where: { reelId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (last?.number ?? 0) + 1;
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createTake(reelId: string, input: CreateTakeInput): Promise<TakeRow> {
  if (!isTakeInputType(input.inputType)) {
    throw new ReelError("Тип попытки: video, audio или text.", "INPUT_TYPE");
  }
  const idempotencyKey = input.idempotencyKey?.trim() || null;
  const authorNote = input.authorNote?.trim() ?? "";
  if (authorNote.length > TAKE_NOTE_MAX) {
    throw new ReelError(`Заметка короче ${TAKE_NOTE_MAX} символов.`, "NOTE_TOO_LONG");
  }
  const bodyText = input.bodyText ?? "";
  if (bodyText.length > TAKE_TEXT_MAX) {
    throw new ReelError(`Текст короче ${TAKE_TEXT_MAX} символов.`, "TEXT_TOO_LONG");
  }
  const jobId = input.jobId?.trim() || undefined;
  const scriptVersionId = input.scriptVersionId?.trim() || null;
  if (scriptVersionId) {
    const script = await prisma.scriptVersion.findFirst({ where: { id: scriptVersionId, reelId } });
    if (!script) throw new ReelError("Версия сценария не найдена в этой карточке.", "SCRIPT_NOT_IN_REEL");
  }

  const reel = await prisma.reel.findUnique({ where: { id: reelId } });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (idempotencyKey) {
          const existing = await tx.take.findUnique({
            where: { reelId_idempotencyKey: { reelId, idempotencyKey } },
          });
          if (existing) {
            if (jobId) await bindJobToTakeOrThrow(tx, jobId, existing.id);
            return existing;
          }
        }

        const number = await nextTakeNumber(tx, reelId);
        const take = await tx.take.create({
          data: {
            reelId,
            number,
            inputType: input.inputType,
            authorNote,
            idempotencyKey,
            mediaStatus: input.mediaStatus ?? "ready",
            originalName: input.originalName ?? null,
            storedPath: input.storedPath ?? null,
            mimeType: input.mimeType ?? null,
            bodyText,
            scriptVersionId,
          },
        });

        if (jobId) await bindJobToTakeOrThrow(tx, jobId, take.id);
        return take;
      });
    } catch (error) {
      if (error instanceof ReelError) throw error;
      if (isUniqueConflict(error) && attempt < 11) continue;
      throw error;
    }
  }
  throw new ReelError("Не удалось выдать номер дубля.", "TAKE_NUMBER");
}

async function bindJobToTakeOrThrow(
  tx: Prisma.TransactionClient,
  jobId: string,
  takeId: string,
) {
  const job = await tx.job.findUnique({ where: { id: jobId } });
  if (!job) throw new ReelError("Задача не найдена.", "JOB_NOT_FOUND", 404);
  if (job.takeId === takeId) return;
  if (job.takeId) throw new ReelError("У этой задачи уже есть дубль.", "JOB_HAS_TAKE");

  const bound = await tx.job.updateMany({
    where: { id: jobId, takeId: null },
    data: { takeId },
  });
  if (bound.count !== 1) {
    throw new ReelError("У этой задачи уже есть дубль.", "JOB_HAS_TAKE");
  }
}
