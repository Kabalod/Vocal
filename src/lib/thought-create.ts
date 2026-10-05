import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { assertThoughtKeyNotDeleted } from "@/lib/data-deletion";
import { getReel, ReelError } from "@/lib/reels";
import { ensureThoughtState } from "@/lib/thought-state";
import { REEL_NOTE_MAX, REEL_TITLE_MAX, TAKE_TEXT_MAX, type ReelDto } from "@/types/reel";
import { SCRIPT_BODY_MAX } from "@/types/script";

export const DEFAULT_THOUGHT_TITLE = "Новая мысль";
const DEFAULT_TITLE = DEFAULT_THOUGHT_TITLE;

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function reelByCreateKey(key: string): Promise<ReelDto | null> {
  const row = await prisma.thoughtCreateKey.findUnique({
    where: { key },
    select: { reelId: true },
  });
  if (!row) return null;
  const reel = await getReel(row.reelId);
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  return reel;
}

export async function createThoughtFromText(input: {
  title?: string;
  body: string;
  idempotencyKey: string;
}): Promise<{ reel: ReelDto; created: boolean }> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new ReelError("Нужен ключ повтора запроса.", "IDEMPOTENCY_REQUIRED");
  }
  const body = input.body.trim();
  if (!body) throw new ReelError("Введите текст мысли.", "TEXT_REQUIRED");
  if (body.length > TAKE_TEXT_MAX || body.length > SCRIPT_BODY_MAX) {
    throw new ReelError(`Текст короче ${TAKE_TEXT_MAX} символов.`, "TEXT_TOO_LONG");
  }

  const title = (input.title ?? "").trim() || DEFAULT_TITLE;
  if (title.length > REEL_TITLE_MAX) {
    throw new ReelError(`Название короче ${REEL_TITLE_MAX} символов.`, "TITLE_TOO_LONG");
  }
  const initialNote = body.length <= REEL_NOTE_MAX ? body : "";

  const existing = await reelByCreateKey(idempotencyKey);
  if (existing) return { reel: existing, created: false };
  await assertThoughtKeyNotDeleted(idempotencyKey);

  try {
    const reelId = await prisma.$transaction(async (tx) => {
      const raced = await tx.thoughtCreateKey.findUnique({
        where: { key: idempotencyKey },
        select: { reelId: true },
      });
      if (raced) return raced.reelId;

      const reel = await tx.reel.create({
        data: {
          title,
          initialNote,
          status: "idea",
          ownerUserId: ownerUserId(),
        },
      });
      if (process.env.VOCAL_FAIL_THOUGHT_CREATE === "after-reel") {
        throw new Error("artificial-thought-create-fail");
      }
      await tx.thoughtCreateKey.create({
        data: { key: idempotencyKey, reelId: reel.id },
      });
      const take = await tx.take.create({
        data: {
          reelId: reel.id,
          number: 1,
          inputType: "text",
          bodyText: body,
          idempotencyKey,
          mediaStatus: "ready",
        },
      });
      const transcript = await tx.transcriptRevision.create({
        data: {
          takeId: take.id,
          kind: "original",
          source: "manual",
          text: body,
        },
      });
      await tx.take.update({
        where: { id: take.id },
        data: { selectedTranscriptId: transcript.id },
      });
      await tx.reel.update({
        where: { id: reel.id },
        data: { workingTakeId: take.id },
      });
      await ensureThoughtState(tx, {
        reelId: reel.id,
        ownerUserId: ownerUserId(),
        workingTakeId: take.id,
      });
      return reel.id;
    });

    const reel = await getReel(reelId);
    if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
    return { reel, created: true };
  } catch (error) {
    if (isUniqueConflict(error)) {
      const reel = await reelByCreateKey(idempotencyKey);
      if (reel) return { reel, created: false };
    }
    throw error;
  }
}
