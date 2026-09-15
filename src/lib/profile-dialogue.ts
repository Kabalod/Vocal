import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { ZodError } from "zod";
import { defaultCompleteJson, LLM_MODEL, parseJsonObject } from "@/lib/ai/complete";
import { PROFILE_DIALOGUE_KIND, PROFILE_DIALOGUE_SYSTEM, parseProfileAiReply, profileChecklistPrompt } from "@/lib/ai/profile";
import { assertDailyTokenBudget, withAiInflight } from "@/lib/ai/usage-guard";
import { extractAudio } from "@/lib/ffmpeg";
import { transcribeAudio } from "@/lib/stt";
import { decodeDialogueCursor, pageDialogueItems } from "@/lib/dialogue-cursor";
import {
  ensureLocalProfile,
  getProfile,
  persistProfilePayload,
  readStoredProfilePayload,
  readStoredProfilePayloadTx,
  serializeStoredPayload,
} from "@/lib/profile";
import { buildPortrait, coveredProfileKeys, decidePortraitComplete, applyFieldOperations, applyUnchangedFieldsOnly } from "@/lib/profile-portrait";
import type { ProfileAiReply } from "@/lib/ai/profile";
import { LOCAL_PROFILE_ID } from "@/types/profile";
import type { CompleteJsonFn } from "@/types/review";
import type { DialogueKind, DialogueMessageDto, DialoguePageDto, DialogueRole } from "@/types/dialogue";
import type { ProfileFieldValue, ProfileWorkspaceDto } from "@/types/profile";

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
  "Ответы нужны, чтобы в вопросах и сценариях учитывать ваши цели, аудиторию, интересы, манеру речи и границы — без чужих догадок.\n\nМожно пропускать то, о чём не хотите говорить. Если факт можно использовать в тексте ролика — скажите об этом обычными словами.\n\nС чего начнём: зачем вы хотите записывать ролики?";

const SUPPLEMENT_PROMPT =
  "Что изменить в портрете? Можно назвать цель, аудиторию, темы, подачу или границы. Если формулировка неоднозначная, я уточню, прежде чем что-то менять.";

type Payload = {
  voiceDurationLabel?: string;
};

function assistantErrorBody(error: unknown): string {
  if (error instanceof ProfileDialogueError) return error.message;
  if (error instanceof ZodError) {
    return "Не удалось прочитать ответ модели. Повторите отправку — прежний портрет сохранён.";
  }
  const message = error instanceof Error ? error.message : "";
  if (!message.trim() || message.trim().startsWith("[") || /too_small|ZodError|не JSON/i.test(message)) {
    return "Не удалось прочитать ответ модели. Повторите отправку — прежний портрет сохранён.";
  }
  return message;
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
  const existing = await prisma.dialogueThread.findUnique({ where: { profileId: LOCAL_PROFILE_ID } });
  if (existing) return existing;
  try {
    return await prisma.dialogueThread.create({
      data: { scope: "profile", profileId: LOCAL_PROFILE_ID },
    });
  } catch (error) {
    const raced = await prisma.dialogueThread.findUnique({ where: { profileId: LOCAL_PROFILE_ID } });
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
  const thread = await prisma.dialogueThread.findUnique({ where: { profileId: LOCAL_PROFILE_ID } });
  if (!thread) {
    return { threadId: "", messages: [], nextCursor: null, analyzing: false };
  }
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
  const thread = await prisma.dialogueThread.findUnique({ where: { profileId: LOCAL_PROFILE_ID } });
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
  let next = stored;
  if (!coveredProfileKeys(stored.fields).length) {
    const calls = await prisma.aiCall.findMany({
      where: { kind: PROFILE_DIALOGUE_KIND, profileId: LOCAL_PROFILE_ID, status: "done" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { responseText: true, resultJson: true },
    });
    let fields = stored.fields;
    for (const call of calls) {
      const raw = (call.responseText || call.resultJson || "").trim();
      if (!raw) continue;
      try {
        const parsed = parseProfileAiReply(parseJsonObject(raw), "intake");
        fields = applyFieldOperations(fields, parsed.operations, parsed.patch);
      } catch {
        continue;
      }
    }
    next = { ...next, fields };
  }
  const changed =
    stored.portrait?.completed !== next.portrait?.completed ||
    stored.supplementing !== next.supplementing ||
    JSON.stringify(stored.fields) !== JSON.stringify(next.fields);
  if (!changed) return stored;
  await persistProfilePayload(next);
  return next;
}

export async function getProfileWorkspace(input: { cursor?: string | null } = {}): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const stored = await healStoredPortrait(await readStoredProfilePayload());
  const dialogue = await listProfileDialoguePage(input);
  const hasMessages = Boolean(dialogue.threadId) && (await prisma.dialogueMessage.count({ where: { threadId: dialogue.threadId } })) > 0;
  const lastAssistant = [...dialogue.messages].reverse().find((item) => item.role === "assistant");
  const published = stored.portrait?.completed ? buildPortrait(stored.fields, true) : null;
  const applyError =
    lastAssistant?.kind === "error" && !isTechnicalErrorBody(lastAssistant.body) && (!published || stored.supplementing)
      ? lastAssistant.body
      : null;
  let phase: ProfileWorkspaceDto["phase"] = "idle";
  if (stored.supplementing) {
    phase = "conversation";
  } else if (published) {
    phase = "portrait";
  } else if (hasMessages && !stored.skipped) {
    phase = "conversation";
  }
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
    mode,
    portrait: published,
    applyError,
    profile: await getProfile(),
    dialogue,
  };
}

