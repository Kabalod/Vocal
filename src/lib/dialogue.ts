import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { defaultCompleteJson, LLM_MODEL, parseJsonObject } from "@/lib/ai/complete";
import { extractAudio } from "@/lib/ffmpeg";
import { transcribeAudio } from "@/lib/stt";
import { aiOperationKey, assertDailyTokenBudget, StateVersionError, withAiInflight } from "@/lib/ai/usage-guard";
import { pageDialogueItems, decodeDialogueCursor } from "@/lib/dialogue-cursor";
import { getReelContext } from "@/lib/reel-context";
import { ReelError } from "@/lib/reels";
import { replaceScriptDraft } from "@/lib/scripts";
import { listTranscriptBundle } from "@/lib/transcripts";
import {
  commitDialogueReply,
  readDialogueVersion,
  requireWorkingTake,
  snapshotFromLoaded,
} from "@/lib/working-take";
import { v01TestSeams } from "@/lib/v01-test-seams";
import { AgentActionError, parseAgentAction } from "@/lib/agent-action";
import { getThoughtState, ThoughtStateError } from "@/lib/thought-state";
import { v03TestSeams } from "@/lib/v03-test-seams";
import type { DialogueMaterialSnapshot } from "@/lib/working-take";
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

const DIALOGUE_SYSTEM = `Ты Vocal. Помогаешь автору раскрыть свою мысль. Опирайся только на материал и переписку. Не выдумывай факты и мотивы. Не ставь баллы. Действия не являются статусом мысли. Верни только JSON одного действия: ask_question, suggest_take, content_sufficient или redirect_to_task.`;

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
  const reel = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
    select: { id: true },
  });
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

