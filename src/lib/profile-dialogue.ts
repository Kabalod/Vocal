import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ZodError } from "zod";
import { defaultCompleteJson, LLM_MODEL, parseJsonObject } from "@/lib/ai/complete";
import { PROFILE_DIALOGUE_KIND, PROFILE_DIALOGUE_SYSTEM, profileV04UserPrompt } from "@/lib/ai/profile";
import { aiOperationKey, assertDailyTokenBudget, withAiInflight } from "@/lib/ai/usage-guard";
import { extractAudio } from "@/lib/ffmpeg";
import { gatewayComplete, transcribeVoiceOnce } from "@/lib/ai/gateway";
import { transcribeAudio } from "@/lib/stt";
import { decodeDialogueCursor, pageDialogueItems } from "@/lib/dialogue-cursor";
import {
  ensureLocalProfile,
  getProfile,
  persistProfileSession,
  readStoredProfilePayload,
} from "@/lib/profile";
import { buildPortrait } from "@/lib/profile-portrait";
import { displayedProfileFields } from "@/lib/v04-slice";
import { portraitProfileId, ownerUserId } from "@/lib/auth/session";
import { V04ActionError, parseV04ModelReply } from "@/lib/v04-action";
import { commitV04ProfileTurn } from "@/lib/v04-commit";
import type { CompleteJsonFn } from "@/types/review";
import type { DialogueKind, DialogueMessageDto, DialoguePageDto, DialogueRole } from "@/types/dialogue";
import type { ProfileWorkspaceDto } from "@/types/profile";

export const PROFILE_DIALOGUE_PAGE_SIZE = 20;

export class ProfileDialogueError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ProfileDialogueError";
  }
}

const FIRST_QUESTION =
  "Короткие ответы помогают Vocal держать тон, аудиторию и границы.\n\nС чего начнём: зачем вы хотите записывать ролики?";

const SUPPLEMENT_PROMPT =
  "Что изменить в портрете? Можно назвать цель, аудиторию, темы, подачу или границы. Если формулировка неоднозначная, я уточню, прежде чем что-то менять.";

type Payload = {
  voiceDurationLabel?: string;
};

