import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Take as TakeRow } from "@prisma/client";
import {
  parseReelStatusInput,
  normalizeReelStatus,
  isTakeInputType,
  type CreateReelInput,
  type CreateTakeInput,
  type ReelDto,
  type ReelListQuery,
  type ReelListResult,
  type UpdateReelInput,
  REEL_LIST_LIMIT,
  REEL_LIST_PAGE,
  REEL_NOTE_MAX,
  REEL_TITLE_MAX,
  TAKE_NOTE_MAX,
  TAKE_TEXT_MAX,
} from "@/types/reel";
import {
  ARCHIVE_DATE_FIELD_DEFAULT,
  ArchiveQueryError,
  archiveFilterFingerprint,
  bucketCalendarDays,
  monthRangeForOffset,
  parseArchiveRange,
  resolveArchiveDateField,
  type CalendarFacetDto,
} from "@/lib/reel-archive-query";
import { toReelDto, toReelListItemDto } from "@/lib/serialize";
import { thoughtCompletionGate } from "@/lib/thought-completion";
import { enqueueByKey } from "@/lib/write-queue";
import { isHeadKind } from "@/types/script";

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

type ListCursor = {
  sort: "updated" | "created" | "title";
  k: string;
  id: string;
  /** Fingerprint of status/sort/q/from/to/dateField; required for every cursor. */
  fp?: string;
};

function encodeListCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeListCursor(raw: string): ListCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as ListCursor;
    if (parsed?.sort !== "updated" && parsed?.sort !== "created" && parsed?.sort !== "title") {
      return null;
    }
    if (typeof parsed.k !== "string" || typeof parsed.id !== "string" || !parsed.id) {
      return null;
    }
    if (parsed.fp !== undefined && typeof parsed.fp !== "string") {
      return null;
    }
    return { sort: parsed.sort, k: parsed.k, id: parsed.id, fp: parsed.fp };
  } catch {
    return null;
  }
}

function reelListStatusWhere(status: ReelListQuery["status"]): Prisma.ReelWhereInput {
  if (status === "open" || status === "all") {
    return { NOT: { status: "archived" } };
  }
  if (status === "idea") return { status: { in: ["idea", "draft"] } };
  if (status === "in_progress") {
    return { status: { in: ["in_progress", "active", "ready_to_record"] } };
  }
  return { status };
}

function reelListSearchWhere(q: string): Prisma.ReelWhereInput {
  return { OR: [{ title: { contains: q } }, { initialNote: { contains: q } }] };
}

function reelListDateWhere(range: NonNullable<ReturnType<typeof parseArchiveRange>>): Prisma.ReelWhereInput {
  return {
    [range.dateField]: {
      gte: range.from,
      lt: range.to,
    },
  };
}

function reelListCursorWhere(sort: ListCursor["sort"], cursor: ListCursor): Prisma.ReelWhereInput {
  if (sort === "title") {
    return {
      OR: [
        { title: { gt: cursor.k } },
        { AND: [{ title: cursor.k }, { id: { gt: cursor.id } }] },
      ],
    };
  }
  const field = sort === "created" ? "createdAt" : "updatedAt";
  const at = new Date(cursor.k);
  if (Number.isNaN(at.getTime())) {
    throw new ReelError("Некорректный курсор списка.", "LIST_CURSOR", 400);
  }
  return {
    OR: [{ [field]: { lt: at } }, { AND: [{ [field]: at }, { id: { lt: cursor.id } }] }],
  };
}

function assertCursorMatchesFilters(cursor: ListCursor, sort: ListCursor["sort"], fingerprint: string) {
  if (typeof cursor.fp !== "string" || cursor.fp.length === 0) {
    throw new ReelError("Курсор списка устарел. Обновите страницу.", "LIST_CURSOR", 400);
  }
  if (cursor.sort !== sort || cursor.fp !== fingerprint) {
    throw new ReelError("Курсор не подходит к текущим фильтрам.", "LIST_CURSOR", 400);
  }
}

