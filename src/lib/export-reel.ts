import path from "node:path";
import { prisma } from "@/lib/db";
import { ReelError } from "@/lib/reels";
import { getReel } from "@/lib/reels";
import { listReelQuestions } from "@/lib/ai/questions";
import { listTakeReviews } from "@/lib/ai/review";
import { listComparisons } from "@/lib/compare";
import { listScriptBundle } from "@/lib/scripts";
import { listTranscriptBundle } from "@/lib/transcripts";

export interface ReelExportDto {
  exportedAt: string;
  reel: {
    id: string;
    title: string;
    initialNote: string;
    status: string;
    selectedTakeId: string | null;
    finalTakeId: string | null;
    selectedScriptId: string | null;
    finalScriptId: string | null;
    reelGoal: string;
    reelAudience: string;
    selectedKeys: string[];
  };
  takes: Array<{
    id: string;
    number: number;
    inputType: string;
    authorNote: string;
    originalName: string | null;
    mimeType: string | null;
    mediaFile: string | null;
    scriptVersionId: string | null;
    selectedTranscriptId: string | null;
    transcripts: Array<{ id: string; kind: string; source: string; text: string; createdAt: string }>;
    reviews: Array<{
      id: string;
      status: string;
      transcriptRevisionId: string;
      result: unknown;
      createdAt: string;
    }>;
  }>;
  questions: Array<{
    id: string;
    text: string;
    status: string;
    answers: Array<{ id: string; text: string; createdAt: string }>;
  }>;
  scripts: Array<{
    id: string;
    kind: string;
    body: string;
    recording: unknown;
    sources: unknown;
    inventedIdeas: string[];
    createdAt: string;
  }>;
  comparisons: Array<{
    id: string;
    leftTakeId: string;
    rightTakeId: string;
    leftTranscriptId: string;
    rightTranscriptId: string;
    intent: string;
    semantic: unknown;
    createdAt: string;
  }>;
  hiddenContext?: unknown;
}

function publicMediaName(storedPath: string | null | undefined): string | null {
  if (!storedPath) return null;
  return path.basename(storedPath.replace(/\\/g, "/"));
}

export async function exportReel(
  reelId: string,
  options: { includeHiddenContext?: boolean } = {},
): Promise<ReelExportDto> {
  const reel = await getReel(reelId);
  if (!reel) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);
  const row = await prisma.reel.findUnique({ where: { id: reelId } });
  if (!row) throw new ReelError("Карточка не найдена.", "REEL_NOT_FOUND", 404);

  const takes = await prisma.take.findMany({
    where: { reelId },
    orderBy: { number: "asc" },
  });
  const takeExports = [];
  for (const take of takes) {
    const transcripts = await listTranscriptBundle(take.id);
    const reviews = await listTakeReviews(take.id);
    takeExports.push({
      id: take.id,
      number: take.number,
      inputType: take.inputType,
      authorNote: take.authorNote,
      originalName: take.originalName,
      mimeType: take.mimeType,
      mediaFile: publicMediaName(take.storedPath),
      scriptVersionId: take.scriptVersionId,
      selectedTranscriptId: take.selectedTranscriptId,
      transcripts: transcripts.revisions.map((item) => ({
        id: item.id,
        kind: item.kind,
        source: item.source,
        text: item.text,
        createdAt: item.createdAt,
      })),
      reviews: reviews.map((item) => ({
        id: item.id,
        status: item.status,
        transcriptRevisionId: item.transcriptRevisionId,
        result: item.result,
        createdAt: item.createdAt,
      })),
    });
  }

  const questions = await listReelQuestions(reelId);
  const scripts = await listScriptBundle(reelId);
  const comparisons = await listComparisons(reelId);

  let selectedKeys: string[] = [];
  try {
    selectedKeys = JSON.parse(row.contextKeysJson) as string[];
    if (!Array.isArray(selectedKeys)) selectedKeys = [];
  } catch {
    selectedKeys = [];
  }

  const payload: ReelExportDto = {
    exportedAt: new Date().toISOString(),
    reel: {
      id: row.id,
      title: row.title,
      initialNote: row.initialNote,
      status: reel.status,
      selectedTakeId: row.selectedTakeId,
      finalTakeId: row.finalTakeId,
      selectedScriptId: row.selectedScriptId,
      finalScriptId: row.finalScriptId,
      reelGoal: row.reelGoal,
      reelAudience: row.reelAudience,
      selectedKeys,
    },
    takes: takeExports,
    questions: questions.map((item) => ({
      id: item.id,
      text: item.text,
      status: item.status,
      answers: item.answers.map((answer) => ({
        id: answer.id,
        text: answer.text,
        createdAt: answer.createdAt,
      })),
    })),
    scripts: scripts.versions.map((item) => ({
      id: item.id,
      kind: item.kind,
      body: item.body,
      recording: item.recording,
      sources: item.sources,
      inventedIdeas: item.inventedIdeas,
      createdAt: item.createdAt,
    })),
    comparisons: comparisons.map((item) => ({
      id: item.id,
      leftTakeId: item.leftTakeId,
      rightTakeId: item.rightTakeId,
      leftTranscriptId: item.leftTranscriptId,
      rightTranscriptId: item.rightTranscriptId,
      intent: item.intent,
      semantic: item.semantic,
      createdAt: item.createdAt,
    })),
  };

  if (options.includeHiddenContext) {
    const latest = await prisma.reelContextSnapshot.findFirst({
      where: { reelId },
      orderBy: { createdAt: "desc" },
    });
    payload.hiddenContext = latest
      ? {
          snapshotId: latest.id,
          assembled: JSON.parse(latest.assembledJson) as unknown,
        }
      : null;
  }

  return payload;
}

export function assertExportSafe(payload: unknown) {
  const raw = JSON.stringify(payload);
  if (/GROQ_API_KEY|DATABASE_URL/.test(raw)) {
    throw new Error("EXPORT_LEAK");
  }
  if (/[A-Za-z]:\\\\|\/Users\/|\/home\//.test(raw)) {
    throw new Error("EXPORT_ABS_PATH");
  }
}
