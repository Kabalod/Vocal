import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { defaultCompleteJson, LLM_MODEL, parseJsonObject } from "@/lib/ai/complete";
import { extractAudio } from "@/lib/ffmpeg";
import { transcribeAudio } from "@/lib/stt";
import { assertDailyTokenBudget, withAiInflight } from "@/lib/ai/usage-guard";
import { pageDialogueItems, decodeDialogueCursor } from "@/lib/dialogue-cursor";
import { getReelContext } from "@/lib/reel-context";
import { ReelError } from "@/lib/reels";
import { replaceScriptDraft } from "@/lib/scripts";
import { listTranscriptBundle } from "@/lib/transcripts";
import type { CompleteJsonFn } from "@/types/review";
import type { DialogueKind, DialogueMessageDto, DialoguePageDto, DialogueRole } from "@/types/dialogue";

export const DIALOGUE_PAGE_SIZE = 20;

export class DialogueError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DialogueError";
  }
}

const replySchema = z.object({
  reply: z.string().min(1),
  scriptProposal: z.string().nullable().optional(),
});

const DIALOGUE_SYSTEM = `Ты Vocal. Помогаешь автору раскрыть свою мысль в разговоре. Опирайся только на материал и переписку. Не выдумывай личный опыт, факты и мотивы. Не ставь баллы. Не создавай параллельную редакторскую рубрику. Playbook не копируй списком. Верни только JSON.`;

type Payload = {
  voiceDurationLabel?: string;
  transferred?: boolean;
  scriptVersionId?: string;
  draftId?: string;
  versionLabel?: string;
  script?: string;
};

function parsePayload(raw: string): Payload {
  try {
    return JSON.parse(raw) as Payload;
  } catch {
    return {};
  }
}

function asDto(row: {
  id: string;
  role: string;
  kind: string;
  body: string;
  payloadJson: string;
  sourceType: string | null;
  sourceId: string | null;
  status: string;
  createdAt: Date;
}): DialogueMessageDto {
  const payload = parsePayload(row.payloadJson);
  const kind = row.kind as DialogueKind;
  return {
    id: row.id,
    role: row.role as DialogueRole,
    kind,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    status: row.status === "pending" || row.status === "error" ? row.status : "done",
    voice: payload.voiceDurationLabel ? { durationLabel: payload.voiceDurationLabel } : null,
    proposal:
      kind === "script_proposal"
        ? {
            transferred: Boolean(payload.transferred),
            scriptVersionId: payload.scriptVersionId ?? null,
            draftId: payload.draftId ?? null,
            versionLabel: payload.versionLabel ?? null,
          }
        : null,
    source: row.sourceType && row.sourceId ? { type: row.sourceType, id: row.sourceId } : null,
  };
}

export async function ensureReelThread(reelId: string) {
  const reel = await prisma.reel.findUnique({ where: { id: reelId }, select: { id: true } });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  const existing = await prisma.dialogueThread.findUnique({ where: { reelId } });
  if (existing) return existing;
  try {
    return await prisma.dialogueThread.create({ data: { scope: "reel", reelId } });
  } catch (error) {
    const raced = await prisma.dialogueThread.findUnique({ where: { reelId } });
    if (raced) return raced;
    throw error;
  }
}

type TimelineItem = DialogueMessageDto;

function reviewBody(resultJson: string | null, errorMessage: string | null): string {
  if (errorMessage) return errorMessage;
  if (!resultJson) return "Разбор мысли.";
  try {
    const parsed = JSON.parse(resultJson) as { authorThought?: string; modelSuggestion?: string };
    return [parsed.authorThought, parsed.modelSuggestion].filter(Boolean).join("\n\n") || "Разбор мысли.";
  } catch {
    return "Разбор мысли.";
  }
}

