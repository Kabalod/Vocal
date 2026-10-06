import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { ReelError } from "@/lib/reels";
import { enqueueByKey } from "@/lib/write-queue";
import { scriptDraftIsStale } from "@/lib/c00-stale";

type ScriptDb = PrismaClient | Prisma.TransactionClient;
import {
  SCRIPT_BODY_MAX,
  emptyRecording,
  isHeadKind,
  isScriptKind,
  type RecordingCardDto,
  type ScriptBundleDto,
  type ScriptDraftDto,
  type ScriptKind,
  type ScriptSourceOption,
  type ScriptSourceRef,
  type ScriptVersionDto,
  type ScriptVersionMetaDto,
  type ScriptWorkspaceDto,
  scriptOriginLabel,
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
  const reel = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
  });
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
    const selected = take.selectedTranscriptId
      ? take.transcripts.find((row) => row.id === take.selectedTranscriptId)
      : take.inputType === "text"
        ? take.transcripts[0]
        : undefined;
    if (selected?.text.trim()) {
      options.push({
        type: "transcript",
        id: selected.id,
        label: take.inputType === "text"
          ? take.number === 1
            ? "Исходная мысль"
            : `Дубль №${take.number}`
          : `Точная расшифровка · Дубль №${take.number}`,
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
    where: { reelId, kind: { notIn: ["ai_proposal", "from_take"] } },
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
    where: { reelId, kind: { not: "from_take" } },
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

function toDraftDto(
  row: {
    id: string;
    reelId: string;
    body: string;
    sourcesJson: string;
    sourceKind: string;
    baseVersionId: string | null;
    saveToken: number;
    updatedAt: Date;
  },
  takeNumberByTranscriptId?: Map<string, number>,
): ScriptDraftDto {
  const sources = parseSources(row.sourcesJson);
  const kind = row.sourceKind === "vocal" ? "accepted_ai" : "manual";
  return {
    id: row.id,
    reelId: row.reelId,
    body: row.body,
    sources,
    sourceKind: row.sourceKind,
    baseVersionId: row.baseVersionId,
    sourceLabel: scriptOriginLabel(kind, sources, takeNumberByTranscriptId),
    updatedAt: row.updatedAt.toISOString(),
    saveToken: row.saveToken,
  };
}

async function takeNumberMap(reelId: string): Promise<Map<string, number>> {
  const takes = await prisma.take.findMany({
    where: { reelId },
    select: { number: true, transcripts: { select: { id: true } } },
  });
  const map = new Map<string, number>();
  for (const take of takes) {
    for (const transcript of take.transcripts) map.set(transcript.id, take.number);
  }
  return map;
}

function toMeta(
  row: { id: string; reelId: string; kind: string; sourcesJson: string; parentId: string | null; createdAt: Date },
  number: number | null,
  takeNumberByTranscriptId?: Map<string, number>,
): ScriptVersionMetaDto {
  const sources = parseSources(row.sourcesJson);
  return {
    id: row.id,
    reelId: row.reelId,
    kind: isScriptKind(row.kind) ? row.kind : "manual",
    createdAt: row.createdAt.toISOString(),
    sourceLabel: scriptOriginLabel(row.kind, sources, takeNumberByTranscriptId),
    number,
    parentId: row.parentId,
  };
}

export async function getScriptVersion(reelId: string, scriptId: string): Promise<ScriptVersionDto> {
  await assertReel(reelId);
  const row = await prisma.scriptVersion.findFirst({ where: { id: scriptId, reelId } });
  if (!row) throw new ScriptError("Версия сценария не найдена.", "SCRIPT_NOT_FOUND", 404);
  return toDto(row);
}

export async function listScriptWorkspace(reelId: string, viewId?: string | null): Promise<ScriptWorkspaceDto> {
  const reel = await assertReel(reelId);
  const versions = await prisma.scriptVersion.findMany({
    where: { reelId, kind: { not: "from_take" } },
    orderBy: { createdAt: "desc" },
  });
  const takeMap = await takeNumberMap(reelId);
  const readyAsc = [...versions].filter((row) => isHeadKind(row.kind)).sort((a, b) => {
    const byTime = a.createdAt.getTime() - b.createdAt.getTime();
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
  const readyIndex = new Map(readyAsc.map((row, index) => [row.id, index + 1]));
  const headId = versions.find((row) => isHeadKind(row.kind))?.id ?? null;
  const selectedId = viewId || reel.selectedScriptId || headId;
  const viewingRow = selectedId ? versions.find((row) => row.id === selectedId) ?? null : null;
  const draft = await prisma.scriptDraft.findUnique({ where: { reelId } });
  const draftDto = draft ? toDraftDto(draft, takeMap) : null;
  if (draft && draftDto) {
    draftDto.stale = await scriptDraftIsStale({
      reelId,
      updatedAt: draft.updatedAt,
      baseVersionId: draft.baseVersionId,
      db: prisma,
    });
  }
  const workspace = {
    reelId,
    headId,
    selectedScriptId: reel.selectedScriptId,
    finalScriptId: reel.finalScriptId,
    readyCount: readyAsc.length,
    versions: versions.map((row) => toMeta(row, readyIndex.get(row.id) ?? null, takeMap)),
    viewing: viewingRow ? toDto(viewingRow) : null,
    draft: draftDto,
    sources: await listAvailableSources(reelId),
    phase: "empty" as const,
    stale: Boolean(draftDto?.stale),
    viewingStale: false,
    draftStale: Boolean(draftDto?.stale),
    canGenerate: false,
    blockReason: null as string | null,
    viewingChanges: await viewingChangesFor(viewingRow?.id ?? null),
    understanding: null as string | null,
    nextQuestion: null as { text: string; gapId: string | null } | null,
  };
  const { computeScriptTabState } = await import("@/lib/v05-script");
  const tab = await computeScriptTabState(reelId, workspace);
  return { ...workspace, ...tab };
}

async function withReelWriteLock<T>(
  reelId: string,
  db: ScriptDb,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const run = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM "Reel" WHERE id = ${reelId} FOR UPDATE`;
    return fn(tx);
  };
  if ("$transaction" in db && typeof db.$transaction === "function") {
    return db.$transaction((tx) => run(tx));
  }
  return run(db);
}

export async function replaceScriptDraft(
  reelId: string,
  input: {
    body: string;
    baseVersionId?: string | null;
    sourceKind?: string;
    sources?: ScriptSourceRef[];
  },
  db: ScriptDb = prisma,
): Promise<ScriptDraftDto> {
  await assertReel(reelId);
  const body = input.body.trim();
  if (body.length > SCRIPT_BODY_MAX) {
    throw new ScriptError(`Сценарий короче ${SCRIPT_BODY_MAX} символов.`, "SCRIPT_TOO_LONG");
  }
  const sources = input.sources ?? [];
  return withReelWriteLock(reelId, db, async (tx) => {
    const existing = await tx.scriptDraft.findUnique({ where: { reelId } });
    const row = existing
      ? await tx.scriptDraft.update({
          where: { reelId },
          data: {
            body,
            baseVersionId: input.baseVersionId ?? existing.baseVersionId,
            sourceKind: input.sourceKind ?? existing.sourceKind,
            sourcesJson: JSON.stringify(sources.length ? sources : parseSources(existing.sourcesJson)),
            saveToken: existing.saveToken + 1,
          },
        })
      : await tx.scriptDraft.create({
          data: {
            reelId,
            body,
            baseVersionId: input.baseVersionId ?? null,
            sourceKind: input.sourceKind ?? "manual",
            sourcesJson: JSON.stringify(sources),
          },
        });
    return toDraftDto(row);
  });
}

export async function openScriptDraft(reelId: string, baseVersionId?: string | null): Promise<ScriptWorkspaceDto> {
  await assertReel(reelId);
  const existing = await prisma.scriptDraft.findUnique({ where: { reelId } });
  if (existing) return listScriptWorkspace(reelId, baseVersionId);
  const targetId = baseVersionId ?? (await getScriptHeadId(reelId));
  if (!targetId) {
    await replaceScriptDraft(reelId, { body: "", sourceKind: "manual", sources: [] });
    return listScriptWorkspace(reelId);
  }
  const source = await prisma.scriptVersion.findFirst({ where: { id: targetId, reelId } });
  if (!source) throw new ScriptError("Версия сценария не найдена.", "SCRIPT_NOT_FOUND", 404);
  await replaceScriptDraft(reelId, {
    body: source.body,
    baseVersionId: source.id,
    sourceKind: "manual",
    sources: parseSources(source.sourcesJson),
  });
  return listScriptWorkspace(reelId, source.id);
}

function resolveDraftToken(
  draft: { saveToken: number; updatedAt: Date },
  input: { expectedUpdatedAt: string; expectedSaveToken?: number },
): number {
  if (typeof input.expectedSaveToken === "number" && Number.isFinite(input.expectedSaveToken)) {
    if (input.expectedSaveToken !== draft.saveToken) {
      throw new ScriptError("Черновик уже изменился. Обновите и повторите.", "STALE", 409);
    }
    return draft.saveToken;
  }
  if (draft.updatedAt.toISOString() === input.expectedUpdatedAt) return draft.saveToken;
  throw new ScriptError("Черновик уже изменился. Обновите и повторите.", "STALE", 409);
}

export async function patchScriptDraft(
  reelId: string,
  input: { body: string; expectedUpdatedAt: string; expectedSaveToken?: number; sources?: ScriptSourceRef[] },
): Promise<ScriptWorkspaceDto> {
  await assertReel(reelId);
  const body = input.body.trim();
  if (body.length > SCRIPT_BODY_MAX) {
    throw new ScriptError(`Сценарий короче ${SCRIPT_BODY_MAX} символов.`, "SCRIPT_TOO_LONG");
  }
  await withReelWriteLock(reelId, prisma, async (tx) => {
    const draft = await tx.scriptDraft.findUnique({ where: { reelId } });
    if (!draft) throw new ScriptError("Черновик не найден.", "DRAFT_NOT_FOUND", 404);
    const expectedToken = resolveDraftToken(draft, input);
    const updated = await tx.scriptDraft.updateMany({
      where: { reelId, saveToken: expectedToken },
      data: {
        body,
        sourcesJson: JSON.stringify(input.sources?.length ? input.sources : parseSources(draft.sourcesJson)),
        saveToken: expectedToken + 1,
      },
    });
    if (updated.count === 0) {
      throw new ScriptError("Черновик уже изменился. Обновите и повторите.", "STALE", 409);
    }
  });
  return listScriptWorkspace(reelId);
}

export async function finalizeScriptDraft(
  reelId: string,
  input: { expectedUpdatedAt: string; expectedSaveToken?: number; body?: string },
): Promise<ScriptWorkspaceDto> {
  await assertReel(reelId);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Reel" WHERE id = ${reelId} FOR UPDATE`;
    const draft = await tx.scriptDraft.findUnique({ where: { reelId } });
    if (!draft) throw new ScriptError("Черновик не найден.", "DRAFT_NOT_FOUND", 404);
    if (
      typeof input.expectedSaveToken === "number" &&
      Number.isFinite(input.expectedSaveToken) &&
      input.expectedSaveToken !== draft.saveToken
    ) {
      throw new ScriptError("Черновик уже изменился. Обновите и повторите.", "STALE", 409);
    }
    resolveDraftToken(draft, input);
    const kind: ScriptKind = draft.sourceKind === "vocal" ? "accepted_ai" : "manual";
    await createVersion(
      reelId,
      {
        kind,
        body: typeof input.body === "string" ? input.body : draft.body,
        sources: parseSources(draft.sourcesJson),
        parentId: draft.baseVersionId,
      },
      tx,
    );
    await tx.scriptDraft.delete({ where: { reelId } });
  });
  return listScriptWorkspace(reelId);
}

export async function deleteScriptDraft(reelId: string): Promise<ScriptWorkspaceDto> {
  await assertReel(reelId);
  await withReelWriteLock(reelId, prisma, async (tx) => {
    const draft = await tx.scriptDraft.findUnique({ where: { reelId } });
    if (!draft) throw new ScriptError("Черновик не найден.", "DRAFT_NOT_FOUND", 404);
    await tx.scriptDraft.delete({ where: { reelId } });
  });
  return listScriptWorkspace(reelId);
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

export async function createReadyScriptFromTranscript(
  reelId: string,
  input: {
    body: string;
    transcriptId: string;
    takeNumber: number;
    parentId?: string | null;
    select: boolean;
  },
): Promise<ScriptVersionDto> {
  return createVersion(reelId, {
    kind: "manual",
    body: input.body,
    sources: [
      {
        type: "transcript",
        id: input.transcriptId,
        label: `Из дубля №${input.takeNumber}`,
      },
    ],
    parentId: input.parentId,
    select: input.select,
  });
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
    if (!isHeadKind(row.kind)) {
      throw new ScriptError(
        "Итоговой может быть только готовая версия сценария, не черновик и не предложение модели.",
        "SCRIPT_NOT_READY",
      );
    }
  }

  const snapshot = await prisma.reel.findFirst({
    where: { id: reelId, ownerUserId: ownerUserId() },
  });
  if (!snapshot) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  if (snapshot.status === "completed") {
    throw new ScriptError("Сначала верните мысль в работу, чтобы сменить итог.", "NEED_REOPEN", 409);
  }
  if (snapshot.finalScriptId === scriptId) {
    return listScriptBundle(reelId);
  }

  return enqueueByKey(`reel:${reelId}`, async () => {
    const reel = await prisma.reel.findFirst({ where: { id: reelId, ownerUserId: ownerUserId() } });
    if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
    if (reel.status === "completed") {
      throw new ScriptError("Сначала верните мысль в работу, чтобы сменить итог.", "NEED_REOPEN", 409);
    }
    if (reel.finalScriptId === scriptId) {
      return listScriptBundle(reelId);
    }
    if (reel.finalScriptId !== snapshot.finalScriptId) {
      throw new ScriptError("Карточка уже изменилась. Обновите данные и повторите.", "STALE", 409);
    }
    await prisma.reel.update({
      where: { id: reelId },
      data: { finalScriptId: scriptId, updatedAt: reel.updatedAt },
    });
    return listScriptBundle(reelId);
  });
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
  input: {
    body: string;
    model?: string | null;
    promptVersion?: string | null;
    inputSnapshotJson?: string | null;
  },
  db: ScriptDb = prisma,
): Promise<ScriptVersionDto> {
  return createVersion(
    reelId,
    {
      kind: "accepted_ai",
      body: input.body,
      model: input.model,
      promptVersion: input.promptVersion,
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
      const reel = await prisma.reel.findFirst({ where: { id: reelId, ownerUserId: ownerUserId() } });
      out.push({ label: ref.label ?? "Заметка", text: reel?.initialNote ?? "" });
    } else if (ref.type === "transcript") {
      const row = await prisma.transcriptRevision.findFirst({
        where: { id: ref.id, take: { reelId } },
      });
      if (row) out.push({ label: ref.label ?? "Исходная мысль", text: row.text });
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

/** Base script of the cycle: the cleaned take transcript, no model call. One per original transcript. */
export function cleanTakeTranscript(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export async function createBaseScriptFromTakeInTx(
  tx: Prisma.TransactionClient,
  input: { reelId: string; takeId: string; transcriptId: string; text: string },
): Promise<boolean> {
  const body = cleanTakeTranscript(input.text);
  if (!body || body.length > SCRIPT_BODY_MAX) return false;
  const take = await tx.take.findFirst({ where: { id: input.takeId, reelId: input.reelId }, select: { number: true } });
  if (!take) return false;
  const existing = await tx.scriptVersion.findMany({
    where: { reelId: input.reelId, kind: "from_take" },
    select: { sourcesJson: true },
  });
  if (existing.some((row) => parseSourceRefs(safeJson(row.sourcesJson)).some((ref) => ref.id === input.transcriptId))) {
    return false;
  }
  const created = await tx.scriptVersion.create({
    data: {
      reelId: input.reelId,
      kind: "from_take",
      body,
      recordingJson: JSON.stringify(normalizeRecording(null)),
      sourcesJson: JSON.stringify([
        { type: "transcript", id: input.transcriptId, label: `Из дубля №${take.number}` },
      ] satisfies ScriptSourceRef[]),
    },
  });
  void created;
  return true;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function viewingChangesFor(versionId: string | null): Promise<string[]> {
  if (!versionId) return [];
  const call = await prisma.aiCall.findFirst({
    where: { kind: "script", status: "done", resultJson: { contains: versionId } },
    select: { resultJson: true },
  });
  if (!call?.resultJson) return [];
  try {
    const parsed = JSON.parse(call.resultJson) as { versionId?: string; changes?: unknown };
    if (parsed.versionId !== versionId || !Array.isArray(parsed.changes)) return [];
    return parsed.changes.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3);
  } catch {
    return [];
  }
}
