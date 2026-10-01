import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { defaultCompleteJson, LLM_MODEL, parseJsonObject } from "@/lib/ai/complete";
import { aiOperationKey, assertDailyTokenBudget, withAiInflight } from "@/lib/ai/usage-guard";
import { loadAcceptedCorrectionTimes } from "@/lib/c00-stale";
import { getReelContext } from "@/lib/reel-context";
import { ReelError } from "@/lib/reels";
import {
  createAcceptedScriptFromText,
  listScriptWorkspace,
  ScriptError,
} from "@/lib/scripts";
import {
  getThoughtState,
  isNonContentUtterance,
  normalizeDialogueUtterance,
  ThoughtStateError,
  type ThoughtFact,
} from "@/lib/thought-state";
import { SCRIPT_PROMPT_VERSION, type ScriptWorkspaceDto, type V05GenerateSnapshot, type V05WorldSnapshot } from "@/types/script";
import type { CompleteJsonFn } from "@/types/review";
import { z } from "zod";

const scriptSchema = z.object({
  script: z.string().min(1),
});

export class ScriptReadinessError extends ScriptError {
  constructor(
    message: string,
    readonly blockReason: string,
    readonly nextQuestion: { text: string; gapId: string | null } | null,
  ) {
    super(message, "NOT_READY", 400);
    this.name = "ScriptReadinessError";
  }
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function scriptTurnKey(reelId: string, idempotencyKey: string) {
  return `script:${reelId}:${idempotencyKey}`;
}

export function worldFingerprint(world: V05WorldSnapshot): string {
  return JSON.stringify({
    thoughtStateRevision: world.thoughtStateRevision,
    workingTakeId: world.workingTakeId,
    selectedTranscriptId: world.selectedTranscriptId,
    lastUserMessageId: world.lastUserMessageId,
    lastCorrectionAcceptedAt: world.lastCorrectionAcceptedAt,
  });
}

export function isV05WorldStale(origin: V05WorldSnapshot, current: V05WorldSnapshot, kept?: V05WorldSnapshot | null): boolean {
  const now = worldFingerprint(current);
  if (now === worldFingerprint(origin)) return false;
  if (kept && now === worldFingerprint(kept)) return false;
  return true;
}

export function parseV05GenerateSnapshot(raw: string | null | undefined): V05GenerateSnapshot | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<V05GenerateSnapshot>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.reelId !== "string" || typeof parsed.ownerUserId !== "string") return null;
    if (typeof parsed.thoughtStateRevision !== "number") return null;
    return {
      ownerUserId: parsed.ownerUserId,
      reelId: parsed.reelId,
      thoughtStateRevision: parsed.thoughtStateRevision,
      workingTakeId: parsed.workingTakeId ?? null,
      selectedTranscriptId: parsed.selectedTranscriptId ?? null,
      lastUserMessageId: parsed.lastUserMessageId ?? null,
      lastCorrectionAcceptedAt: parsed.lastCorrectionAcceptedAt ?? null,
      sourceKeys: Array.isArray(parsed.sourceKeys) ? parsed.sourceKeys.filter((item): item is string => typeof item === "string") : [],
      idempotencyKey: typeof parsed.idempotencyKey === "string" ? parsed.idempotencyKey : "",
      draftId: parsed.draftId ?? null,
      draftSaveToken: typeof parsed.draftSaveToken === "number" ? parsed.draftSaveToken : null,
      kept: parsed.kept && typeof parsed.kept === "object" ? {
        thoughtStateRevision: parsed.kept.thoughtStateRevision,
        workingTakeId: parsed.kept.workingTakeId ?? null,
        selectedTranscriptId: parsed.kept.selectedTranscriptId ?? null,
        lastUserMessageId: parsed.kept.lastUserMessageId ?? null,
        lastCorrectionAcceptedAt: parsed.kept.lastCorrectionAcceptedAt ?? null,
      } : null,
    };
  } catch {
    return null;
  }
}

type ScriptDb = typeof prisma | Prisma.TransactionClient;

const EMPTY_THOUGHT = {
  revision: 0,
  intent: "",
  position: "",
  takeTask: "",
  facts: [] as ThoughtFact[],
  openGaps: [] as { id: string; text: string; status: "open" | "resolved" }[],
  decisions: [] as string[],
};

async function thoughtOrEmpty(reelId: string) {
  try {
    return await getThoughtState(reelId);
  } catch (error) {
    if (error instanceof ThoughtStateError && error.code === "THOUGHT_STATE_NOT_FOUND") return EMPTY_THOUGHT;
    throw error;
  }
}

