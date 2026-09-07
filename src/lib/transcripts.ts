import { prisma } from "@/lib/db";
import { ReelError } from "@/lib/reels";
import { TAKE_TEXT_MAX } from "@/types/reel";
import type {
  TranscriptBundleDto,
  TranscriptKind,
  TranscriptRevisionDto,
  TranscriptSegmentDto,
  TranscriptSource,
} from "@/types/transcript";

function parseSegments(raw: string | null): TranscriptSegmentDto[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is TranscriptSegmentDto => {
      return (
        item !== null &&
        typeof item === "object" &&
        typeof (item as TranscriptSegmentDto).start === "number" &&
        typeof (item as TranscriptSegmentDto).end === "number" &&
        typeof (item as TranscriptSegmentDto).text === "string"
      );
    });
  } catch {
    return null;
  }
}

function toDto(row: {
  id: string;
  takeId: string;
  kind: string;
  source: string;
  text: string;
  segmentsJson: string | null;
  language: string | null;
  sttModel: string | null;
  parentId: string | null;
  createdAt: Date;
}): TranscriptRevisionDto {
  const kind = row.kind === "edit" ? "edit" : "original";
  const source: TranscriptSource =
    row.source === "stt" || row.source === "payload_import" || row.source === "manual"
      ? row.source
      : "manual";
  return {
    id: row.id,
    takeId: row.takeId,
    kind,
    source,
    text: row.text,
    segments: kind === "original" ? parseSegments(row.segmentsJson) : null,
    language: row.language,
    sttModel: row.sttModel,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
  };
}

async function takeOrThrow(takeId: string) {
  const take = await prisma.take.findUnique({ where: { id: takeId } });
  if (!take) throw new ReelError("Дубль не найден.", "TAKE_NOT_FOUND", 404);
  return take;
}

export async function findOriginalRevision(takeId: string) {
  return prisma.transcriptRevision.findFirst({
    where: { takeId, kind: "original" },
    orderBy: { createdAt: "asc" },
  });
}

export async function saveOriginalIfAbsent(
  takeId: string,
  input: {
    text: string;
    segments?: TranscriptSegmentDto[] | null;
    source: TranscriptSource;
    language?: string | null;
    sttModel?: string | null;
  },
) {
  const text = input.text.trim();
  if (!text) return findOriginalRevision(takeId);

  const existing = await findOriginalRevision(takeId);
  if (existing) return existing;

  const created = await prisma.transcriptRevision.create({
    data: {
      takeId,
      kind: "original",
      source: input.source,
      text,
      segmentsJson: input.segments && input.segments.length > 0 ? JSON.stringify(input.segments) : null,
      language: input.language ?? null,
      sttModel: input.sttModel ?? null,
    },
  });

  const take = await prisma.take.findUnique({ where: { id: takeId } });
  if (take && !take.selectedTranscriptId) {
    await prisma.take.update({
      where: { id: takeId },
      data: { selectedTranscriptId: created.id, bodyText: take.bodyText || text },
    });
  }
  return created;
}

export async function ensureOriginalFromText(takeId: string, text: string) {
  return saveOriginalIfAbsent(takeId, { text, source: "manual", segments: null });
}

export async function importOriginalFromAnalysisPayload(takeId: string, payloadRaw: string | null | undefined) {
  if (!payloadRaw) return findOriginalRevision(takeId);
  try {
    const prev = JSON.parse(payloadRaw) as {
      transcript?: { text?: string; segments?: TranscriptSegmentDto[] };
    };
    const text = prev.transcript?.text?.trim() ?? "";
    if (!text) return findOriginalRevision(takeId);
    const segments = Array.isArray(prev.transcript?.segments) ? prev.transcript.segments : null;
    return saveOriginalIfAbsent(takeId, {
      text,
      segments,
      source: "payload_import",
    });
  } catch {
    return findOriginalRevision(takeId);
  }
}

export async function importMissingOriginalsForTake(takeId: string) {
  const existing = await findOriginalRevision(takeId);
  if (existing) return existing;

  const take = await prisma.take.findUnique({
    where: { id: takeId },
    include: { jobs: { include: { analysis: true } } },
  });
  if (!take) return null;

  for (const job of take.jobs) {
    const imported = await importOriginalFromAnalysisPayload(takeId, job.analysis?.payload);
    if (imported) return imported;
  }

  if (take.inputType === "text" && take.bodyText.trim()) {
    return ensureOriginalFromText(takeId, take.bodyText);
  }
  return null;
}

export async function listTranscriptBundle(takeId: string): Promise<TranscriptBundleDto> {
  await takeOrThrow(takeId);
  await importMissingOriginalsForTake(takeId);
  const take = await prisma.take.findUnique({ where: { id: takeId } });
  const revisions = await prisma.transcriptRevision.findMany({
    where: { takeId },
    orderBy: { createdAt: "asc" },
  });
  const original = revisions.find((row) => row.kind === "original") ?? null;
  const selectedId = take?.selectedTranscriptId ?? original?.id ?? null;
  return {
    takeId,
    selectedId,
    originalId: original?.id ?? null,
    revisions: revisions.map(toDto),
    timestampsBelongToOriginal: true,
  };
}

export async function createEditedRevision(takeId: string, textRaw: string) {
  const take = await takeOrThrow(takeId);
  const text = textRaw.trim();
  if (!text) throw new ReelError("Введите текст расшифровки.", "TEXT_REQUIRED");
  if (text.length > TAKE_TEXT_MAX) {
    throw new ReelError(`Текст короче ${TAKE_TEXT_MAX} символов.`, "TEXT_TOO_LONG");
  }

  await importMissingOriginalsForTake(takeId);
  const original = await findOriginalRevision(takeId);
  const parentId = take.selectedTranscriptId ?? original?.id ?? null;

  const created = await prisma.transcriptRevision.create({
    data: {
      takeId,
      kind: "edit" satisfies TranscriptKind,
      source: "manual",
      text,
      segmentsJson: null,
      parentId,
    },
  });

  await prisma.take.update({
    where: { id: takeId },
    data: { selectedTranscriptId: created.id, bodyText: text },
  });

  return listTranscriptBundle(takeId);
}

export async function selectTranscriptRevision(takeId: string, revisionId: string) {
  await takeOrThrow(takeId);
  const revision = await prisma.transcriptRevision.findFirst({
    where: { id: revisionId, takeId },
  });
  if (!revision) throw new ReelError("Версия расшифровки не найдена.", "REVISION_NOT_FOUND", 404);

  await prisma.take.update({
    where: { id: takeId },
    data: { selectedTranscriptId: revision.id, bodyText: revision.text },
  });
  return listTranscriptBundle(takeId);
}

export async function selectedTranscriptText(takeId: string | null | undefined): Promise<{
  text: string;
  segments: TranscriptSegmentDto[];
} | null> {
  if (!takeId) return null;
  await importMissingOriginalsForTake(takeId);
  const take = await prisma.take.findUnique({ where: { id: takeId } });
  if (!take) return null;
  const original = await findOriginalRevision(takeId);
  const selectedId = take.selectedTranscriptId ?? original?.id;
  if (!selectedId) return null;
  const selected = await prisma.transcriptRevision.findUnique({ where: { id: selectedId } });
  if (!selected) return original ? { text: original.text, segments: parseSegments(original.segmentsJson) ?? [] } : null;
  const segments =
    selected.kind === "original" ? parseSegments(selected.segmentsJson) ?? [] : parseSegments(original?.segmentsJson ?? null) ?? [];
  return { text: selected.text, segments };
}