class ProfileApplyConflict extends Error {
  constructor() {
    super("PROFILE_APPLY_CONFLICT");
    this.name = "ProfileApplyConflict";
  }
}

const APPLY_RETRIES = 5;

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

async function applyPortraitReply(input: {
  callId: string;
  processingId: string;
  parsed: ProfileAiReply;
  rawText: string;
  promptTokens: number | null;
  completionTokens: number | null;
  snapshotFields: ProfileFieldValue[];
}): Promise<void> {
  for (let attempt = 0; attempt < APPLY_RETRIES; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const { stored, revisionId } = await readStoredProfilePayloadTx(tx);
        const mode = stored.portrait?.completed || stored.supplementing || stored.pending?.mode === "amend" ? "amend" : "intake";
        const baseFields = mode === "amend" ? (stored.pending?.draftFields ?? stored.fields) : stored.fields;
        const merged = applyUnchangedFieldsOnly(
          baseFields,
          input.snapshotFields,
          input.parsed.operations,
          input.parsed.patch,
        );
        const hasChange = baseFields.some((before) => {
          const after = merged.find((field) => field.id === before.id);
          return before.text !== after?.text || before.usage !== after?.usage;
        });
        const completed = decidePortraitComplete({
          fields: merged,
          modelComplete: input.parsed.complete,
          mode,
          hasChange,
          noChange: input.parsed.noChange,
          kind: input.parsed.kind,
          openQuestions: input.parsed.openQuestions,
        });
        const understood = input.parsed.understood || stored.pending?.understood || "";
        const openQuestions = input.parsed.openQuestions;
        let nextStored;
        if (mode === "amend") {
          if (completed) {
            nextStored = {
              fields: merged,
              skipped: false,
              supplementing: false,
              portrait: buildPortrait(merged, true),
              pending: null,
              dialogueSessionStartId: stored.dialogueSessionStartId,
            };
          } else {
            nextStored = {
              fields: stored.fields,
              skipped: false,
              supplementing: true,
              portrait: stored.portrait?.completed ? buildPortrait(stored.fields, true) : stored.portrait,
              pending: {
                mode: "amend" as const,
                understood,
                openQuestions,
                draftFields: merged,
              },
              dialogueSessionStartId: stored.dialogueSessionStartId,
            };
          }
        } else {
          nextStored = {
            fields: merged,
            skipped: false,
            supplementing: false,
            portrait: buildPortrait(merged, completed),
            pending: completed
              ? null
              : {
                  mode: "intake" as const,
                  understood,
                  openQuestions,
                  draftFields: merged,
                },
            dialogueSessionStartId: stored.dialogueSessionStartId,
          };
        }
        const revision = await tx.profileRevision.create({
          data: {
            profileId: LOCAL_PROFILE_ID,
            payloadJson: serializeStoredPayload(nextStored),
          },
        });
        const switched = await tx.creatorProfile.updateMany({
          where: { id: LOCAL_PROFILE_ID, currentRevisionId: revisionId },
          data: { currentRevisionId: revision.id },
        });
        if (switched.count !== 1) throw new ProfileApplyConflict();
        await tx.aiCall.update({
          where: { id: input.callId },
          data: {
            status: "done",
            responseText: input.rawText,
            resultJson: JSON.stringify(input.parsed),
            promptTokens: input.promptTokens,
            completionTokens: input.completionTokens,
          },
        });
        await tx.dialogueMessage.update({
          where: { id: input.processingId },
          data: { kind: completed ? "text" : "question", body: input.parsed.reply, status: "done" },
        });
      });
      return;
    } catch (error) {
      if (error instanceof ProfileApplyConflict) continue;
      throw error;
    }
  }
  throw new ProfileDialogueError("Портрет уже обновился. Повторите ответ — предыдущие смыслы не стёрты.", "STALE", 409);
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
    await persistProfilePayload({
      ...stored,
      skipped: false,
      supplementing: false,
    });
    return getProfileWorkspace();
  }
  const dialogueSessionStartId = await startDialogueSession(FIRST_QUESTION);
  await persistProfilePayload({
    ...stored,
    skipped: false,
    supplementing: false,
    dialogueSessionStartId,
  });
  return getProfileWorkspace();
}