async function legacyItems(reelId: string, claimed: Set<string>): Promise<TimelineItem[]> {
  const [reviews, questions] = await Promise.all([
    prisma.review.findMany({ where: { reelId }, orderBy: { createdAt: "asc" } }),
    prisma.question.findMany({
      where: { reelId },
      orderBy: { createdAt: "asc" },
      include: { answers: { orderBy: { createdAt: "asc" } } },
    }),
  ]);
  const items: TimelineItem[] = [];
  for (const review of reviews) {
    const key = `review:${review.id}`;
    if (claimed.has(key)) continue;
    items.push({
      id: `legacy:review:${review.id}`,
      role: "assistant",
      kind: review.status === "error" ? "error" : review.status === "done" ? "review" : "processing",
      body:
        review.status === "running" || review.status === "queued"
          ? "Разбираю вашу мысль…"
          : reviewBody(review.resultJson, review.errorMessage),
      createdAt: review.createdAt.toISOString(),
      status: review.status === "error" ? "error" : review.status === "done" ? "done" : "pending",
      voice: null,
      proposal: null,
      source: { type: "review", id: review.id },
    });
  }
  for (const question of questions) {
    const qKey = `question:${question.id}`;
    if (!claimed.has(qKey)) {
      items.push({
        id: `legacy:question:${question.id}`,
        role: "assistant",
        kind: "question",
        body: question.text,
        createdAt: question.createdAt.toISOString(),
        status: "done",
        voice: null,
        proposal: null,
        source: { type: "question", id: question.id },
      });
    }
    for (const answer of question.answers) {
      const aKey = `answer:${answer.id}`;
      if (claimed.has(aKey)) continue;
      items.push({
        id: `legacy:answer:${answer.id}`,
        role: "user",
        kind: "answer",
        body: answer.text,
        createdAt: answer.createdAt.toISOString(),
        status: "done",
        voice: null,
        proposal: null,
        source: { type: "answer", id: answer.id },
      });
    }
  }
  return items;
}

export async function listDialoguePage(
  reelId: string,
  input: { cursor?: string | null; limit?: number } = {},
): Promise<DialoguePageDto> {
  const thread = await ensureReelThread(reelId);
  const { failStaleProcessingMessages } = await import("@/lib/recovery");
  await failStaleProcessingMessages(thread.id);
  const stored = await prisma.dialogueMessage.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: "asc" },
  });
  const claimed = new Set(
    stored
      .filter((row) => row.sourceType && row.sourceId)
      .map((row) => `${row.sourceType}:${row.sourceId}`),
  );
  const items = [...stored.map(asDto), ...(await legacyItems(reelId, claimed))];
  const limit = Math.min(Math.max(input.limit ?? DIALOGUE_PAGE_SIZE, 1), 50);
  const { page, nextCursor } = pageDialogueItems(items, {
    cursor: decodeDialogueCursor(input.cursor),
    limit,
  });
  return {
    threadId: thread.id,
    messages: page,
    nextCursor,
    analyzing: items.some((item) => item.kind === "processing" && item.status === "pending"),
  };
}

