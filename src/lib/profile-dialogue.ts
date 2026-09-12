import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { defaultCompleteJson, LLM_MODEL, parseJsonObject } from "@/lib/ai/complete";
import { PROFILE_DIALOGUE_KIND, PROFILE_DIALOGUE_SYSTEM, parseProfileAiReply, profileChecklistPrompt } from "@/lib/ai/profile";
import { assertDailyTokenBudget, withAiInflight } from "@/lib/ai/usage-guard";
import { extractAudio } from "@/lib/ffmpeg";
import { transcribeAudio } from "@/lib/stt";
import { decodeDialogueCursor, pageDialogueItems } from "@/lib/dialogue-cursor";
import { ensureLocalProfile, getProfile, persistProfilePayload, readStoredProfilePayload } from "@/lib/profile";
import { buildPortrait, decidePortraitComplete, mergeProfileFields } from "@/lib/profile-portrait";
import { LOCAL_PROFILE_ID } from "@/types/profile";
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
  "Я задаю по одному вопросу и собираю портрет для сценариев: цели, опыт, темы, подача и границы. Можно пропускать то, о чём не хотите говорить. Если какой-то факт можно использовать в тексте ролика — скажите об этом обычным ответом.\n\nС чего начнём: зачем вы хотите записывать ролики?";

const SUPPLEMENT_PROMPT =
  "Что хотите уточнить в портрете — цель, опыт, темы, подачу или границы? Можно просто сказать, что изменилось.";

type Payload = {
  voiceDurationLabel?: string;
};

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

export async function listProfileDialoguePage(input: { cursor?: string | null; limit?: number } = {}): Promise<DialoguePageDto> {
  const thread = await prisma.dialogueThread.findUnique({ where: { profileId: LOCAL_PROFILE_ID } });
  if (!thread) {
    return { threadId: "", messages: [], nextCursor: null, analyzing: false };
  }
  const rows = await prisma.dialogueMessage.findMany({
    where: { threadId: thread.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const items = rows.map(asDto);
  const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 50) : PROFILE_DIALOGUE_PAGE_SIZE;
  const paged = pageDialogueItems(items, { cursor: decodeDialogueCursor(input.cursor), limit });
  return {
    threadId: thread.id,
    messages: paged.page,
    nextCursor: paged.nextCursor,
    analyzing: items.some((item) => item.status === "pending"),
  };
}

export async function getProfileWorkspace(input: { cursor?: string | null } = {}): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const stored = await readStoredProfilePayload();
  const dialogue = await listProfileDialoguePage(input);
  const hasMessages = Boolean(dialogue.threadId) && (await prisma.dialogueMessage.count({ where: { threadId: dialogue.threadId } })) > 0;
  const lastAssistant = [...dialogue.messages].reverse().find((item) => item.role === "assistant");
  const applyError = lastAssistant?.kind === "error" ? lastAssistant.body : null;
  const portrait = stored.portrait?.completed ? buildPortrait(stored.fields, true) : stored.portrait;
  let phase: ProfileWorkspaceDto["phase"] = "idle";
  if (stored.supplementing) {
    phase = "conversation";
  } else if (stored.portrait?.completed && (portrait?.sections.length ?? 0) > 0) {
    phase = "portrait";
  } else if (hasMessages && !stored.skipped) {
    phase = "conversation";
  }
  return {
    phase,
    skipped: stored.skipped,
    supplementing: stored.supplementing,
    portrait,
    applyError,
    profile: await getProfile(),
    dialogue,
  };
}

async function recentStoredText(threadId: string): Promise<string> {
  const rows = await prisma.dialogueMessage.findMany({
    where: { threadId, kind: { not: "processing" } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 12,
  });
  return rows
    .reverse()
    .map((row) => `${row.role}: ${row.body}`)
    .join("\n");
}

async function seedAssistant(threadId: string, body: string) {
  const existing = await prisma.dialogueMessage.count({ where: { threadId } });
  if (existing > 0) return;
  await prisma.dialogueMessage.create({
    data: {
      threadId,
      role: "assistant",
      kind: "question",
      body,
      status: "done",
    },
  });
}

export async function startProfileDialogue(): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const stored = await readStoredProfilePayload();
  await persistProfilePayload({ ...stored, skipped: false, supplementing: false });
  const thread = await ensureProfileThread();
  await seedAssistant(thread.id, FIRST_QUESTION);
  return getProfileWorkspace();
}

export async function skipProfileDialogue(): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const stored = await readStoredProfilePayload();
  await persistProfilePayload({ ...stored, skipped: true, supplementing: false });
  return getProfileWorkspace();
}

export async function supplementProfileDialogue(): Promise<ProfileWorkspaceDto & { dialogue: DialoguePageDto }> {
  const stored = await readStoredProfilePayload();
  await persistProfilePayload({ ...stored, skipped: false, supplementing: true });
  const thread = await ensureProfileThread();
  await prisma.dialogueMessage.create({
    data: {
      threadId: thread.id,
      role: "assistant",
      kind: "question",
      body: SUPPLEMENT_PROMPT,
      status: "done",
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
        body: "Собираю портрет…",
        status: "pending",
      },
    });

    const stored = await readStoredProfilePayload();
    const userPrompt = `${profileChecklistPrompt(stored.fields)}

Недавняя переписка:
${await recentStoredText(thread.id)}

Ответ автора: ${text}`;

    const call = await prisma.aiCall.create({
      data: {
        kind: PROFILE_DIALOGUE_KIND,
        reelId: null,
        profileId: LOCAL_PROFILE_ID,
        model: LLM_MODEL,
        status: "running",
        promptText: userPrompt,
        inputSnapshotJson: JSON.stringify({ text, profileId: LOCAL_PROFILE_ID, playbook: false }),
      },
    });

    try {
      const raw = await complete({
        model: LLM_MODEL,
        system: PROFILE_DIALOGUE_SYSTEM,
        user: userPrompt,
        label: "profile_dialogue",
      });
      const parsed = parseProfileAiReply(parseJsonObject(raw.text));
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

      const merged = mergeProfileFields(stored.fields, parsed.patch);
      const patchHadText = Object.values(parsed.patch).some((item) => (item?.text ?? "").trim().length > 0);
      const completed = decidePortraitComplete({
        fields: merged,
        modelComplete: parsed.complete,
        supplementing: stored.supplementing,
        patchHadText,
      });
      const portrait = buildPortrait(merged, completed);
      await persistProfilePayload({
        fields: merged,
        skipped: false,
        supplementing: stored.supplementing && !completed,
        portrait,
      });
      await prisma.dialogueMessage.update({
        where: { id: processing.id },
        data: { kind: completed ? "text" : "question", body: parsed.reply, status: "done" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось обновить портрет.";
      await prisma.aiCall.update({
        where: { id: call.id },
        data: { status: "error", errorMessage: message },
      });
      await prisma.dialogueMessage.update({
        where: { id: processing.id },
        data: { kind: "error", body: message, status: "error" },
      });
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