export async function skipProfileDialogue(): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const stored = await readStoredProfilePayload();
  if (stored.portrait?.completed) {
    await persistProfilePayload({
      ...stored,
      skipped: false,
      supplementing: false,
    });
    return getProfileWorkspace();
  }
  await persistProfilePayload({ ...stored, skipped: true, supplementing: false });
  return getProfileWorkspace();
}

export async function supplementProfileDialogue(): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const stored = await readStoredProfilePayload();
  if (stored.dialogueSessionStartId && (stored.pending?.mode === "amend" || stored.supplementing)) {
    await persistProfilePayload({
      ...stored,
      skipped: false,
      supplementing: true,
    });
    return getProfileWorkspace();
  }
  const seedBody = stored.pending?.openQuestions[0]?.trim() || SUPPLEMENT_PROMPT;
  const dialogueSessionStartId = await startDialogueSession(seedBody);
  await persistProfilePayload({
    ...stored,
    skipped: false,
    supplementing: true,
    dialogueSessionStartId,
    pending: stored.pending?.mode === "amend"
      ? stored.pending
      : {
          mode: "amend",
          understood: stored.pending?.understood ?? "",
          openQuestions: stored.pending?.openQuestions ?? [],
          draftFields: stored.pending?.draftFields ?? stored.fields,
        },
  });
  return getProfileWorkspace();
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
  if (existing) return getProfileWorkspace();

  return withAiInflight(`profile-dialogue:${key}`, async () => {
    const raced = await prisma.dialogueMessage.findFirst({
      where: { threadId: thread.id, idempotencyKey: key },
    });
    if (raced) return getProfileWorkspace();
    await assertDailyTokenBudget();

    const userMessage = await prisma.dialogueMessage.create({
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
        body: "Собираю портрет…",
        status: "pending",
      },
    });

    const stored = await readStoredProfilePayload();
    const mode = stored.portrait?.completed || stored.supplementing || stored.pending?.mode === "amend" ? "amend" : "intake";
    const workingFields = mode === "amend" ? (stored.pending?.draftFields ?? stored.fields) : stored.fields;
    const userPrompt = `${profileChecklistPrompt(workingFields, {
      mode,
      understood: stored.pending?.understood,
      openQuestions: stored.pending?.openQuestions,
    })}

Недавняя переписка:
${await recentStoredText(thread.id, userMessage.id)}

Ответ автора: ${text}`;

    const call = await prisma.aiCall.create({
      data: {
        kind: PROFILE_DIALOGUE_KIND,
        reelId: null,
        profileId: LOCAL_PROFILE_ID,
        model: LLM_MODEL,
        status: "running",
        promptText: userPrompt,
        inputSnapshotJson: JSON.stringify({
          text,
          profileId: LOCAL_PROFILE_ID,
          mode,
          playbook: false,
          fields: workingFields,
        }),
      },
    });

    try {
      const raw = await complete({
        model: LLM_MODEL,
        system: PROFILE_DIALOGUE_SYSTEM,
        user: userPrompt,
        label: "profile_dialogue",
      });
      const parsed = parseProfileAiReply(parseJsonObject(raw.text), mode);
      await applyPortraitReply({
        callId: call.id,
        processingId: processing.id,
        parsed,
        rawText: raw.text,
        promptTokens: raw.usage?.promptTokens ?? null,
        completionTokens: raw.usage?.completionTokens ?? null,
        snapshotFields: workingFields,
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
  const dir = await mkdtemp(path.join(tmpdir(), "vocal-profile-voice-"));
  const rawPath = path.join(dir, "reply.webm");
  const mp3Path = path.join(dir, "reply.mp3");
  try {
    if (!input.file.size) {
      throw new ProfileDialogueError("Голосовой файл пуст. Запишите голос заново.", "VOICE_EMPTY");
    }
    await writeFile(rawPath, Buffer.from(await input.file.arrayBuffer()));
    try {
      await extract(rawPath, mp3Path);
    } catch {
      throw new ProfileDialogueError("Не удалось подготовить голосовой ответ. Запишите голос заново.", "STT_PREPARE");
    }
    let stt;
    try {
      stt = await transcribe(mp3Path);
    } catch {
      throw new ProfileDialogueError("Не удалось расшифровать голос. Повторите отправку или запишите заново.", "STT_FAILED");
    }
    const text = stt.text.trim();
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
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