export async function listReels(query: ReelListQuery = {}): Promise<ReelListResult> {
  try {
    const limit = Math.min(Math.max(query.limit ?? REEL_LIST_PAGE, 1), REEL_LIST_LIMIT);
    const q = query.q?.trim();
    const status = query.status ?? "open";
    const sort = query.sort ?? "updated";
    const range = parseArchiveRange({
      from: query.from,
      to: query.to,
      dateField: query.dateField,
    });
    const dateField = range?.dateField ?? resolveArchiveDateField(query.dateField);
    const fingerprint = archiveFilterFingerprint({
      status,
      sort,
      q,
      from: query.from,
      to: query.to,
      dateField,
    });

    const baseFilters: Prisma.ReelWhereInput[] = [reelListStatusWhere(status)];
    if (q) baseFilters.push(reelListSearchWhere(q));
    if (range) baseFilters.push(reelListDateWhere(range));

    const pageFilters = [...baseFilters];
    if (query.cursor) {
      const cursor = decodeListCursor(query.cursor);
      if (!cursor) {
        throw new ReelError("Некорректный курсор списка.", "LIST_CURSOR", 400);
      }
      assertCursorMatchesFilters(cursor, sort, fingerprint);
      pageFilters.push(reelListCursorWhere(sort, cursor));
    }

    const where: Prisma.ReelWhereInput = { AND: pageFilters };
    const orderBy: Prisma.ReelOrderByWithRelationInput[] =
      sort === "title"
        ? [{ title: "asc" }, { id: "asc" }]
        : sort === "created"
          ? [{ createdAt: "desc" }, { id: "desc" }]
          : [{ updatedAt: "desc" }, { id: "desc" }];

    const [rows, totalCount, matchCount] = await Promise.all([
      prisma.reel.findMany({
        where,
        orderBy,
        take: limit + 1,
        select: {
          id: true,
          title: true,
          initialNote: true,
          status: true,
          selectedScriptId: true,
          finalScriptId: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { takes: true, scripts: true } },
        },
      }),
      prisma.reel.count({ where: { NOT: { status: "archived" } } }),
      prisma.reel.count({ where: { AND: baseFilters } }),
    ]);

    const page = rows.slice(0, limit).map(toReelListItemDto);
    const hasMore = rows.length > limit;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeListCursor({
            sort,
            id: last.id,
            k: sort === "title" ? last.title : last[sort === "created" ? "createdAt" : "updatedAt"],
            fp: fingerprint,
          })
        : null;

    return {
      reels: page,
      nextCursor,
      hasMore,
      totalCount,
      matchCount,
      range: range
        ? {
            from: range.from.toISOString(),
            to: range.to.toISOString(),
            dateField: range.dateField,
          }
        : null,
    };
  } catch (error) {
    if (error instanceof ArchiveQueryError) {
      throw new ReelError(error.message, error.code, error.status);
    }
    throw error;
  }
}