export async function buildThoughtMaterialContext(reelId: string): Promise<string> {
  const reel = await prisma.reel.findUnique({
    where: { id: reelId },
    include: {
      takes: { orderBy: { number: "asc" }, take: 2 },
      scripts: { orderBy: { createdAt: "desc" }, take: 4 },
    },
  });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  const take = reel.takes.find((row) => row.id === reel.selectedTakeId) ?? reel.takes[0];
  const transcript = take ? await listTranscriptBundle(take.id) : null;
  const selectedText = transcript?.revisions.find((row) => row.id === transcript.selectedId)?.text;
  const script =
    reel.scripts.find((row) => row.id === reel.selectedScriptId) ??
    reel.scripts.find((row) => row.kind !== "ai_proposal" && row.kind !== "draft");
  const live = (await getReelContext(reelId)).live;
  return [
    `Мысль: ${reel.id}`,
    `Название: ${reel.title ?? ""}`,
    selectedText ? `Материал:\n${selectedText.slice(0, 4000)}` : "Материала пока нет.",
    script?.body ? `Сценарий:\n${script.body.slice(0, 2000)}` : "",
    `Цель ролика: ${live.reelGoal || "не указана"}`,
    `Аудитория ролика: ${live.reelAudience || "не указана"}`,
    `Подтверждённый профиль (можно в текст): ${JSON.stringify(live.publicForScript)}`,
    `Подтверждённый профиль (только понимание): ${JSON.stringify(live.understandingOnly)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function recentStoredText(threadId: string): Promise<string> {
  const rows = await prisma.dialogueMessage.findMany({
    where: { threadId, kind: { in: ["text", "question", "answer", "script_proposal"] } },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return rows
    .reverse()
    .map((row) => `${row.role}: ${row.body.slice(0, 400)}`)
    .join("\n");
}

export async function sendDialogueMessage(
  reelId: string,
  input: {
    text: string;
    idempotencyKey: string;
    voiceDurationLabel?: string;
  },
  complete: CompleteJsonFn = defaultCompleteJson,
): Promise<DialoguePageDto> {
  const text = input.text.trim();
  if (!text) throw new DialogueError("Введите сообщение.", "EMPTY");
  const key = input.idempotencyKey.trim();
  if (!key) throw new DialogueError("Нужен ключ повтора.", "IDEMPOTENCY");
  const thread = await ensureReelThread(reelId);
  const existing = await prisma.dialogueMessage.findFirst({
    where: { threadId: thread.id, idempotencyKey: key },
  });
  if (existing) return listDialoguePage(reelId);

  return withAiInflight(`dialogue:${reelId}:${key}`, async () => {
    const raced = await prisma.dialogueMessage.findFirst({
      where: { threadId: thread.id, idempotencyKey: key },
    });
    if (raced) return listDialoguePage(reelId);
    await assertDailyTokenBudget();

    await prisma.dialogueMessage.create({
      data: {
        threadId: thread.id,
        role: "user",
        kind: "text",
        body: text,
        payloadJson: JSON.stringify(input.voiceDurationLabel ? { voiceDurationLabel: input.voiceDurationLabel } : {}),
        status: "done",
        idempotencyKey: key,
      },
    });
    const processing = await prisma.dialogueMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        kind: "processing",
        body: "Разбираю вашу мысль…",
        status: "pending",
      },
    });

    const userPrompt = `${await buildThoughtMaterialContext(reelId)}

Недавняя переписка:
${await recentStoredText(thread.id)}

Ответ автора: ${text}

JSON: {"reply":"","scriptProposal":null}`;

    const call = await prisma.aiCall.create({
      data: {
        kind: "dialogue",
        reelId,
        model: LLM_MODEL,
        status: "running",
        promptText: userPrompt,
        inputSnapshotJson: JSON.stringify({ text, playbook: false }),
      },
    });

    try {
      const raw = await complete({
        model: LLM_MODEL,
        system: DIALOGUE_SYSTEM,
        user: userPrompt,
        label: "dialogue",
      });
      const parsed = replySchema.parse(parseJsonObject(raw.text));
      await prisma.aiCall.update({
        where: { id: call.id },
        data: {
          status: "done",
          responseText: raw.text,
          resultJson: JSON.stringify(parsed),
          promptTokens: raw.usage?.promptTokens ?? null,
          completionTokens: raw.usage?.completionTokens ?? null,
        },
      });
      await prisma.dialogueMessage.update({
        where: { id: processing.id },
        data: { kind: "text", body: parsed.reply.trim(), status: "done" },
      });
      const proposal = parsed.scriptProposal?.trim();
      if (proposal) {
        await prisma.dialogueMessage.create({
          data: {
            threadId: thread.id,
            role: "assistant",
            kind: "script_proposal",
            body: proposal,
            payloadJson: JSON.stringify({ script: proposal, transferred: false }),
            status: "done",
          },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось ответить.";
      await prisma.aiCall.update({
        where: { id: call.id },
        data: { status: "error", errorMessage: message },
      });
      await prisma.dialogueMessage.update({
        where: { id: processing.id },
        data: { kind: "error", body: message, status: "error" },
      });
    }
    return listDialoguePage(reelId);
  });
}

export async function sendDialogueVoice(
  reelId: string,
  input: { file: File; idempotencyKey: string; voiceDurationLabel?: string },
  complete: CompleteJsonFn = defaultCompleteJson,
  transcribe: typeof transcribeAudio = transcribeAudio,
  extract: typeof extractAudio = extractAudio,
): Promise<DialoguePageDto> {
  const dir = await mkdtemp(path.join(tmpdir(), "vocal-dialogue-voice-"));
  const rawPath = path.join(dir, "reply.webm");
  const mp3Path = path.join(dir, "reply.mp3");
  try {
    if (!input.file.size) {
      throw new DialogueError("Голосовой файл пуст. Запишите голос заново.", "VOICE_EMPTY");
    }
    await writeFile(rawPath, Buffer.from(await input.file.arrayBuffer()));
    try {
      await extract(rawPath, mp3Path);
    } catch {
      throw new DialogueError("Не удалось подготовить голосовой ответ. Запишите голос заново.", "STT_PREPARE");
    }
    let stt;
    try {
      stt = await transcribe(mp3Path);
    } catch {
      throw new DialogueError("Не удалось расшифровать голос. Повторите отправку или запишите заново.", "STT_FAILED");
    }
    const text = stt.text.trim();
    if (!text) {
      throw new DialogueError("Речь не распознана. Запишите голос заново или отправьте текстом.", "EMPTY_TRANSCRIPT");
    }
    return sendDialogueMessage(
      reelId,
      {
        text,
        idempotencyKey: input.idempotencyKey,
        voiceDurationLabel: input.voiceDurationLabel,
      },
      complete,
    );
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function requestScriptHelp(
  reelId: string,
  input: { idempotencyKey: string },
  complete: CompleteJsonFn = defaultCompleteJson,
): Promise<DialoguePageDto> {
  const key = `help:${input.idempotencyKey.trim()}`;
  if (key === "help:") throw new DialogueError("Нужен ключ повтора.", "IDEMPOTENCY");
  return sendDialogueMessage(
    reelId,
    { text: "Помоги собрать вариант прямой речи для сценария.", idempotencyKey: key },
    complete,
  );
}

export async function transferDialogueProposal(reelId: string, messageId: string): Promise<DialoguePageDto> {
  const thread = await ensureReelThread(reelId);
  const message = await prisma.dialogueMessage.findFirst({
    where: { id: messageId, threadId: thread.id, kind: "script_proposal" },
  });
  if (!message) throw new DialogueError("Предложение не найдено.", "PROPOSAL_NOT_FOUND", 404);
  const existing = parsePayload(message.payloadJson);
  if (message.claimKey && existing.transferred && existing.scriptVersionId) {
    return listDialoguePage(reelId);
  }

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.dialogueMessage.updateMany({
      where: { id: message.id, claimKey: null },
      data: { claimKey: `transfer:${message.id}` },
    });
    if (claimed.count === 0) return;
    const fresh = await tx.dialogueMessage.findUniqueOrThrow({ where: { id: message.id } });
    const payload = parsePayload(fresh.payloadJson);
    const body = (payload.script ?? fresh.body).trim();
    const reel = await tx.reel.findUniqueOrThrow({ where: { id: reelId }, select: { selectedScriptId: true } });
    const draft = await replaceScriptDraft(
      reelId,
      {
        body,
        sourceKind: "vocal",
        baseVersionId: reel.selectedScriptId,
        sources: [],
      },
      tx,
    );
    await tx.dialogueMessage.update({
      where: { id: fresh.id },
      data: {
        payloadJson: JSON.stringify({
          ...payload,
          script: body,
          transferred: true,
          draftId: draft.id,
          scriptVersionId: null,
          versionLabel: "черновик",
        }),
      },
    });
  });
  return listDialoguePage(reelId);
}