function assistantErrorBody(error: unknown): string {
  if (error instanceof ProfileDialogueError) return error.message;
  if (error instanceof V04ActionError) return error.message;
  if (error instanceof ZodError) {
    return "Не удалось прочитать ответ модели. Повторите отправку — прежний портрет сохранён.";
  }
  const message = error instanceof Error ? error.message : "";
  if (!message.trim() || message.trim().startsWith("[") || /too_small|ZodError|не JSON/i.test(message)) {
    return "Не удалось прочитать ответ модели. Повторите отправку — прежний портрет сохранён.";
  }
  return message;
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isTechnicalErrorBody(body: string): boolean {
  const text = body.trim();
  return text.startsWith("[") || /too_small|ZodError|String must contain/i.test(text);
}

function parseMessagePayload(raw: string): Payload {
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
  const payload = parseMessagePayload(row.payloadJson);
  return {
    id: row.id,
    role: row.role as DialogueRole,
    kind: row.kind as DialogueKind,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    status: row.status === "pending" || row.status === "error" ? row.status : "done",
    voice: payload.voiceDurationLabel ? { durationLabel: payload.voiceDurationLabel } : null,
    proposal: null,
    source: row.sourceType && row.sourceId ? { type: row.sourceType, id: row.sourceId } : null,
  };
}

export async function ensureProfileThread() {
  await ensureLocalProfile();
  const existing = await prisma.dialogueThread.findUnique({ where: { profileId: portraitProfileId() } });
  if (existing) return existing;
  try {
    return await prisma.dialogueThread.create({
      data: { scope: "profile", profileId: portraitProfileId() },
    });
  } catch (error) {
    const raced = await prisma.dialogueThread.findUnique({ where: { profileId: portraitProfileId() } });
    if (raced) return raced;
    throw error;
  }
}

function visibleDialogueItems<T extends { id: string }>(items: T[], sessionStartId: string | null): T[] {
  if (!sessionStartId) return items;
  const index = items.findIndex((item) => item.id === sessionStartId);
  if (index < 0) return items;
  return items.slice(index);
}

export async function listProfileDialoguePage(input: { cursor?: string | null; limit?: number } = {}): Promise<DialoguePageDto> {
  const thread = await prisma.dialogueThread.findUnique({ where: { profileId: portraitProfileId() } });
  if (!thread) {
    return { threadId: "", messages: [], nextCursor: null, analyzing: false };
  }
  const { failStaleProcessingMessages } = await import("@/lib/recovery");
  await failStaleProcessingMessages(thread.id);
  const stored = await readStoredProfilePayload();
  const rows = await prisma.dialogueMessage.findMany({
    where: { threadId: thread.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const items = visibleDialogueItems(rows.map(asDto), stored.dialogueSessionStartId);
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 50) : PROFILE_DIALOGUE_PAGE_SIZE;
  const paged = pageDialogueItems(items, { cursor: decodeDialogueCursor(input.cursor), limit });
  return {
    threadId: thread.id,
    messages: paged.page,
    nextCursor: paged.nextCursor,
    analyzing: items.some((item) => item.status === "pending"),
  };
}

async function hideTechnicalProfileErrors(): Promise<void> {
  const thread = await prisma.dialogueThread.findUnique({ where: { profileId: portraitProfileId() } });
  if (!thread) return;
  const rows = await prisma.dialogueMessage.findMany({
    where: { threadId: thread.id, kind: "error" },
    select: { id: true, body: true },
  });
  const friendly = "Не удалось прочитать ответ модели. Повторите отправку — прежний портрет сохранён.";
  for (const row of rows) {
    if (!isTechnicalErrorBody(row.body)) continue;
    await prisma.dialogueMessage.update({ where: { id: row.id }, data: { body: friendly } });
  }
}

async function healStoredPortrait(stored: Awaited<ReturnType<typeof readStoredProfilePayload>>) {
  await hideTechnicalProfileErrors();
  return stored;
}

export async function getProfileWorkspace(input: { cursor?: string | null } = {}): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const stored = await healStoredPortrait(await readStoredProfilePayload());
  const dialogue = await listProfileDialoguePage(input);
  const lastAssistant = [...dialogue.messages].reverse().find((item) => item.role === "assistant");
  const lastQuestion = [...dialogue.messages].reverse().find((item) => item.role === "assistant" && item.kind === "question");
  const published = stored.portrait?.completed ? buildPortrait(displayedProfileFields(stored), true) : null;
  const applyError =
    lastAssistant?.kind === "error" && !isTechnicalErrorBody(lastAssistant.body) && (!published || stored.supplementing)
      ? lastAssistant.body
      : null;
  let phase: ProfileWorkspaceDto["phase"] = "idle";
  if (stored.supplementing) {
    phase = "conversation";
  } else if (published) {
    phase = "portrait";
  } else if (stored.dialogueSessionStartId) {
    phase = "conversation";
  }
  const awaitingConfirm = false;
  const mode: ProfileWorkspaceDto["mode"] =
    stored.supplementing || stored.pending?.mode === "amend"
      ? "amend"
      : published
        ? "amend"
        : phase === "conversation"
          ? "intake"
          : null;
  return {
    phase,
    skipped: stored.skipped,
    supplementing: stored.supplementing,
    pendingChange: Boolean(stored.pending && stored.pending.mode === "amend"),
    awaitingConfirm,
    pending: stored.pending,
    mode,
    portrait: published,
    draftPortrait: null,
    currentQuestion: lastQuestion?.body ?? null,
    applyError,
    profile: await getProfile(),
    dialogue,
  };
}

async function recentStoredText(threadId: string, excludeMessageId?: string): Promise<string> {
  const stored = await readStoredProfilePayload();
  const rows = await prisma.dialogueMessage.findMany({
    where: {
      threadId,
      kind: { not: "processing" },
      ...(excludeMessageId ? { id: { not: excludeMessageId } } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const visible = visibleDialogueItems(rows, stored.dialogueSessionStartId).slice(-12);
  return visible.map((row) => `${row.role}: ${row.body}`).join("\n");
}

async function startDialogueSession(body: string): Promise<string> {
  const thread = await ensureProfileThread();
  const seed = await prisma.dialogueMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      kind: "question",
      body,
      status: "done",
    },
  });
  return seed.id;
}

export async function startProfileDialogue(): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const stored = await readStoredProfilePayload();
  if (stored.portrait?.completed) {
    return supplementProfileDialogue();
  }
  if (stored.dialogueSessionStartId) {
    await persistProfileSession({
      skipped: false,
      supplementing: false,
    });
    return getProfileWorkspace();
  }
  const dialogueSessionStartId = await startDialogueSession(FIRST_QUESTION);
  await persistProfileSession({
    skipped: false,
    supplementing: false,
    dialogueSessionStartId,
  });
  return getProfileWorkspace();
}

export async function skipProfileDialogue(): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const stored = await readStoredProfilePayload();
  if (stored.portrait?.completed) {
    await persistProfileSession({
      skipped: false,
      supplementing: false,
      pending: null,
    });
    return getProfileWorkspace();
  }
  await persistProfileSession({
    skipped: true,
    supplementing: false,
  });
  return getProfileWorkspace();
}

export async function confirmProfilePortrait(): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  throw new ProfileDialogueError("Подтверждение портрета больше не используется.", "CONFIRM_REMOVED", 410);
}

