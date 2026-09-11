import { prisma } from "@/lib/db";
import { getReel, ReelError } from "@/lib/reels";
import { REEL_NOTE_MAX, REEL_TITLE_MAX, TAKE_TEXT_MAX, type ReelDto } from "@/types/reel";
import { SCRIPT_BODY_MAX, emptyRecording } from "@/types/script";

const DEFAULT_TITLE = "Новая мысль";

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

  const existing = await prisma.take.findFirst({
    where: { idempotencyKey },
    select: { reelId: true },
  });
  if (existing) {
    const reel = await getReel(existing.reelId);
    if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
    return { reel, created: false };
  }

  const reelId = await prisma.$transaction(async (tx) => {
    const raced = await tx.take.findFirst({
      where: { idempotencyKey },
      select: { reelId: true },
    });
    if (raced) return raced.reelId;

    const reel = await tx.reel.create({
      data: {
        title,
        initialNote,
        status: "idea",
      },
    });
    if (process.env.VOCAL_FAIL_THOUGHT_CREATE === "after-reel") {
      throw new Error("artificial-thought-create-fail");
    }
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
    const script = await tx.scriptVersion.create({
      data: {
        reelId: reel.id,
        kind: "manual",
        body,
        recordingJson: JSON.stringify(emptyRecording()),
        sourcesJson: JSON.stringify([{ type: "transcript", id: transcript.id, label: "Исходная мысль" }]),
        inventedIdeasJson: "[]",
      },
    });
    await tx.take.update({
      where: { id: take.id },
      data: { selectedTranscriptId: transcript.id, scriptVersionId: script.id },
    });
    await tx.reel.update({
      where: { id: reel.id },
      data: { selectedScriptId: script.id },
    });
    return reel.id;
  });

  const reel = await getReel(reelId);
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  return { reel, created: true };
}
