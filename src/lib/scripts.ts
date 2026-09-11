import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

type ScriptDb = PrismaClient | Prisma.TransactionClient;
import { ReelError } from "@/lib/reels";
import {
  SCRIPT_BODY_MAX,
  emptyRecording,
  isHeadKind,
  isScriptKind,
  type RecordingCardDto,
  type ScriptBundleDto,
  type ScriptKind,
  type ScriptSourceOption,
  type ScriptSourceRef,
  type ScriptVersionDto,
} from "@/types/script";

export class ScriptError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ScriptError";
  }
}

function parseRecording(raw: string | null | undefined): RecordingCardDto {
  const empty = emptyRecording();
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<RecordingCardDto>;
    return {
      opening: typeof parsed.opening === "string" ? parsed.opening : "",
      supports: typeof parsed.supports === "string" ? parsed.supports : "",
      example: typeof parsed.example === "string" ? parsed.example : "",
      ending: typeof parsed.ending === "string" ? parsed.ending : "",
    };
  } catch {
    return empty;
  }
}

function parseSources(raw: string | null | undefined): ScriptSourceRef[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ScriptSourceRef => {
      return (
        item !== null &&
        typeof item === "object" &&
        typeof (item as ScriptSourceRef).type === "string" &&
        typeof (item as ScriptSourceRef).id === "string"
      );
    });
  } catch {
    return [];
  }
}

