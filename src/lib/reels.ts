import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Take as TakeRow } from "@prisma/client";
import {
  isReelStatus,
  isTakeInputType,
  type CreateReelInput,
  type CreateTakeInput,
  type ReelDto,
  type UpdateReelInput,
} from "@/types/reel";
import { toReelDto } from "@/lib/serialize";

const reelInclude = {
  takes: {
    orderBy: { number: "asc" as const },
    include: { jobs: { select: { id: true, status: true }, orderBy: { createdAt: "asc" as const } } },
  },
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
  const row = await prisma.reel.create({
    data: {
      title,
      initialNote: input.initialNote?.trim() ?? "",
      status: "draft",
    },
    include: reelInclude,
  });
  return asReelDto(row);
}

export async function getReel(id: string): Promise<ReelDto | null> {
  const row = await prisma.reel.findUnique({ where: { id }, include: reelInclude });
  return row ? asReelDto(row) : null;
}

export async function listReels(): Promise<ReelDto[]> {
  const rows = await prisma.reel.findMany({
    orderBy: { updatedAt: "desc" },
    include: reelInclude,
  });
  return rows.map(asReelDto);
}

export async function updateReel(id: string, input: UpdateReelInput): Promise<ReelDto> {
  const existing = await prisma.reel.findUnique({ where: { id } });
  if (!existing) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);

  const data: Prisma.ReelUpdateInput = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new ReelError("Нужно название карточки.", "TITLE_REQUIRED");
    data.title = title;
  }
  if (input.initialNote !== undefined) data.initialNote = input.initialNote.trim();
  if (input.status !== undefined) {
    if (!isReelStatus(input.status)) throw new ReelError("Неизвестный статус карточки.", "REEL_STATUS");
    data.status = input.status;
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

  const row = await prisma.reel.update({ where: { id }, data, include: reelInclude });
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

  const reel = await prisma.reel.findUnique({ where: { id: reelId } });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);

  if (input.jobId) {
    const job = await prisma.job.findUnique({ where: { id: input.jobId } });
    if (!job) throw new ReelError("Задача не найдена.", "JOB_NOT_FOUND", 404);
    if (job.takeId) throw new ReelError("У этой задачи уже есть дубль.", "JOB_HAS_TAKE");
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (idempotencyKey) {
          const existing = await tx.take.findUnique({
            where: { reelId_idempotencyKey: { reelId, idempotencyKey } },
          });
          if (existing) return existing;
        }

        const number = await nextTakeNumber(tx, reelId);
        return tx.take.create({
          data: {
            reelId,
            number,
            inputType: input.inputType,
            authorNote,
            idempotencyKey,
            ...(input.jobId ? { jobs: { connect: { id: input.jobId } } } : {}),
          },
        });
      });
    } catch (error) {
      if (isUniqueConflict(error) && attempt < 11) continue;
      throw error;
    }
  }
  throw new ReelError("Не удалось выдать номер дубля.", "TAKE_NUMBER");
}