export async function listReelCalendarFacets(input: {
  month: string;
  tzOffsetMinutes: number;
  q?: string;
  status?: ReelListQuery["status"];
  dateField?: string | null;
}): Promise<CalendarFacetDto> {
  try {
    const dateField = resolveArchiveDateField(input.dateField);
    const status = input.status ?? "open";
    const q = input.q?.trim();
    const { from, to, month } = monthRangeForOffset(input.month, input.tzOffsetMinutes);

    const baseFilters: Prisma.ReelWhereInput[] = [reelListStatusWhere(status)];
    if (q) baseFilters.push(reelListSearchWhere(q));

    const monthFilters = [
      ...baseFilters,
      {
        [dateField]: {
          gte: from,
          lt: to,
        },
      } satisfies Prisma.ReelWhereInput,
    ];

    const [monthRows, bounds, matchCount] = await Promise.all([
      prisma.reel.findMany({
        where: { AND: monthFilters },
        select: dateField === "createdAt" ? { createdAt: true } : { updatedAt: true },
      }),
      prisma.reel.aggregate({
        where: { AND: baseFilters },
        _min: { createdAt: true, updatedAt: true },
        _max: { createdAt: true, updatedAt: true },
      }),
      prisma.reel.count({ where: { AND: monthFilters } }),
    ]);

    const instants = monthRows.map((row) =>
      dateField === "createdAt"
        ? (row as { createdAt: Date }).createdAt
        : (row as { updatedAt: Date }).updatedAt,
    );

    const earliest =
      dateField === "createdAt" ? bounds._min.createdAt : bounds._min.updatedAt;
    const latest =
      dateField === "createdAt" ? bounds._max.createdAt : bounds._max.updatedAt;

    return {
      month,
      dateField,
      dateFieldDefault: ARCHIVE_DATE_FIELD_DEFAULT,
      tzOffsetMinutes: input.tzOffsetMinutes,
      from: from.toISOString(),
      to: to.toISOString(),
      days: bucketCalendarDays(instants, input.tzOffsetMinutes),
      dataBounds: {
        earliest: earliest ? earliest.toISOString() : null,
        latest: latest ? latest.toISOString() : null,
      },
      matchCount,
    };
  } catch (error) {
    if (error instanceof ArchiveQueryError) {
      throw new ReelError(error.message, error.code, error.status);
    }
    throw error;
  }
}

async function assertFinalTakeBelongs(reelId: string, takeId: string): Promise<void> {
  const take = await prisma.take.findUnique({ where: { id: takeId } });
  if (!take || take.reelId !== reelId) {
    throw new ReelError("Итоговый дубль должен принадлежать этой мысли.", "TAKE_NOT_IN_REEL");
  }
}

async function assertFinalScriptReady(reelId: string, scriptId: string): Promise<void> {
  const row = await prisma.scriptVersion.findFirst({ where: { id: scriptId, reelId } });
  if (!row) {
    throw new ReelError("Итоговый сценарий должен принадлежать этой мысли.", "SCRIPT_NOT_IN_REEL");
  }
  if (!isHeadKind(row.kind)) {
    throw new ReelError(
      "Итоговой может быть только готовая версия сценария, не черновик и не предложение модели.",
      "SCRIPT_NOT_READY",
    );
  }
}

export async function updateReel(id: string, input: UpdateReelInput): Promise<ReelDto> {
  return enqueueByKey(`reel:${id}`, () => applyReelUpdate(id, input));
}

