import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { gatewayComplete } from "@/lib/ai/gateway";
import { defaultCompleteJson, LLM_MODEL, parseJsonObject } from "@/lib/ai/complete";
import { aiOperationKey, AiInflightError, assertDailyTokenBudget, withAiInflight } from "@/lib/ai/usage-guard";
import { listAcceptedC00Corrections } from "@/lib/c00-envelope";
import { loadAcceptedCorrectionTimes } from "@/lib/c00-stale";
import { getReelContext } from "@/lib/reel-context";
import { ReelError } from "@/lib/reels";
import { createAcceptedScriptFromText, listScriptWorkspace, ScriptError } from "@/lib/scripts";
import {
  isNonContentUtterance,
  normalizeDialogueUtterance,
  parseFacts,
  parseThoughtStateLists,
  type ThoughtFact,
  type ThoughtFactSourceType,
  type ThoughtGap,
} from "@/lib/thought-state";
import { v05TestSeams } from "@/lib/v05-test-seams";
import { SCRIPT_PROMPT_VERSION, isHeadKind, type ScriptWorkspaceDto, type V05GenerateSnapshot, type V05WorldSnapshot } from "@/types/script";
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

export function draftKeepTurnKey(reelId: string) {
  return `script-keep:${reelId}:draft`;
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
    const originRevision = typeof parsed.thoughtStateRevision === "number" ? parsed.thoughtStateRevision : null;
    return {
      ownerUserId: parsed.ownerUserId,
      reelId: parsed.reelId,
      thoughtStateRevision: originRevision ?? Number.NaN,
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

function originWorld(snap: V05GenerateSnapshot | null): V05WorldSnapshot | null {
  if (!snap || !Number.isFinite(snap.thoughtStateRevision)) return null;
  return {
    thoughtStateRevision: snap.thoughtStateRevision,
    workingTakeId: snap.workingTakeId,
    selectedTranscriptId: snap.selectedTranscriptId,
    lastUserMessageId: snap.lastUserMessageId,
    lastCorrectionAcceptedAt: snap.lastCorrectionAcceptedAt,
  };
}

type ScriptDb = typeof prisma | Prisma.TransactionClient;

type LoadedThought = {
  revision: number;
  intent: string;
  position: string;
  takeTask: string;
  facts: ThoughtFact[];
  openGaps: ThoughtGap[];
  decisions: string[];
  updatedAt: Date;
};

type V05Material = {
  thought: LoadedThought | null;
  world: V05WorldSnapshot;
  draftId: string | null;
  draftSaveToken: number | null;
  draftUpdatedAt: Date | null;
  draftBaseVersionId: string | null;
  workingTake: { id: string; number: number; inputType: string; bodyText: string; selectedTranscriptId: string | null } | null;
  selectedTranscript: { id: string; text: string } | null;
  keys: string[];
  texts: { label: string; text: string }[];
};

export async function lastCorrectionStamp(reelId: string, db: ScriptDb = prisma): Promise<string | null> {
  const times = await loadAcceptedCorrectionTimes(reelId, db);
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

function takeMaterialLabel(inputType: string, number: number): string {
  if (number === 1 && inputType === "text") return "Исходная мысль";
  return `Дубль №${number}`;
}

async function loadThought(reelId: string, db: ScriptDb): Promise<LoadedThought | null> {
  const row = await db.thoughtState.findFirst({
    where: { reelId, reel: { ownerUserId: ownerUserId() } },
  });
  if (!row) return null;
  return { ...parseThoughtStateLists(row), revision: row.revision, intent: row.intent, position: row.position, takeTask: row.takeTask, updatedAt: row.updatedAt };
}

async function loadFactCorrections(reelId: string, db: ScriptDb) {
  const rows = await db.aiCall.findMany({
    where: { reelId, kind: "dialogue", status: "done" },
    select: { id: true, resultJson: true, promptText: true, inputSnapshotJson: true },
  });
  return listAcceptedC00Corrections(rows)
    .filter((row) => row.correction.targetKind === "fact")
    .map((row) => {
      const call = rows.find((item) => item.id === row.aiCallId);
      return {
        ...row,
        promptText: call?.promptText ?? null,
        inputSnapshotJson: call?.inputSnapshotJson ?? null,
      };
    });
}

function parseJsonObjectAfterLabel(text: string, label: string): Record<string, unknown> | null {
  const idx = text.indexOf(label);
  if (idx < 0) return null;
  const start = text.indexOf("{", idx + label.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1)) as unknown;
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function thoughtFactsFromDialogueCall(input: { promptText: string | null; inputSnapshotJson: string | null }): ThoughtFact[] | null {
  if (input.inputSnapshotJson?.trim()) {
    try {
      const snap = JSON.parse(input.inputSnapshotJson) as { thoughtFacts?: unknown };
      if (snap.thoughtFacts !== undefined) return parseFacts(snap.thoughtFacts);
    } catch {
      /* journal snapshot without structured facts */
    }
  }
  if (!input.promptText) return null;
  const thought = parseJsonObjectAfterLabel(input.promptText, "Состояние мысли:");
  if (!thought || thought.facts === undefined) return null;
  try {
    return parseFacts(thought.facts);
  } catch {
    return null;
  }
}

function snapshotTranscriptRevisionId(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { transcriptRevisionId?: unknown };
    return typeof parsed.transcriptRevisionId === "string" && parsed.transcriptRevisionId.trim()
      ? parsed.transcriptRevisionId
      : null;
  } catch {
    return null;
  }
}

function rawSourceKey(sourceType: ThoughtFactSourceType | "take", sourceId: string) {
  return `${sourceType}:${sourceId}`;
}

type ExcludedRawSources = {
  exact: Set<string>;
  conservativeTranscriptIds: Set<string>;
  creationTakeIds: Set<string>;
  creationOriginalRevisionIds: Set<string>;
};

async function loadCreationTextOrigin(reelId: string, db: ScriptDb) {
  const take = await db.take.findFirst({
    where: { reelId, number: 1, inputType: "text" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (!take) return null;
  const original = await db.transcriptRevision.findFirst({
    where: { takeId: take.id, kind: "original" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return { takeId: take.id, originalRevisionId: original?.id ?? null };
}

async function loadExcludedRawSources(reelId: string, db: ScriptDb): Promise<ExcludedRawSources> {
  const exact = new Set<string>();
  const conservativeTranscriptIds = new Set<string>();
  const creationTakeIds = new Set<string>();
  const creationOriginalRevisionIds = new Set<string>();
  const corrections = await loadFactCorrections(reelId, db);
  for (const row of corrections) {
    const facts = thoughtFactsFromDialogueCall(row);
    const target = facts?.find((fact) => fact.id === row.correction.targetId);
    if (target) {
      exact.add(rawSourceKey(target.sourceType, target.sourceId));
      if (target.sourceType === "initial_note" && target.sourceId === reelId) {
        const origin = await loadCreationTextOrigin(reelId, db);
        if (origin) {
          creationTakeIds.add(origin.takeId);
          if (origin.originalRevisionId) {
            creationOriginalRevisionIds.add(origin.originalRevisionId);
            exact.add(rawSourceKey("transcript_revision", origin.originalRevisionId));
          }
        }
      }
      continue;
    }
    const freezeTranscriptId = snapshotTranscriptRevisionId(row.inputSnapshotJson);
    if (freezeTranscriptId) conservativeTranscriptIds.add(freezeTranscriptId);
  }
  return { exact, conservativeTranscriptIds, creationTakeIds, creationOriginalRevisionIds };
}

function omitWorkingRaw(input: {
  selectedTranscriptId: string | null;
  workingTakeId: string | null;
  citedTranscriptIds: Set<string>;
  excluded: ExcludedRawSources;
}) {
  const selected = input.selectedTranscriptId;
  if (selected && input.citedTranscriptIds.has(selected)) return true;
  if (selected && input.excluded.exact.has(rawSourceKey("transcript_revision", selected))) return true;
  if (selected && input.excluded.creationOriginalRevisionIds.has(selected)) return true;
  if (selected && input.excluded.conservativeTranscriptIds.has(selected)) return true;
  if (input.workingTakeId && input.excluded.exact.has(rawSourceKey("take", input.workingTakeId))) {
    if (!selected || input.excluded.creationOriginalRevisionIds.has(selected)) return true;
  }
  if (!selected && input.workingTakeId && input.excluded.creationTakeIds.has(input.workingTakeId)) return true;
  return false;
}

export function isCraftInstruction(text: string) {
  const normalized = normalizeDialogueUtterance(text);
  return (
    normalized === "говорить короче" ||
    normalized === "снять дубль" ||
    normalized === "сними дубль" ||
    normalized === "запиши дубль" ||
    normalized === "короче"
  );
}

function pushSource(keys: string[], texts: { label: string; text: string }[], key: string, label: string, text: string) {
  const body = text.trim();
  if (!body || keys.includes(key)) return;
  keys.push(key);
  texts.push({ label, text: body });
}

async function collectFromLoaded(reelId: string, material: Omit<V05Material, "keys" | "texts">, db: ScriptDb): Promise<{ keys: string[]; texts: { label: string; text: string }[] }> {
  const keys: string[] = [];
  const texts: { label: string; text: string }[] = [];
  const thought = material.thought;
  if (thought) {
    if (thought.intent.trim()) pushSource(keys, texts, "state:intent", "Замысел мысли", thought.intent);
    if (thought.position.trim()) pushSource(keys, texts, "state:position", "Позиция автора", thought.position);
    if (thought.takeTask.trim()) pushSource(keys, texts, "state:takeTask", "Задача дубля", thought.takeTask);
    for (const decision of thought.decisions) {
      if (decision.trim()) pushSource(keys, texts, `state:decision:${decision.slice(0, 24)}`, "Решение", decision);
    }
    for (const fact of thought.facts) {
      pushSource(keys, texts, `fact:${fact.id}`, "Факт мысли", fact.text);
    }
  }

  const citedTranscriptIds = new Set(
    (thought?.facts ?? []).filter((fact) => fact.sourceType === "transcript_revision").map((fact) => fact.sourceId),
  );
  const excluded = await loadExcludedRawSources(reelId, db);
  const rawWorkingTainted = omitWorkingRaw({
    selectedTranscriptId: material.selectedTranscript?.id ?? null,
    workingTakeId: material.workingTake?.id ?? null,
    citedTranscriptIds,
    excluded,
  });
  if (!rawWorkingTainted && material.workingTake?.inputType === "text") {
    const label = takeMaterialLabel("text", material.workingTake.number);
    const body = material.selectedTranscript?.text.trim() || material.workingTake.bodyText.trim();
    if (body && !(material.selectedTranscript && citedTranscriptIds.has(material.selectedTranscript.id))) {
      pushSource(keys, texts, material.selectedTranscript ? `transcript:${material.selectedTranscript.id}` : `take:${material.workingTake.id}`, label, body);
    }
  } else if (!rawWorkingTainted && material.selectedTranscript && !citedTranscriptIds.has(material.selectedTranscript.id)) {
    const label = material.workingTake
      ? `Точная расшифровка · ${takeMaterialLabel(material.workingTake.inputType, material.workingTake.number)}`
      : "Точная расшифровка";
    pushSource(keys, texts, `transcript:${material.selectedTranscript.id}`, label, material.selectedTranscript.text);
  }

  const reel = await db.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
    select: { id: true, initialNote: true },
  });
  if (reel?.initialNote.trim() && thought?.facts.some((fact) => fact.sourceType === "initial_note" && fact.sourceId === reel.id)) {
    /* fact.text already included */
  }

  for (const fact of thought?.facts ?? []) {
    if (fact.sourceType !== "dialogue_message") continue;
    const message = await db.dialogueMessage.findFirst({
      where: { id: fact.sourceId, role: "user", thread: { reelId } },
      select: { id: true, body: true },
    });
    if (!message) continue;
    const normalized = normalizeDialogueUtterance(message.body);
    if (isNonContentUtterance(normalized)) continue;
  }

  return { keys, texts };
}

export async function loadV05Material(reelId: string, db: ScriptDb = prisma): Promise<V05Material> {
  const reel = await db.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
    select: { id: true, workingTakeId: true },
  });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  const thought = await loadThought(reelId, db);
  const workingTake = reel.workingTakeId
    ? await db.take.findFirst({
        where: { id: reel.workingTakeId, reelId },
        select: { id: true, number: true, inputType: true, bodyText: true, selectedTranscriptId: true },
      })
    : null;
  const selectedTranscript = workingTake?.selectedTranscriptId
    ? await db.transcriptRevision.findFirst({
        where: { id: workingTake.selectedTranscriptId, takeId: workingTake.id },
        select: { id: true, text: true },
      })
    : null;
  const draft = await db.scriptDraft.findUnique({ where: { reelId } });
  const world: V05WorldSnapshot = {
    thoughtStateRevision: thought?.revision ?? Number.NaN,
    workingTakeId: reel.workingTakeId,
    selectedTranscriptId: workingTake?.selectedTranscriptId ?? null,
    lastUserMessageId: await lastUserMessageId(reelId, db),
    lastCorrectionAcceptedAt: await lastCorrectionStamp(reelId, db),
  };
  const base = {
    thought,
    world,
    draftId: draft?.id ?? null,
    draftSaveToken: draft?.saveToken ?? null,
    draftUpdatedAt: draft?.updatedAt ?? null,
    draftBaseVersionId: draft?.baseVersionId ?? null,
    workingTake,
    selectedTranscript,
  };
  const sources = await collectFromLoaded(reelId, base, db);
  return { ...base, ...sources };
}

function evaluateReadiness(material: V05Material): {
  ready: boolean;
  blockReason: string | null;
  nextQuestion: { text: string; gapId: string | null } | null;
} {
  if (!material.thought || !Number.isFinite(material.world.thoughtStateRevision)) {
    return {
      ready: false,
      blockReason: "Нет актуального состояния мысли.",
      nextQuestion: { text: "Сформулируйте мысль своими словами — что вы хотите сказать?", gapId: null },
    };
  }
  const recorded = Boolean(material.workingTake && material.workingTake.inputType !== "text");
  if (recorded && !material.workingTake?.selectedTranscriptId) {
    return {
      ready: false,
      blockReason: "Не выбрана точная расшифровка рабочего дубля.",
      nextQuestion: { text: "Какую точную расшифровку рабочего дубля использовать?", gapId: null },
    };
  }
  const openGaps = material.thought.openGaps.filter((gap) => gap.status === "open");
  if (openGaps.length > 0) {
    const gap = openGaps[0];
    return {
      ready: false,
      blockReason: gap.text,
      nextQuestion: { text: gap.text, gapId: gap.id },
    };
  }
  const authorTexts = material.texts.filter((item) => {
    if (item.label === "Задача дубля") return false;
    return !isCraftInstruction(item.text);
  });
  const structured = Boolean(
    material.thought.position.trim() ||
      (material.thought.intent.trim() && !isCraftInstruction(material.thought.intent)) ||
      material.thought.facts.some((fact) => fact.text.trim()) ||
      material.thought.decisions.some((item) => item.trim() && !isCraftInstruction(item)) ||
      authorTexts.length > 0,
  );
  if (structured) {
    return { ready: true, blockReason: null, nextQuestion: null };
  }
  return {
    ready: false,
    blockReason: "Недостаточно авторского материала, чтобы собрать прямую речь без додумывания.",
    nextQuestion: { text: "Что вы хотите сказать в этом ролике своими словами?", gapId: null },
  };
}

export async function evaluateScriptReadiness(reelId: string): Promise<{
  ready: boolean;
  blockReason: string | null;
  nextQuestion: { text: string; gapId: string | null } | null;
}> {
  const material = await loadV05Material(reelId);
  return evaluateReadiness(material);
}

export async function collectV05SourceTexts(reelId: string): Promise<{ keys: string[]; texts: { label: string; text: string }[] }> {
  const material = await loadV05Material(reelId);
  return { keys: material.keys, texts: material.texts };
}

export async function readV05World(reelId: string, db: ScriptDb = prisma): Promise<V05WorldSnapshot> {
  const material = await loadV05Material(reelId, db);
  return material.world;
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

function heuristicStale(input: {
  createdAt: Date;
  current: V05WorldSnapshot;
  thoughtUpdatedAt: Date | null;
  workingTakeCreatedAt: Date | null;
  selectedTranscriptCreatedAt: Date | null;
  lastUserMessageCreatedAt: Date | null;
  lastCorrectionAt: Date | null;
}): boolean {
  if (input.thoughtUpdatedAt && input.thoughtUpdatedAt.getTime() > input.createdAt.getTime()) return true;
  if (input.workingTakeCreatedAt && input.workingTakeCreatedAt.getTime() > input.createdAt.getTime()) return true;
  if (input.selectedTranscriptCreatedAt && input.selectedTranscriptCreatedAt.getTime() > input.createdAt.getTime()) return true;
  if (input.lastUserMessageCreatedAt && input.lastUserMessageCreatedAt.getTime() > input.createdAt.getTime()) return true;
  if (input.lastCorrectionAt && input.lastCorrectionAt.getTime() > input.createdAt.getTime()) return true;
  return false;
}

async function staleEvidence(reelId: string, current: V05WorldSnapshot, db: ScriptDb) {
  const thought = await db.thoughtState.findFirst({ where: { reelId }, select: { updatedAt: true } });
  const take = current.workingTakeId
    ? await db.take.findFirst({ where: { id: current.workingTakeId, reelId }, select: { createdAt: true } })
    : null;
  const transcript = current.selectedTranscriptId
    ? await db.transcriptRevision.findFirst({ where: { id: current.selectedTranscriptId }, select: { createdAt: true } })
    : null;
  const message = current.lastUserMessageId
    ? await db.dialogueMessage.findUnique({ where: { id: current.lastUserMessageId }, select: { createdAt: true } })
    : null;
  const lastCorrectionAt = current.lastCorrectionAcceptedAt ? new Date(current.lastCorrectionAcceptedAt) : null;
  return {
    thoughtUpdatedAt: thought?.updatedAt ?? null,
    workingTakeCreatedAt: take?.createdAt ?? null,
    selectedTranscriptCreatedAt: transcript?.createdAt ?? null,
    lastUserMessageCreatedAt: message?.createdAt ?? null,
    lastCorrectionAt,
  };
}

export function versionKeepApplicable(snap: V05GenerateSnapshot | null, current: V05WorldSnapshot) {
  return Boolean(snap?.kept && worldFingerprint(snap.kept) === worldFingerprint(current));
}

export function draftKeepApplicable(
  keep: V05GenerateSnapshot | null,
  draft: { id: string; saveToken?: number },
  current: V05WorldSnapshot,
) {
  if (!keep?.kept || keep.draftId !== draft.id) return false;
  if (typeof keep.draftSaveToken === "number" && typeof draft.saveToken === "number" && keep.draftSaveToken !== draft.saveToken) {
    return false;
  }
  if (typeof keep.draftSaveToken === "number" && typeof draft.saveToken !== "number") return false;
  return worldFingerprint(keep.kept) === worldFingerprint(current);
}

async function originObjectStale(input: {
  reelId: string;
  snapshotJson: string | null | undefined;
  createdAt: Date;
  current: V05WorldSnapshot;
  db: ScriptDb;
}): Promise<boolean> {
  const snap = parseV05GenerateSnapshot(input.snapshotJson);
  const origin = originWorld(snap);
  if (origin) return worldFingerprint(origin) !== worldFingerprint(input.current);
  const evidence = await staleEvidence(input.reelId, input.current, input.db);
  return heuristicStale({ createdAt: input.createdAt, current: input.current, ...evidence });
}

export async function isSnapshotObjectStale(input: {
  reelId: string;
  snapshotJson: string | null | undefined;
  createdAt: Date;
  current: V05WorldSnapshot;
  db?: ScriptDb;
}): Promise<boolean> {
  const db = input.db ?? prisma;
  const snap = parseV05GenerateSnapshot(input.snapshotJson);
  const originStale = await originObjectStale({ ...input, db });
  if (versionKeepApplicable(snap, input.current)) return false;
  return originStale;
}

async function loadDraftKeepSnapshot(reelId: string, db: ScriptDb): Promise<V05GenerateSnapshot | null> {
  const row = await db.aiCall.findUnique({
    where: { turnKey: draftKeepTurnKey(reelId) },
    select: { inputSnapshotJson: true },
  });
  return parseV05GenerateSnapshot(row?.inputSnapshotJson);
}

export async function computeViewingStale(reelId: string, viewingId: string | null, current: V05WorldSnapshot, db: ScriptDb = prisma) {
  if (!viewingId) return false;
  const version = await db.scriptVersion.findFirst({
    where: { id: viewingId, reelId },
    select: { createdAt: true, inputSnapshotJson: true },
  });
  if (!version) return false;
  return isSnapshotObjectStale({
    reelId,
    snapshotJson: version.inputSnapshotJson,
    createdAt: version.createdAt,
    current,
    db,
  });
}

export async function computeDraftStale(
  reelId: string,
  draft: { id: string; updatedAt: string; stale?: boolean; baseVersionId: string | null; saveToken?: number } | null,
  current: V05WorldSnapshot,
  db: ScriptDb = prisma,
) {
  if (!draft) return false;
  const c00 = Boolean(draft.stale);
  let originStale = false;
  if (draft.baseVersionId) {
    const base = await db.scriptVersion.findFirst({
      where: { id: draft.baseVersionId, reelId },
      select: { createdAt: true, inputSnapshotJson: true },
    });
    if (base) {
      originStale = await originObjectStale({
        reelId,
        snapshotJson: base.inputSnapshotJson,
        createdAt: base.createdAt,
        current,
        db,
      });
    }
  } else {
    originStale = await originObjectStale({
      reelId,
      snapshotJson: null,
      createdAt: new Date(draft.updatedAt),
      current,
      db,
    });
  }
  const objective = c00 || originStale;
  const keep = await loadDraftKeepSnapshot(reelId, db);
  if (draftKeepApplicable(keep, { id: draft.id, saveToken: draft.saveToken }, current)) return false;
  return objective;
}

export async function computeViewedStale(reelId: string, input: {
  viewingId: string | null;
  viewingCreatedAt?: string | null;
  draft: { id: string; updatedAt: string; stale?: boolean; baseVersionId: string | null; saveToken?: number } | null;
}): Promise<boolean> {
  const current = await readV05World(reelId);
  if (input.viewingId) return computeViewingStale(reelId, input.viewingId, current);
  return computeDraftStale(reelId, input.draft, current);
}

export async function computeV05Stale(reelId: string): Promise<boolean> {
  const workspace = await prisma.scriptVersion.findFirst({
    where: { reelId, kind: { in: ["manual", "restore", "accepted_ai"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const draft = await prisma.scriptDraft.findUnique({ where: { reelId } });
  return computeViewedStale(reelId, {
    viewingId: workspace?.id ?? null,
    draft: draft
      ? { id: draft.id, updatedAt: draft.updatedAt.toISOString(), baseVersionId: draft.baseVersionId, stale: false }
      : null,
  });
}

export async function computeScriptTabState(reelId: string, workspace: {
  readyCount: number;
  draft: { id: string; body: string; updatedAt: string; stale?: boolean; baseVersionId: string | null; saveToken?: number } | null;
  viewing: { id: string; createdAt: string } | null;
  versions: { id: string; kind?: string }[];
}): Promise<{
  phase: ScriptWorkspaceDto["phase"];
  stale: boolean;
  viewingStale: boolean;
  draftStale: boolean;
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
  // from_take is a base for the cycle, not a generated script: it does not move the V05 phase (until R4).
  const hasScript = workspace.versions.some((row) => (row.kind === undefined || (isHeadKind(row.kind) && row.kind !== "from_take"))) || Boolean(workspace.draft?.body.trim());
  const current = await readV05World(reelId);
  const viewingStale = await computeViewingStale(reelId, workspace.viewing?.id ?? null, current);
  const draftStale = await computeDraftStale(reelId, workspace.draft, current);
  const stale = workspace.viewing ? viewingStale : draftStale;
  const phase = v05TabPhase({ ready: readiness.ready, hasScript, stale, generating });
  return {
    phase,
    stale,
    viewingStale,
    draftStale,
    canGenerate: readiness.ready && !generating,
    blockReason: readiness.ready ? null : readiness.blockReason,
    nextQuestion: readiness.ready ? null : readiness.nextQuestion,
  };
}

async function persistKeepSnapshot(input: { reelId: string; snapshotJson: string; turnKey: string }, db: ScriptDb = prisma) {
  const existing = await db.aiCall.findUnique({ where: { turnKey: input.turnKey }, select: { id: true } });
  if (existing) {
    await db.aiCall.update({
      where: { id: existing.id },
      data: { status: "done", inputSnapshotJson: input.snapshotJson, resultJson: JSON.stringify({ keep: true }) },
    });
    return;
  }
  await db.aiCall.create({
    data: {
      kind: "script",
      reelId: input.reelId,
      model: "keep",
      status: "done",
      ownerUserId: ownerUserId(),
      turnKey: input.turnKey,
      promptText: "keep",
      inputSnapshotJson: input.snapshotJson,
      resultJson: JSON.stringify({ keep: true }),
    },
  });
}

function keepVersionRecord(reelId: string, origin: V05GenerateSnapshot | null, current: V05WorldSnapshot): string {
  const base: Record<string, unknown> = {
    ownerUserId: origin?.ownerUserId ?? ownerUserId(),
    reelId: origin?.reelId ?? reelId,
    sourceKeys: origin?.sourceKeys ?? [],
    idempotencyKey: origin?.idempotencyKey ?? "",
    draftId: origin?.draftId ?? null,
    draftSaveToken: origin?.draftSaveToken ?? null,
    kept: current,
  };
  if (origin && Number.isFinite(origin.thoughtStateRevision)) {
    base.thoughtStateRevision = origin.thoughtStateRevision;
    base.workingTakeId = origin.workingTakeId;
    base.selectedTranscriptId = origin.selectedTranscriptId;
    base.lastUserMessageId = origin.lastUserMessageId;
    base.lastCorrectionAcceptedAt = origin.lastCorrectionAcceptedAt;
  }
  return JSON.stringify(base);
}

function keepDraftRecord(reelId: string, draft: { id: string; saveToken: number }, current: V05WorldSnapshot): string {
  return JSON.stringify({
    ownerUserId: ownerUserId(),
    reelId,
    draftId: draft.id,
    draftSaveToken: draft.saveToken,
    kept: current,
  });
}

export async function keepCurrentScript(
  reelId: string,
  target: { versionId?: string | null; draftId?: string; expectedSaveToken?: number; draft?: boolean } = {},
): Promise<ScriptWorkspaceDto> {
  const viewId = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Reel" WHERE id = ${reelId} FOR UPDATE`;
    const owned = await tx.reel.findFirst({
      where: { id: reelId, ownerUserId: ownerUserId() },
      select: { id: true },
    });
    if (!owned) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
    const current = await readV05World(reelId, tx);
    if (target.draftId || target.draft) {
      const draft = await tx.scriptDraft.findUnique({ where: { reelId } });
      if (!draft) throw new ScriptError("Нет черновика, который можно оставить.", "SCRIPT_NOT_FOUND", 404);
      if (target.draftId && draft.id !== target.draftId) {
        throw new ScriptError("Черновик уже изменился. Обновите и повторите.", "KEEP_TARGET_CHANGED", 409);
      }
      if (typeof target.expectedSaveToken === "number" && draft.saveToken !== target.expectedSaveToken) {
        throw new ScriptError("Черновик уже изменился. Обновите и повторите.", "KEEP_TARGET_CHANGED", 409);
      }
      await persistKeepSnapshot({
        reelId,
        turnKey: draftKeepTurnKey(reelId),
        snapshotJson: keepDraftRecord(reelId, draft, current),
      }, tx);
      return null;
    }
    const version = target.versionId
      ? await tx.scriptVersion.findFirst({ where: { id: target.versionId, reelId } })
      : await tx.scriptVersion.findFirst({
          where: { reelId, kind: { in: ["manual", "restore", "accepted_ai"] } },
          orderBy: { createdAt: "desc" },
        });
    if (!version) throw new ScriptError("Нет версии сценария, которую можно оставить.", "SCRIPT_NOT_FOUND", 404);
    if (target.versionId && version.id !== target.versionId) {
      throw new ScriptError("Версия сценария уже изменилась. Обновите и повторите.", "KEEP_TARGET_CHANGED", 409);
    }
    const origin = parseV05GenerateSnapshot(version.inputSnapshotJson);
    await tx.scriptVersion.update({
      where: { id: version.id },
      data: { inputSnapshotJson: keepVersionRecord(reelId, origin, current) },
    });
    return version.id;
  });
  return listScriptWorkspace(reelId, viewId);
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

export async function claimErrorScriptCall(input: {
  turnKey: string;
  promptText: string;
  inputSnapshotJson: string;
}): Promise<{ id: string } | null> {
  const claimed = await prisma.aiCall.updateMany({
    where: { turnKey: input.turnKey, status: "error" },
    data: {
      status: "running",
      errorMessage: null,
      promptText: input.promptText,
      inputSnapshotJson: input.inputSnapshotJson,
    },
  });
  if (claimed.count !== 1) return null;
  if (v05TestSeams.afterErrorClaim) await v05TestSeams.afterErrorClaim();
  return prisma.aiCall.findUnique({ where: { turnKey: input.turnKey }, select: { id: true } });
}

async function lockThoughtWorld(tx: Prisma.TransactionClient, reelId: string) {
  await tx.$queryRaw`SELECT id FROM "Reel" WHERE id = ${reelId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "ThoughtState" WHERE "reelId" = ${reelId} FOR UPDATE`;
}

function buildUserPrompt(context: Awaited<ReturnType<typeof getReelContext>>, texts: { label: string; text: string }[]) {
  return `Собери черновик прямой речи только из материалов автора ниже. Не придумывай факты, события и выводы. Портрет — только тон, не сюжет.
Тон портрета (не факты мысли): ${JSON.stringify(context.live.publicForScript)}
Структурированные основания мысли и выбранный материал:
${texts.map((item, index) => `${index + 1}. ${item.label}\n${item.text}`).join("\n\n")}
JSON: {"script":""}`;
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

      const material = await prisma.$transaction(async (tx) => {
        await lockThoughtWorld(tx, reelId);
        return loadV05Material(reelId, tx);
      });
      if (v05TestSeams.afterCollectBeforeFreeze) await v05TestSeams.afterCollectBeforeFreeze();
      const frozen = await prisma.$transaction(async (tx) => {
        await lockThoughtWorld(tx, reelId);
        const live = await loadV05Material(reelId, tx);
        if (worldFingerprint(live.world) !== worldFingerprint(material.world)) {
          throw new ScriptError("Данные мысли изменились. Повторите сбор сценария.", "SNAPSHOT_CONFLICT", 409);
        }
        if ((live.draftSaveToken ?? null) !== (material.draftSaveToken ?? null) || (live.draftId ?? null) !== (material.draftId ?? null)) {
          throw new ScriptError("Черновик сценария изменился. Результат не записан.", "DRAFT_CHANGED", 409);
        }
        return live;
      });

      const readiness = evaluateReadiness(frozen);
      if (!readiness.ready) {
        throw new ScriptReadinessError(
          readiness.blockReason ?? "Сценарий пока нельзя собрать.",
          readiness.blockReason ?? "Сценарий пока нельзя собрать.",
          readiness.nextQuestion,
        );
      }
      if (frozen.texts.length === 0 && !frozen.thought?.position.trim()) {
        throw new ScriptError("Недостаточно авторского материала для сценария.", "SOURCES_EMPTY");
      }

      const snapshot: V05GenerateSnapshot = {
        ownerUserId: ownerUserId(),
        reelId,
        thoughtStateRevision: frozen.world.thoughtStateRevision,
        workingTakeId: frozen.world.workingTakeId,
        selectedTranscriptId: frozen.world.selectedTranscriptId,
        lastUserMessageId: frozen.world.lastUserMessageId,
        lastCorrectionAcceptedAt: frozen.world.lastCorrectionAcceptedAt,
        sourceKeys: frozen.keys,
        idempotencyKey: key,
        draftId: frozen.draftId,
        draftSaveToken: frozen.draftSaveToken,
        kept: null,
      };
      const context = await getReelContext(reelId);
      const userPrompt = buildUserPrompt(context, frozen.texts);

      let call: { id: string };
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
          select: { id: true },
        });
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
        const existingCall = await prisma.aiCall.findUnique({ where: { turnKey } });
        if (existingCall?.status === "done") {
          const existing = await replayGenerated(reelId, turnKey);
          if (existing) return existing;
        }
        if (existingCall?.status === "error") {
          const claimed = await claimErrorScriptCall({
            turnKey,
            promptText: userPrompt,
            inputSnapshotJson: JSON.stringify(snapshot),
          });
          if (!claimed) {
            const after = await replayGenerated(reelId, turnKey);
            if (after) return after;
            throw new AiInflightError();
          }
          call = claimed;
        } else if (existingCall?.status === "running" || existingCall?.status === "queued") {
          throw new AiInflightError();
        } else {
          throw error;
        }
      }

      try {
        const raw = await gatewayComplete(complete, {
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
          await lockThoughtWorld(tx, reelId);
          const live = await loadV05Material(reelId, tx);
          if (worldFingerprint(live.world) !== worldFingerprint(snapshot)) {
            throw new ScriptError("Данные мысли изменились. Повторите сбор сценария.", "SNAPSHOT_CONFLICT", 409);
          }
          if ((live.draftSaveToken ?? null) !== snapshot.draftSaveToken || (live.draftId ?? null) !== snapshot.draftId) {
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

        if (v05TestSeams.afterCommitBeforeWorkspace) await v05TestSeams.afterCommitBeforeWorkspace();
        try {
          return await listScriptWorkspace(reelId, version.id);
        } catch (error) {
          const recovered = await replayGenerated(reelId, turnKey);
          if (recovered) return recovered;
          throw error;
        }
      } catch (error) {
        const running = await prisma.aiCall.findUnique({ where: { id: call.id }, select: { status: true } });
        if (running?.status === "running") {
          await prisma.aiCall.updateMany({
            where: { id: call.id, status: "running" },
            data: {
              status: "error",
              errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Ошибка модели.",
            },
          });
        }
        throw error;
      }
    },
  );
}