function parseIdeas(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function toDto(row: {
  id: string;
  reelId: string;
  kind: string;
  body: string;
  recordingJson: string;
  sourcesJson: string;
  parentId: string | null;
  contextSnapshotId: string | null;
  model: string | null;
  promptVersion: string | null;
  inventedIdeasJson: string;
  createdAt: Date;
}): ScriptVersionDto {
  return {
    id: row.id,
    reelId: row.reelId,
    kind: isScriptKind(row.kind) ? row.kind : "manual",
    body: row.body,
    recording: parseRecording(row.recordingJson),
    sources: parseSources(row.sourcesJson),
    parentId: row.parentId,
    contextSnapshotId: row.contextSnapshotId,
    model: row.model,
    promptVersion: row.promptVersion,
    inventedIdeas: parseIdeas(row.inventedIdeasJson),
    createdAt: row.createdAt.toISOString(),
  };
}

function normalizeRecording(input?: Partial<RecordingCardDto> | null): RecordingCardDto {
  const base = emptyRecording();
  if (!input) return base;
  return {
    opening: typeof input.opening === "string" ? input.opening : "",
    supports: typeof input.supports === "string" ? input.supports : "",
    example: typeof input.example === "string" ? input.example : "",
    ending: typeof input.ending === "string" ? input.ending : "",
  };
}

async function assertReel(reelId: string) {
  const reel = await prisma.reel.findUnique({ where: { id: reelId } });
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  return reel;
}

export async function getScriptHeadId(reelId: string): Promise<string | null> {
  const rows = await prisma.scriptVersion.findMany({
    where: { reelId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true },
  });
  return rows.find((row) => isHeadKind(row.kind))?.id ?? null;
}

export async function listAvailableSources(reelId: string): Promise<ScriptSourceOption[]> {
  const reel = await assertReel(reelId);
  const options: ScriptSourceOption[] = [];
  if (reel.initialNote.trim()) {
    options.push({ type: "note", id: reel.id, label: "Заметка карточки" });
  }
  const takes = await prisma.take.findMany({
    where: { reelId },
    orderBy: { number: "asc" },
    include: { transcripts: { orderBy: { createdAt: "asc" } } },
  });
  for (const take of takes) {
    const selected = take.transcripts.find((row) => row.id === take.selectedTranscriptId) ?? take.transcripts[0];
    if (selected?.text.trim()) {
      options.push({
        type: "transcript",
        id: selected.id,
        label: `Расшифровка дубля №${take.number}`,
      });
    }
  }
  const questions = await prisma.question.findMany({
    where: { reelId },
    include: { answers: { orderBy: { createdAt: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });
  for (const question of questions) {
    const answer = question.answers.at(-1);
    if (answer?.text.trim()) {
      options.push({
        type: "answer",
        id: answer.id,
        label: `Ответ: ${question.text.slice(0, 60)}`,
      });
    }
  }
  const scripts = await prisma.scriptVersion.findMany({
    where: { reelId, kind: { not: "ai_proposal" } },
    orderBy: { createdAt: "desc" },
  });
  for (const script of scripts) {
    options.push({ type: "script", id: script.id, label: `Сценарий ${script.createdAt.toISOString()}` });
  }
  return options;
}

export function parseSourceRefs(raw: unknown): ScriptSourceRef[] {
  if (!Array.isArray(raw)) return [];
  const out: ScriptSourceRef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const type = (item as ScriptSourceRef).type;
    const id = (item as ScriptSourceRef).id;
    if (typeof type !== "string" || typeof id !== "string" || !id.trim()) continue;
    if (!["transcript", "answer", "note", "script"].includes(type)) {
      throw new ScriptError("Неизвестный тип источника сценария.", "SOURCE_TYPE");
    }
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: type as ScriptSourceRef["type"], id: id.trim() });
  }
  return out;
}

export async function resolveSources(reelId: string, refs: ScriptSourceRef[]): Promise<ScriptSourceRef[]> {
  const allowed = await listAvailableSources(reelId);
  const allowedIds = new Map(allowed.map((item) => [`${item.type}:${item.id}`, item]));
  const out: ScriptSourceRef[] = [];
  for (const ref of refs) {
    const key = `${ref.type}:${ref.id}`;
    const hit = allowedIds.get(key);
    if (!hit) {
      throw new ScriptError("Источник не принадлежит этой карточке.", "SOURCE_FOREIGN");
    }
    if (out.some((item) => `${item.type}:${item.id}` === key)) continue;
    out.push({ type: hit.type, id: hit.id, label: hit.label });
  }
  return out;
}

export async function listScriptBundle(reelId: string): Promise<ScriptBundleDto> {
  const reel = await assertReel(reelId);
  const versions = await prisma.scriptVersion.findMany({
    where: { reelId },
    orderBy: { createdAt: "desc" },
  });
  return {
    reelId,
    headId: versions.find((row) => isHeadKind(row.kind))?.id ?? null,
    selectedScriptId: reel.selectedScriptId,
    finalScriptId: reel.finalScriptId,
    versions: versions.map(toDto),
    sources: await listAvailableSources(reelId),
  };
}

async function createVersion(
  reelId: string,
  input: {
    kind: ScriptKind;
    body: string;
    recording?: Partial<RecordingCardDto> | null;
    sources?: ScriptSourceRef[];
    parentId?: string | null;
    contextSnapshotId?: string | null;
    model?: string | null;
    promptVersion?: string | null;
    inventedIdeas?: string[];
    inputSnapshotJson?: string | null;
    select?: boolean;
  },
  db: ScriptDb = prisma,
): Promise<ScriptVersionDto> {
  const body = input.body.trim();
  if (!body) throw new ScriptError("Введите текст сценария.", "SCRIPT_REQUIRED");
  if (body.length > SCRIPT_BODY_MAX) {
    throw new ScriptError(`Сценарий короче ${SCRIPT_BODY_MAX} символов.`, "SCRIPT_TOO_LONG");
  }
  const sources = await resolveSources(reelId, input.sources ?? []);
  const created = await db.scriptVersion.create({
    data: {
      reelId,
      kind: input.kind,
      body,
      recordingJson: JSON.stringify(normalizeRecording(input.recording)),
      sourcesJson: JSON.stringify(sources),
      parentId: input.parentId ?? null,
      contextSnapshotId: input.contextSnapshotId ?? null,
      model: input.model ?? null,
      promptVersion: input.promptVersion ?? null,
      inventedIdeasJson: JSON.stringify(input.inventedIdeas ?? []),
      inputSnapshotJson: input.inputSnapshotJson ?? null,
    },
  });
  if (input.select !== false && isHeadKind(input.kind)) {
    await db.reel.update({
      where: { id: reelId },
      data: { selectedScriptId: created.id },
    });
  }
  return toDto(created);
}

export async function saveManualScript(
  reelId: string,
  input: {
    body: string;
    recording?: Partial<RecordingCardDto> | null;
    sources?: ScriptSourceRef[];
    expectedHeadId?: string | null;
  },
): Promise<ScriptBundleDto> {
  await assertReel(reelId);
  const headId = await getScriptHeadId(reelId);
  const expected = input.expectedHeadId === undefined ? headId : input.expectedHeadId;
  if (expected !== headId) {
    throw new ScriptError("Сценарий уже изменился. Обновите и повторите.", "STALE", 409);
  }
  await createVersion(reelId, {
    kind: "manual",
    body: input.body,
    recording: input.recording,
    sources: input.sources,
  });
  return listScriptBundle(reelId);
}

export async function restoreScript(
  reelId: string,
  scriptId: string,
  expectedHeadId?: string | null,
): Promise<ScriptBundleDto> {
  await assertReel(reelId);
  const source = await prisma.scriptVersion.findFirst({ where: { id: scriptId, reelId } });
  if (!source) throw new ScriptError("Версия сценария не найдена.", "SCRIPT_NOT_FOUND", 404);
  const headId = await getScriptHeadId(reelId);
  const expected = expectedHeadId === undefined ? headId : expectedHeadId;
  if (expected !== headId) {
    throw new ScriptError("Сценарий уже изменился. Обновите и повторите.", "STALE", 409);
  }
  await createVersion(reelId, {
    kind: "restore",
    body: source.body,
    recording: parseRecording(source.recordingJson),
    sources: parseSources(source.sourcesJson),
    parentId: source.id,
  });
  return listScriptBundle(reelId);
}

export async function setFinalScript(reelId: string, scriptId: string | null): Promise<ScriptBundleDto> {
  await assertReel(reelId);
  if (scriptId) {
    const row = await prisma.scriptVersion.findFirst({ where: { id: scriptId, reelId } });
    if (!row) throw new ScriptError("Версия сценария не найдена.", "SCRIPT_NOT_FOUND", 404);
  }
  await prisma.reel.update({
    where: { id: reelId },
    data: { finalScriptId: scriptId },
  });
  return listScriptBundle(reelId);
}

export async function acceptScriptProposal(
  reelId: string,
  proposalId: string,
  expectedHeadId?: string | null,
): Promise<ScriptBundleDto> {
  const proposal = await prisma.scriptVersion.findFirst({ where: { id: proposalId, reelId, kind: "ai_proposal" } });
  if (!proposal) throw new ScriptError("Предложение модели не найдено.", "PROPOSAL_NOT_FOUND", 404);
  const headId = await getScriptHeadId(reelId);
  const expected = expectedHeadId === undefined ? headId : expectedHeadId;
  if (expected !== headId) {
    throw new ScriptError("Сценарий уже изменился. Обновите и повторите.", "STALE", 409);
  }
  await createVersion(reelId, {
    kind: "accepted_ai",
    body: proposal.body,
    recording: parseRecording(proposal.recordingJson),
    sources: parseSources(proposal.sourcesJson),
    parentId: proposal.id,
    contextSnapshotId: proposal.contextSnapshotId,
    model: proposal.model,
    promptVersion: proposal.promptVersion,
    inventedIdeas: parseIdeas(proposal.inventedIdeasJson),
  });
  return listScriptBundle(reelId);
}

export async function createAcceptedScriptFromText(
  reelId: string,
  input: { body: string; model?: string | null; inputSnapshotJson?: string | null },
  db: ScriptDb = prisma,
): Promise<ScriptVersionDto> {
  return createVersion(
    reelId,
    {
      kind: "accepted_ai",
      body: input.body,
      model: input.model,
      inputSnapshotJson: input.inputSnapshotJson,
    },
    db,
  );
}

export async function insertProposalVersion(
  reelId: string,
  input: {
    body: string;
    recording?: Partial<RecordingCardDto> | null;
    sources?: ScriptSourceRef[];
    contextSnapshotId?: string | null;
    model?: string | null;
    promptVersion?: string | null;
    inventedIdeas?: string[];
    inputSnapshotJson?: string | null;
  },
): Promise<ScriptVersionDto> {
  return createVersion(reelId, { ...input, kind: "ai_proposal", select: false });
}

export async function assertScriptOnReel(reelId: string, scriptId: string) {
  const row = await prisma.scriptVersion.findFirst({ where: { id: scriptId, reelId } });
  if (!row) throw new ScriptError("Версия сценария не найдена в этой карточке.", "SCRIPT_NOT_IN_REEL");
  return row;
}

export async function loadSourceTexts(reelId: string, refs: ScriptSourceRef[]): Promise<{ label: string; text: string }[]> {
  const resolved = await resolveSources(reelId, refs);
  const out: { label: string; text: string }[] = [];
  for (const ref of resolved) {
    if (ref.type === "note") {
      const reel = await prisma.reel.findUnique({ where: { id: reelId } });
      out.push({ label: ref.label ?? "Заметка", text: reel?.initialNote ?? "" });
    } else if (ref.type === "transcript") {
      const row = await prisma.transcriptRevision.findFirst({
        where: { id: ref.id, take: { reelId } },
      });
      if (row) out.push({ label: ref.label ?? "Расшифровка", text: row.text });
    } else if (ref.type === "answer") {
      const row = await prisma.answer.findFirst({
        where: { id: ref.id, question: { reelId } },
      });
      if (row) out.push({ label: ref.label ?? "Ответ", text: row.text });
    } else if (ref.type === "script") {
      const row = await prisma.scriptVersion.findFirst({ where: { id: ref.id, reelId } });
      if (row) out.push({ label: ref.label ?? "Сценарий", text: row.body });
    }
  }
  return out;
}