export async function supplementProfileDialogue(): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const stored = await readStoredProfilePayload();
  if (stored.dialogueSessionStartId && (stored.pending?.mode === "amend" || stored.supplementing)) {
    await persistProfileSession({
      skipped: false,
      supplementing: true,
    });
    return getProfileWorkspace();
  }
  const seedBody = stored.pending?.openQuestions[0]?.trim() || SUPPLEMENT_PROMPT;
  const dialogueSessionStartId = await startDialogueSession(seedBody);
  await persistProfileSession({
    skipped: false,
    supplementing: true,
    dialogueSessionStartId,
    pending:
      stored.pending?.mode === "amend"
        ? stored.pending
        : {
            mode: "amend",
            understood: stored.pending?.understood ?? "",
            openQuestions: stored.pending?.openQuestions ?? [],
            draftFields: stored.pending?.draftFields ?? stored.fields,
            readyToConfirm: stored.pending?.readyToConfirm === true,
          },
  });
  return getProfileWorkspace();
}

const PROFILE_PROCESSING_STALE_MS = 3 * 60_000;

/**
 * A turn whose process died after "Собираю портрет…" was created never gets a reply. Close such
 * turns with an honest error so the thread does not hang forever. Fresh turns are left alone.
 */
export async function failStaleProfileProcessing(threadId: string, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PROFILE_PROCESSING_STALE_MS);
  const stale = await prisma.dialogueMessage.updateMany({
    where: { threadId, kind: "processing", status: "pending", createdAt: { lt: cutoff } },
    data: {
      kind: "error",
      body: "Не удалось собрать портрет. Отправьте ответ ещё раз.",
      status: "error",
    },
  });
  if (stale.count > 0) {
    await prisma.aiCall.updateMany({
      where: {
        kind: PROFILE_DIALOGUE_KIND,
        ownerUserId: ownerUserId(),
        status: "running",
        createdAt: { lt: cutoff },
      },
      data: { status: "error", errorMessage: "PROCESSING_STALE" },
    });
  }
  return stale.count;
}