async function freezeThoughtPrompt(reelId: string, threadId: string, authorText: string) {
  const { reel, take } = await requireWorkingTake(reelId);
  if (v01TestSeams.afterWorkingTakeRead) await v01TestSeams.afterWorkingTakeRead();
  const [scripts, transcript, dialogueVersion, recent, live] = await Promise.all([
    prisma.scriptVersion.findMany({
      where: { reelId },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    listTranscriptBundle(take.id),
    readDialogueVersion(threadId),
    recentStoredText(threadId),
    getReelContext(reelId),
  ]);
  const revisionId = take.selectedTranscriptId ?? transcript.selectedId;
  const selectedText = transcript.revisions.find((row) => row.id === revisionId)?.text;
  const script =
    scripts.find((row) => row.id === reel.selectedScriptId) ??
    scripts.find((row) => row.kind !== "ai_proposal" && row.kind !== "draft");
  const thought = await getThoughtState(reelId);
  const material = snapshotFromLoaded(
    reel,
    { id: take.id, selectedTranscriptId: revisionId ?? null },
    dialogueVersion,
    thought.revision,
  );
  const prompt = [
    `Мысль: ${reel.id}`,
    `Название: ${reel.title ?? ""}`,
    `Рабочий дубль: ${take.id}`,
    revisionId ? `Ревизия: ${revisionId}` : "",
    selectedText ? `Материал:\n${selectedText.slice(0, 4000)}` : "Материала пока нет.",
    script?.body ? `Сценарий:\n${script.body.slice(0, 2000)}` : "",
    `Цель ролика: ${live.live.reelGoal || "не указана"}`,
    `Аудитория ролика: ${live.live.reelAudience || "не указана"}`,
    `Подтверждённый профиль (можно в текст): ${JSON.stringify(live.live.publicForScript)}`,
    `Подтверждённый профиль (только понимание): ${JSON.stringify(live.live.understandingOnly)}`,
    `Недавняя переписка:\n${recent}`,
    `Ответ автора: ${authorText}`,
    `Состояние мысли: ${JSON.stringify({
      revision: thought.revision,
      intent: thought.intent,
      takeTask: thought.takeTask,
      facts: thought.facts,
      openGaps: thought.openGaps,
    })}`,
    `JSON одного действия: {"action":"ask_question","question":"","gapId":"","clarificationReason":"","whyUnknown":""} или {"action":"suggest_take","mainIdea":"","takeTask":"","evidenceRefs":[]} или {"action":"content_sufficient","checkedInTranscript":"","whyNoGaps":""} или {"action":"redirect_to_task","currentTask":""}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { prompt, material };
}

export async function buildThoughtMaterialContext(reelId: string): Promise<string> {
  const thread = await ensureReelThread(reelId);
  const { prompt } = await freezeThoughtPrompt(reelId, thread.id, "");
  return prompt;
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

async function assertDialogueStateVersion(
  reelId: string,
  input: { expectedUpdatedAt?: string; expectedWorkingTakeId?: string },
) {
  if (!input.expectedUpdatedAt && input.expectedWorkingTakeId === undefined) return;
  const reel = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
    select: { updatedAt: true, workingTakeId: true },
  });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  if (input.expectedUpdatedAt && reel.updatedAt.toISOString() !== input.expectedUpdatedAt) {
    throw new StateVersionError();
  }
  if (input.expectedWorkingTakeId !== undefined && reel.workingTakeId !== input.expectedWorkingTakeId) {
    throw new StateVersionError();
  }
}

function snapshotFromCallJson(raw: string): DialogueMaterialSnapshot {
  const parsed = JSON.parse(raw) as DialogueMaterialSnapshot;
  return {
    workingTakeId: parsed.workingTakeId,
    transcriptRevisionId: parsed.transcriptRevisionId,
    reelUpdatedAt: parsed.reelUpdatedAt,
    thoughtStateRevision: parsed.thoughtStateRevision,
    dialogueVersion: parsed.dialogueVersion,
  };
}

async function isDialogueTurnComplete(reelId: string, threadId: string, userMessageId: string) {
  const user = await prisma.dialogueMessage.findUnique({ where: { id: userMessageId } });
  if (!user) return false;
  const call = await prisma.aiCall.findFirst({
    where: { reelId, kind: "dialogue", status: "done" },
    orderBy: { createdAt: "desc" },
  });
  const assistant = await prisma.dialogueMessage.findFirst({
    where: {
      threadId,
      role: "assistant",
      status: "done",
      kind: { in: ["question", "text"] },
    },
    orderBy: { createdAt: "desc" },
  });
  return Boolean(call && assistant && assistant.createdAt >= user.createdAt);
}

export async function sendDialogueMessage(
  reelId: string,
  input: {
    text: string;
    idempotencyKey: string;
    voiceDurationLabel?: string;
    expectedUpdatedAt?: string;
    expectedWorkingTakeId?: string;
  },
  complete: CompleteJsonFn = defaultCompleteJson,
): Promise<DialoguePageDto> {
  const text = input.text.trim();
  if (!text) throw new DialogueError("Введите сообщение.", "EMPTY");
  const key = input.idempotencyKey.trim();
  if (!key) throw new DialogueError("Нужен ключ повтора.", "IDEMPOTENCY");
  await assertDialogueStateVersion(reelId, input);
  const thread = await ensureReelThread(reelId);
  const existing = await prisma.dialogueMessage.findFirst({
    where: { threadId: thread.id, idempotencyKey: key },
  });
  if (existing && (await isDialogueTurnComplete(reelId, thread.id, existing.id))) {
    return listDialoguePage(reelId);
  }

  return withAiInflight(
    aiOperationKey({
      ownerUserId: ownerUserId(),
      objectType: "thought",
      objectId: reelId,
      operationType: "dialogue",
      idempotencyKey: key,
    }),
    async () => {
    let userMessage = await prisma.dialogueMessage.findFirst({
      where: { threadId: thread.id, idempotencyKey: key },
    });
    if (userMessage && (await isDialogueTurnComplete(reelId, thread.id, userMessage.id))) {
      return listDialoguePage(reelId);
    }
    if (!userMessage) await assertDailyTokenBudget();
    if (!userMessage) {
      userMessage = await prisma.dialogueMessage.create({
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
    }
    if (v03TestSeams.afterUserMessageCreate) await v03TestSeams.afterUserMessageCreate();

    let processing = await prisma.dialogueMessage.findFirst({
      where: {
        threadId: thread.id,
        role: "assistant",
        createdAt: { gte: userMessage.createdAt },
        kind: { in: ["processing", "error"] },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!processing) {
      processing = await prisma.dialogueMessage.create({
        data: {
          threadId: thread.id,
          role: "assistant",
          kind: "processing",
          body: "Разбираю вашу мысль…",
          status: "pending",
        },
      });
    }

    const reusableCalls = await prisma.aiCall.findMany({
      where: {
        reelId,
        kind: "dialogue",
        ownerUserId: ownerUserId(),
        status: { not: "done" },
      },
      orderBy: { createdAt: "desc" },
    });
    const reusable = reusableCalls.find((row) => {
      if (!row.responseText) return false;
      try {
        const snap = JSON.parse(row.inputSnapshotJson) as { idempotencyKey?: string };
        return snap.idempotencyKey === key;
      } catch {
        return false;
      }
    });

    try {
      if (reusable?.responseText) {
        const action = parseAgentAction(parseJsonObject(reusable.responseText));
        await commitDialogueReply({
          reelId,
          threadId: thread.id,
          snapshot: snapshotFromCallJson(reusable.inputSnapshotJson),
          callId: reusable.id,
          processingId: processing.id,
          userMessageId: userMessage.id,
          action,
          rawText: reusable.responseText,
          promptTokens: reusable.promptTokens,
          completionTokens: reusable.completionTokens,
        });
        return listDialoguePage(reelId);
      }

      const { prompt: userPrompt, material } = await freezeThoughtPrompt(reelId, thread.id, text);
      const call = await prisma.aiCall.create({
        data: {
          kind: "dialogue",
          reelId,
          model: LLM_MODEL,
          status: "running",
          ownerUserId: ownerUserId(),
          promptText: userPrompt,
          inputSnapshotJson: JSON.stringify({
            text,
            playbook: false,
            idempotencyKey: key,
            userMessageId: userMessage.id,
            workingTakeId: material.workingTakeId,
            transcriptRevisionId: material.transcriptRevisionId,
            reelUpdatedAt: material.reelUpdatedAt,
            dialogueVersion: material.dialogueVersion,
            thoughtStateRevision: material.thoughtStateRevision,
          }),
        },
      });
      const raw = await complete({
        model: LLM_MODEL,
        system: DIALOGUE_SYSTEM,
        user: userPrompt,
        label: "dialogue",
      });
      await prisma.aiCall.update({
        where: { id: call.id },
        data: {
          responseText: raw.text,
          promptTokens: raw.usage?.promptTokens ?? null,
          completionTokens: raw.usage?.completionTokens ?? null,
        },
      });
      const action = parseAgentAction(parseJsonObject(raw.text));
      await commitDialogueReply({
        reelId,
        threadId: thread.id,
        snapshot: material,
        callId: call.id,
        processingId: processing.id,
        userMessageId: userMessage.id,
        action,
        rawText: raw.text,
        promptTokens: raw.usage?.promptTokens ?? null,
        completionTokens: raw.usage?.completionTokens ?? null,
      });
    } catch (error) {
      const stale = error instanceof StateVersionError || error instanceof ReelError;
      const message = stale
        ? error instanceof StateVersionError
          ? error.message
          : "Состояние мысли уже изменилось. Обновите и повторите."
        : error instanceof Error
          ? error.message
          : "Не удалось ответить.";
      const failedCall = await prisma.aiCall.findFirst({
        where: { reelId, kind: "dialogue", ownerUserId: ownerUserId() },
        orderBy: { createdAt: "desc" },
      });
      if (failedCall && failedCall.status !== "done") {
        await prisma.aiCall.update({
          where: { id: failedCall.id },
          data: { status: "error", errorMessage: stale ? "STATE_VERSION" : message },
        });
      }
      if (error instanceof ThoughtStateError) throw error;
      await prisma.dialogueMessage.update({
        where: { id: processing.id },
        data: { kind: "error", body: message, status: "error" },
      });
      if (error instanceof StateVersionError) throw error;
      if (error instanceof ReelError) throw new StateVersionError();
      if (error instanceof AgentActionError) throw error;
    }
    return listDialoguePage(reelId);
  });
}

export async function sendDialogueVoice(
  reelId: string,
  input: {
    file: File;
    idempotencyKey: string;
    voiceDurationLabel?: string;
    expectedUpdatedAt?: string;
    expectedWorkingTakeId?: string;
  },
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
        expectedUpdatedAt: input.expectedUpdatedAt,
        expectedWorkingTakeId: input.expectedWorkingTakeId,
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