async function lastCorrectionStamp(reelId: string): Promise<string | null> {
  const times = await loadAcceptedCorrectionTimes(reelId, prisma);
  if (times.length === 0) return null;
  return times.reduce((latest, item) => (item.getTime() > latest.getTime() ? item : latest)).toISOString();
}

async function lastUserMessageId(reelId: string, db: ScriptDb = prisma): Promise<string | null> {
  const thread = await db.dialogueThread.findFirst({
    where: { reelId },
    select: { id: true },
  });
  if (!thread) return null;
  const row = await db.dialogueMessage.findFirst({
    where: { threadId: thread.id, role: "user" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return row?.id ?? null;
}

async function lastAssistantQuestion(reelId: string): Promise<string | null> {
  const thread = await prisma.dialogueThread.findFirst({
    where: { reelId },
    select: { id: true },
  });
  if (!thread) return null;
  const row = await prisma.dialogueMessage.findFirst({
    where: { threadId: thread.id, role: "assistant", kind: { in: ["question", "text"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { body: true },
  });
  return row?.body?.trim() || null;
}

export async function readV05World(reelId: string): Promise<V05WorldSnapshot> {
  const reel = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
    select: { workingTakeId: true },
  });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  const thought = await thoughtOrEmpty(reelId);
  const take = reel.workingTakeId
    ? await prisma.take.findFirst({
        where: { id: reel.workingTakeId, reelId },
        select: { selectedTranscriptId: true },
      })
    : null;
  return {
    thoughtStateRevision: thought.revision,
    workingTakeId: reel.workingTakeId,
    selectedTranscriptId: take?.selectedTranscriptId ?? null,
    lastUserMessageId: await lastUserMessageId(reelId),
    lastCorrectionAcceptedAt: await lastCorrectionStamp(reelId),
  };
}

function takeMaterialLabel(inputType: string, number: number): string {
  if (number === 1 && inputType === "text") return "Исходная мысль";
  return `Дубль №${number}`;
}

export async function collectV05SourceTexts(reelId: string): Promise<{ keys: string[]; texts: { label: string; text: string }[] }> {
  const thought = await thoughtOrEmpty(reelId);
  const reel = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
    select: { id: true, initialNote: true, workingTakeId: true },
  });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);

  const texts: { label: string; text: string }[] = [];
  const keys: string[] = [];
  const push = (key: string, label: string, text: string) => {
    const body = text.trim();
    if (!body) return;
    if (keys.includes(key)) return;
    keys.push(key);
    texts.push({ label, text: body });
  };

  if (thought.intent.trim()) push("state:intent", "Замысел мысли", thought.intent);
  if (thought.position.trim()) push("state:position", "Позиция автора", thought.position);
  if (thought.takeTask.trim()) push("state:takeTask", "Задача дубля", thought.takeTask);
  for (const decision of thought.decisions) {
    if (decision.trim()) push(`state:decision:${decision.slice(0, 24)}`, "Решение", decision);
  }

  if (reel.initialNote.trim()) {
    const cited = thought.facts.some((fact) => fact.sourceType === "initial_note" && fact.sourceId === reel.id);
    if (cited) push(`note:${reel.id}`, "Исходная мысль", reel.initialNote);
  }

  const workingTake = reel.workingTakeId
    ? await prisma.take.findFirst({
        where: { id: reel.workingTakeId, reelId },
        include: { transcripts: { orderBy: { createdAt: "asc" } } },
      })
    : null;
  if (workingTake) {
    const selected =
      workingTake.transcripts.find((row) => row.id === workingTake.selectedTranscriptId) ??
      workingTake.transcripts[0];
    const label = takeMaterialLabel(workingTake.inputType, workingTake.number);
    if (selected?.text.trim()) {
      push(`transcript:${selected.id}`, workingTake.inputType === "text" ? label : `Точная расшифровка · ${label}`, selected.text);
    } else if (workingTake.bodyText.trim()) {
      push(`take:${workingTake.id}`, label, workingTake.bodyText);
    }
  }

  for (const fact of thought.facts) {
    await pushFactSource(reelId, fact, push);
  }

  return { keys, texts };
}

async function pushFactSource(
  reelId: string,
  fact: ThoughtFact,
  push: (key: string, label: string, text: string) => void,
) {
  if (fact.sourceType === "initial_note") {
    push(`fact:${fact.id}`, "Факт мысли", fact.text);
    return;
  }
  if (fact.sourceType === "transcript_revision") {
    const revision = await prisma.transcriptRevision.findFirst({
      where: { id: fact.sourceId, take: { reelId } },
      include: { take: { select: { number: true, inputType: true } } },
    });
    if (!revision?.text.trim()) return;
    const label = takeMaterialLabel(revision.take.inputType, revision.take.number);
    push(
      `transcript:${revision.id}`,
      revision.take.inputType === "text" ? label : `Точная расшифровка · ${label}`,
      revision.text,
    );
    return;
  }
  const message = await prisma.dialogueMessage.findFirst({
    where: { id: fact.sourceId, role: "user", thread: { reelId } },
    select: { id: true, body: true },
  });
  if (!message?.body.trim()) return;
  const normalized = normalizeDialogueUtterance(message.body);
  if (isNonContentUtterance(normalized)) return;
  push(`message:${message.id}`, "Сообщение автора", message.body);
}

export async function evaluateScriptReadiness(reelId: string): Promise<{
  ready: boolean;
  blockReason: string | null;
  nextQuestion: { text: string; gapId: string | null } | null;
}> {
  const thought = await thoughtOrEmpty(reelId);
  const openGaps = thought.openGaps.filter((gap) => gap.status === "open");
  const { texts } = await collectV05SourceTexts(reelId);
  const substance = texts.some((item) => item.text.trim());
  if (!substance) {
    return {
      ready: false,
      blockReason: "Недостаточно авторского материала, чтобы собрать прямую речь без додумывания.",
      nextQuestion: {
        text: (await lastAssistantQuestion(reelId)) || "Что вы хотите сказать в этом ролике своими словами?",
        gapId: openGaps[0]?.id ?? null,
      },
    };
  }
  if (openGaps.length > 0) {
    const gap = openGaps[0];
    return {
      ready: false,
      blockReason: gap.text,
      nextQuestion: {
        text: (await lastAssistantQuestion(reelId)) || gap.text,
        gapId: gap.id,
      },
    };
  }
  return { ready: true, blockReason: null, nextQuestion: null };
}

export function v05TabPhase(input: {
  ready: boolean;
  hasScript: boolean;
  stale: boolean;
  generating: boolean;
}): ScriptWorkspaceDto["phase"] {
  if (input.generating) return "generating";
  if (input.hasScript && input.stale) return "stale";
  if (input.hasScript) return "ready";
  if (!input.ready) return "not_ready";
  return "ready_to_generate";
}

export async function computeScriptTabState(reelId: string, workspace: {
  readyCount: number;
  draft: { body: string } | null;
  viewing: { id: string } | null;
  versions: { id: string }[];
}): Promise<{
  phase: ScriptWorkspaceDto["phase"];
  stale: boolean;
  canGenerate: boolean;
  blockReason: string | null;
  nextQuestion: { text: string; gapId: string | null } | null;
}> {
  const readiness = await evaluateScriptReadiness(reelId);
  const generating = Boolean(
    await prisma.aiCall.findFirst({
      where: { reelId, kind: "script", status: { in: ["running", "queued"] }, ownerUserId: ownerUserId() },
      select: { id: true },
    }),
  );
  const hasScript = workspace.readyCount > 0 || Boolean(workspace.draft?.body.trim());
  const stale = await computeV05Stale(reelId);
  const phase = v05TabPhase({ ready: readiness.ready, hasScript, stale, generating });
  return {
    phase,
    stale,
    canGenerate: readiness.ready && !generating,
    blockReason: readiness.ready ? null : readiness.blockReason,
    nextQuestion: readiness.nextQuestion,
  };
}

async function headReadyVersion(reelId: string) {
  const rows = await prisma.scriptVersion.findMany({
    where: { reelId, kind: { in: ["manual", "restore", "accepted_ai"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, inputSnapshotJson: true },
  });
  return rows[0] ?? null;
}

export async function computeV05Stale(reelId: string): Promise<boolean> {
  const current = await readV05World(reelId);
  const head = await headReadyVersion(reelId);
  if (!head) {
    const draft = await prisma.scriptDraft.findUnique({ where: { reelId } });
    if (!draft) return false;
    return isV05WorldStale(
      {
        thoughtStateRevision: -1,
        workingTakeId: null,
        selectedTranscriptId: null,
        lastUserMessageId: null,
        lastCorrectionAcceptedAt: null,
      },
      current,
    ) && Boolean(current.lastUserMessageId);
  }
  const snap = parseV05GenerateSnapshot(head.inputSnapshotJson);
  if (snap) {
    return isV05WorldStale(snap, current, snap.kept);
  }
  if (current.lastUserMessageId) {
    const message = await prisma.dialogueMessage.findUnique({
      where: { id: current.lastUserMessageId },
      select: { createdAt: true },
    });
    if (message && message.createdAt.getTime() > head.createdAt.getTime()) return true;
  }
  return false;
}

export async function keepCurrentScript(reelId: string): Promise<ScriptWorkspaceDto> {
  const owned = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
    select: { id: true },
  });
  if (!owned) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  const head = await headReadyVersion(reelId);
  if (!head) throw new ScriptError("Нет версии сценария, которую можно оставить.", "SCRIPT_NOT_FOUND", 404);
  const current = await readV05World(reelId);
  const origin = parseV05GenerateSnapshot(head.inputSnapshotJson);
  const originWorld: V05WorldSnapshot = origin
    ? {
        thoughtStateRevision: origin.thoughtStateRevision,
        workingTakeId: origin.workingTakeId,
        selectedTranscriptId: origin.selectedTranscriptId,
        lastUserMessageId: origin.lastUserMessageId,
        lastCorrectionAcceptedAt: origin.lastCorrectionAcceptedAt,
      }
    : {
        thoughtStateRevision: 0,
        workingTakeId: null,
        selectedTranscriptId: null,
        lastUserMessageId: null,
        lastCorrectionAcceptedAt: null,
      };
  const next: V05GenerateSnapshot = {
    ownerUserId: origin?.ownerUserId ?? ownerUserId(),
    reelId: origin?.reelId ?? reelId,
    ...originWorld,
    sourceKeys: origin?.sourceKeys ?? [],
    idempotencyKey: origin?.idempotencyKey ?? "",
    draftId: origin?.draftId ?? null,
    draftSaveToken: origin?.draftSaveToken ?? null,
    kept: current,
  };
  await prisma.scriptVersion.update({
    where: { id: head.id },
    data: { inputSnapshotJson: JSON.stringify(next) },
  });
  return listScriptWorkspace(reelId);
}

async function replayGenerated(reelId: string, turnKey: string): Promise<ScriptWorkspaceDto | null> {
  const call = await prisma.aiCall.findUnique({
    where: { turnKey },
    select: { status: true, resultJson: true },
  });
  if (!call || call.status !== "done" || !call.resultJson) return null;
  try {
    const parsed = JSON.parse(call.resultJson) as { versionId?: string };
    if (typeof parsed.versionId !== "string") return null;
    const version = await prisma.scriptVersion.findFirst({ where: { id: parsed.versionId, reelId } });
    if (!version) return null;
    return listScriptWorkspace(reelId, version.id);
  } catch {
    return null;
  }
}

export async function generateV05Script(
  reelId: string,
  input: { idempotencyKey: string },
  complete: CompleteJsonFn = defaultCompleteJson,
): Promise<ScriptWorkspaceDto> {
  const key = input.idempotencyKey.trim();
  if (!key) throw new ScriptError("Нужен ключ повтора.", "IDEMPOTENCY");
  const reel = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
  });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);

  const turnKey = scriptTurnKey(reelId, key);
  const replay = await replayGenerated(reelId, turnKey);
  if (replay) return replay;

  const readiness = await evaluateScriptReadiness(reelId);
  if (!readiness.ready) {
    throw new ScriptReadinessError(
      readiness.blockReason ?? "Сценарий пока нельзя собрать.",
      readiness.blockReason ?? "Сценарий пока нельзя собрать.",
      readiness.nextQuestion,
    );
  }

  return withAiInflight(
    aiOperationKey({
      ownerUserId: ownerUserId(),
      objectType: "reel",
      objectId: reelId,
      operationType: "script",
      idempotencyKey: key,
    }),
    async () => {
      const again = await replayGenerated(reelId, turnKey);
      if (again) return again;
      await assertDailyTokenBudget();
      const sources = await collectV05SourceTexts(reelId);
      if (sources.texts.length === 0) {
        throw new ScriptError("Недостаточно авторского материала для сценария.", "SOURCES_EMPTY");
      }
      const draft = await prisma.scriptDraft.findUnique({ where: { reelId } });
      const world = await readV05World(reelId);
      const snapshot: V05GenerateSnapshot = {
        ownerUserId: ownerUserId(),
        reelId,
        ...world,
        sourceKeys: sources.keys,
        idempotencyKey: key,
        draftId: draft?.id ?? null,
        draftSaveToken: draft?.saveToken ?? null,
        kept: null,
      };
      const context = await getReelContext(reelId);
      const userPrompt = `Собери черновик прямой речи только из материалов автора ниже. Не придумывай факты, события и выводы. Портрет — только тон, не сюжет.
Замысел карточки: ${context.live.reelGoal || "не указан"}
Аудитория карточки: ${context.live.reelAudience || "не указана"}
Тон портрета (не факты мысли): ${JSON.stringify(context.live.publicForScript)}
Материал автора:
${sources.texts.map((item, index) => `${index + 1}. ${item.label}\n${item.text}`).join("\n\n")}
JSON: {"script":""}`;

      let call;
      try {
        call = await prisma.aiCall.create({
          data: {
            kind: "script",
            reelId,
            model: LLM_MODEL,
            status: "running",
            ownerUserId: ownerUserId(),
            turnKey,
            promptText: userPrompt,
            inputSnapshotJson: JSON.stringify(snapshot),
          },
        });
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
        const existingCall = await prisma.aiCall.findUnique({ where: { turnKey } });
        if (existingCall?.status === "done") {
          const existing = await replayGenerated(reelId, turnKey);
          if (existing) return existing;
        }
        if (existingCall?.status === "error") {
          call = await prisma.aiCall.update({
            where: { id: existingCall.id },
            data: {
              status: "running",
              errorMessage: null,
              promptText: userPrompt,
              inputSnapshotJson: JSON.stringify(snapshot),
            },
          });
        } else {
          throw error;
        }
      }

      try {
        const raw = await complete({
          model: LLM_MODEL,
          system:
            "Ты собираешь черновик сценария — текст прямой речи для следующего дубля. Только материал автора. Не используй портрет как источник событий. Не копируй чужие истории. Не добавляй CTA. Верни только JSON.",
          user: userPrompt,
          label: "script",
        });
        let parsedUnknown: unknown;
        try {
          parsedUnknown = parseJsonObject(raw.text);
        } catch {
          throw new ScriptError("Пустой или некорректный ответ модели не сохранён как сценарий.", "LLM_INVALID");
        }
        const parsed = scriptSchema.safeParse(parsedUnknown);
        if (!parsed.success) {
          throw new ScriptError("Пустой или некорректный ответ модели не сохранён как сценарий.", "LLM_INVALID");
        }

        const version = await prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Reel" WHERE id = ${reelId} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "ThoughtState" WHERE "reelId" = ${reelId} FOR UPDATE`;
          const liveThought = await tx.thoughtState.findFirst({ where: { reelId } });
          const liveReel = await tx.reel.findFirst({ where: { id: reelId }, select: { workingTakeId: true } });
          const liveTake = liveReel?.workingTakeId
            ? await tx.take.findFirst({
                where: { id: liveReel.workingTakeId, reelId },
                select: { selectedTranscriptId: true },
              })
            : null;
          const liveMessage = await lastUserMessageId(reelId, tx);
          const live: V05WorldSnapshot = {
            thoughtStateRevision: liveThought?.revision ?? 0,
            workingTakeId: liveReel?.workingTakeId ?? null,
            selectedTranscriptId: liveTake?.selectedTranscriptId ?? null,
            lastUserMessageId: liveMessage,
            lastCorrectionAcceptedAt: await lastCorrectionStamp(reelId),
          };
          const liveDraft = await tx.scriptDraft.findUnique({ where: { reelId } });
          if (worldFingerprint(live) !== worldFingerprint(world)) {
            throw new ScriptError("Данные мысли изменились. Повторите сбор сценария.", "SNAPSHOT_CONFLICT", 409);
          }
          if ((liveDraft?.saveToken ?? null) !== snapshot.draftSaveToken || (liveDraft?.id ?? null) !== snapshot.draftId) {
            throw new ScriptError("Черновик сценария изменился. Результат не записан.", "DRAFT_CHANGED", 409);
          }
          const created = await createAcceptedScriptFromText(
            reelId,
            {
              body: parsed.data.script,
              model: LLM_MODEL,
              promptVersion: SCRIPT_PROMPT_VERSION,
              inputSnapshotJson: JSON.stringify(snapshot),
            },
            tx,
          );
          await tx.aiCall.update({
            where: { id: call.id },
            data: {
              status: "done",
              responseText: raw.text,
              resultJson: JSON.stringify({ versionId: created.id }),
              promptTokens: raw.usage?.promptTokens ?? null,
              completionTokens: raw.usage?.completionTokens ?? null,
            },
          });
          return created;
        });
        return listScriptWorkspace(reelId, version.id);
      } catch (error) {
        await prisma.aiCall.update({
          where: { id: call.id },
          data: {
            status: "error",
            errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Ошибка модели.",
          },
        });
        throw error;
      }
    },
  );
}