export async function sendProfileMessage(
  input: { text: string; idempotencyKey: string; voiceDurationLabel?: string },
  complete: CompleteJsonFn = defaultCompleteJson,
): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const text = input.text.trim();
  if (!text) throw new ProfileDialogueError("Напишите или скажите ответ.", "EMPTY_TEXT");
  const key = input.idempotencyKey.trim();
  if (!key) throw new ProfileDialogueError("Нужен ключ повтора.", "IDEMPOTENCY");
  const thread = await ensureProfileThread();
  const existing = await prisma.dialogueMessage.findFirst({
    where: { threadId: thread.id, idempotencyKey: key },
  });
  if (existing) {
    await failStaleProfileProcessing(thread.id);
    return getProfileWorkspace();
  }

  return withAiInflight(
    aiOperationKey({
      ownerUserId: ownerUserId(),
      objectType: "profile",
      objectId: portraitProfileId(),
      operationType: "dialogue",
      idempotencyKey: key,
    }),
    async () => {
    const raced = await prisma.dialogueMessage.findFirst({
      where: { threadId: thread.id, idempotencyKey: key },
    });
    if (raced) return getProfileWorkspace();
    await assertDailyTokenBudget();

    let userMessage;
    try {
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
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      return getProfileWorkspace();
    }
    const processing = await prisma.dialogueMessage.create({
      data: {
        threadId: thread.id,
        role: "assistant",
        kind: "processing",
        body: "Собираю портрет…",
        status: "pending",
      },
    });

    const stored = await readStoredProfilePayload();
    const userPrompt = profileV04UserPrompt({
      slice: stored.v04Slice,
      published: stored.portrait?.completed === true,
      recentText: await recentStoredText(thread.id, userMessage.id),
      authorText: text,
      userMessageId: userMessage.id,
    });
    const mode = stored.portrait?.completed || stored.supplementing || stored.pending?.mode === "amend" ? "amend" : "intake";
    const workingFields = mode === "amend" ? (stored.pending?.draftFields ?? stored.fields) : stored.fields;

    const call = await prisma.aiCall.create({
      data: {
        kind: PROFILE_DIALOGUE_KIND,
        reelId: null,
        profileId: portraitProfileId(),
        model: LLM_MODEL,
        status: "running",
        ownerUserId: ownerUserId(),
        promptText: userPrompt,
        inputSnapshotJson: JSON.stringify({
          text,
          profileId: portraitProfileId(),
          mode,
          playbook: false,
          fields: workingFields,
        }),
      },
    });

    try {
      const raw = await gatewayComplete(complete, {
        model: LLM_MODEL,
        system: PROFILE_DIALOGUE_SYSTEM,
        user: userPrompt,
        label: "profile_dialogue",
      });
      const modelJson = parseJsonObject(raw.text);
      const action = parseV04ModelReply(modelJson);
      await commitV04ProfileTurn({
        prisma,
        callId: call.id,
        processingId: processing.id,
        userMessageId: userMessage.id,
        profileId: portraitProfileId(),
        ownerUserId: ownerUserId(),
        action,
        rawText: raw.text,
        promptTokens: raw.usage?.promptTokens ?? null,
        completionTokens: raw.usage?.completionTokens ?? null,
      });
    } catch (error) {
      const message = assistantErrorBody(error);
      const technical = error instanceof Error ? error.message.slice(0, 1000) : message;
      await prisma.aiCall.update({
        where: { id: call.id },
        data: { status: "error", errorMessage: technical },
      });
      await prisma.dialogueMessage.update({
        where: { id: processing.id },
        data: { kind: "error", body: message, status: "error" },
      });
      if (error instanceof ProfileDialogueError) throw error;
    }
    return getProfileWorkspace();
  });
}

export async function sendProfileVoice(
  input: { file: File; idempotencyKey: string; voiceDurationLabel?: string },
  complete: CompleteJsonFn = defaultCompleteJson,
  transcribe: typeof transcribeAudio = transcribeAudio,
  extract: typeof extractAudio = extractAudio,
): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const text = await transcribeVoiceOnce({
    scope: `profile:${portraitProfileId()}`,
    idempotencyKey: input.idempotencyKey,
    file: input.file,
    transcribe,
    extract,
    makeError: (message, code) => new ProfileDialogueError(message, code),
  });
  if (!text) {
    throw new ProfileDialogueError("Речь не распознана. Запишите голос заново или отправьте текстом.", "EMPTY_TRANSCRIPT");
  }
  return sendProfileMessage(
    {
      text,
      idempotencyKey: input.idempotencyKey,
      voiceDurationLabel: input.voiceDurationLabel,
    },
    complete,
  );
}