async function applyReelUpdate(id: string, input: UpdateReelInput): Promise<ReelDto> {
  const current = await prisma.reel.findUnique({ where: { id } });
  if (!current) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);

  const nextFinalTake = input.finalTakeId !== undefined ? input.finalTakeId : current.finalTakeId;
  const nextFinalScript = current.finalScriptId;
  const currentStatus = normalizeReelStatus(current.status);
  const nextStatus = input.status !== undefined ? input.status : currentStatus;
  const becomingCompleted = input.status === "completed" && currentStatus !== "completed";
  const changingFinalTake = input.finalTakeId !== undefined;

  if (currentStatus === "completed" && nextStatus === "completed" && changingFinalTake) {
    throw new ReelError("Сначала верните мысль в работу, чтобы сменить итог.", "NEED_REOPEN", 409);
  }

  if (becomingCompleted) {
    const gate = thoughtCompletionGate({
      finalTakeId: nextFinalTake,
      finalScriptId: nextFinalScript,
      status: "idea",
    });
    if (!gate.canComplete) {
      throw new ReelError(gate.blockedReason || "Нельзя завершить мысль без обоих итогов.", "COMPLETE_INCOMPLETE");
    }
    if (nextFinalTake) await assertFinalTakeBelongs(id, nextFinalTake);
    if (nextFinalScript) await assertFinalScriptReady(id, nextFinalScript);
  }

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
  if (input.finalTakeId !== undefined) {
    if (input.finalTakeId === null) {
      data.finalTakeId = null;
    } else {
      await assertFinalTakeBelongs(id, input.finalTakeId);
      data.finalTakeId = input.finalTakeId;
    }
  }

  if (Object.keys(data).length === 0) {
    throw new ReelError("Нет полей для сохранения.", "EMPTY_PATCH");
  }

  const takeOnlyPatch =
    changingFinalTake &&
    input.title === undefined &&
    input.initialNote === undefined &&
    input.status === undefined &&
    input.selectedTakeId === undefined;
  const statusOnlyPatch =
    input.status !== undefined &&
    input.title === undefined &&
    input.initialNote === undefined &&
    input.selectedTakeId === undefined &&
    input.finalTakeId === undefined;

  if (takeOnlyPatch && current.finalTakeId === (input.finalTakeId ?? null)) {
    return loadReelDto(id);
  }
  if (statusOnlyPatch && currentStatus === nextStatus) {
    return loadReelDto(id);
  }

  const where: Prisma.ReelWhereInput = { id };
  if (input.expectedUpdatedAt) {
    const expected = new Date(input.expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      throw new ReelError("Некорректная версия карточки.", "STALE", 400);
    }
    where.updatedAt = expected;
  }
  if (changingFinalTake && nextStatus === "completed" && !becomingCompleted) {
    throw new ReelError("Сначала верните мысль в работу, чтобы сменить итог.", "NEED_REOPEN", 409);
  }
  if (changingFinalTake && currentStatus !== "completed") {
    where.status = { not: "completed" };
  }
  if (becomingCompleted) {
    where.status = { not: "completed" };
    where.finalScriptId = { not: null };
    if (input.finalTakeId === undefined) where.finalTakeId = { not: null };
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (becomingCompleted || changingFinalTake) {
      const fresh = await tx.reel.findUnique({ where: { id } });
      if (!fresh) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
      const freshStatus = normalizeReelStatus(fresh.status);
      const takeId = input.finalTakeId !== undefined ? input.finalTakeId : fresh.finalTakeId;
      const scriptId = fresh.finalScriptId;
      if (changingFinalTake && freshStatus === "completed" && nextStatus === "completed") {
        throw new ReelError("Сначала верните мысль в работу, чтобы сменить итог.", "NEED_REOPEN", 409);
      }
      if (becomingCompleted) {
        const gate = thoughtCompletionGate({
          finalTakeId: takeId,
          finalScriptId: scriptId,
          status: "idea",
        });
        if (!gate.canComplete) {
          throw new ReelError(gate.blockedReason || "Нельзя завершить мысль без обоих итогов.", "COMPLETE_INCOMPLETE");
        }
        if (takeId) await assertFinalTakeBelongs(id, takeId);
        if (scriptId) await assertFinalScriptReady(id, scriptId);
      }
    }
    return tx.reel.updateMany({ where, data });
  });
  if (updated.count !== 1) {
    const exists = await prisma.reel.findUnique({ where: { id } });
    if (!exists) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
    if (takeOnlyPatch && exists.finalTakeId === (input.finalTakeId ?? null)) {
      return loadReelDto(id);
    }
    if (statusOnlyPatch && normalizeReelStatus(exists.status) === nextStatus) {
      return loadReelDto(id);
    }
    if (changingFinalTake && normalizeReelStatus(exists.status) === "completed") {
      throw new ReelError("Сначала верните мысль в работу, чтобы сменить итог.", "NEED_REOPEN", 409);
    }
    if (becomingCompleted) {
      const gate = thoughtCompletionGate({
        finalTakeId: exists.finalTakeId,
        finalScriptId: exists.finalScriptId,
        status: "idea",
      });
      if (!gate.canComplete) {
        throw new ReelError(gate.blockedReason || "Нельзя завершить мысль без обоих итогов.", "COMPLETE_INCOMPLETE");
      }
    }
    throw new ReelError("Карточка уже изменилась. Обновите данные и повторите.", "STALE", 409);
  }

  return loadReelDto(id);
}

async function loadReelDto(id: string): Promise<ReelDto> {
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
