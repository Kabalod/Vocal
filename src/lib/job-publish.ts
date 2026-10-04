import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  lockVocalReel,
  promoteWorkingTakeInTx,
  selectOriginalIfUnsetInTx,
  v06TestSeams,
} from "@/lib/v06-working-take";
import { transcriptFromAnalysisPayload } from "@/lib/transcripts";
import type { TranscriptSegmentDto, TranscriptSource } from "@/types/transcript";

/** Job FOR UPDATE, then Reel FOR UPDATE. claimJob uses the same Job lock. */
export type JobPublishGuard = {
  jobId: string;
  leaseOwner: string;
};

export type LockedJobRow = {
  id: string;
  leaseOwner: string | null;
  status: string;
};

export async function lockVocalJob(tx: Prisma.TransactionClient, jobId: string): Promise<LockedJobRow | null> {
  const rows = await tx.$queryRaw<LockedJobRow[]>`
    SELECT id, "leaseOwner", status FROM "Job" WHERE id = ${jobId} FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function jobMayPublishInTx(tx: Prisma.TransactionClient, guard: JobPublishGuard): Promise<boolean> {
  const job = await lockVocalJob(tx, guard.jobId);
  return Boolean(job && job.leaseOwner === guard.leaseOwner && job.status !== "done");
}

async function findOriginalInTx(tx: Prisma.TransactionClient, takeId: string) {
  return tx.transcriptRevision.findFirst({
    where: { takeId, kind: "original" },
    orderBy: { createdAt: "asc" },
  });
}

async function createOriginalInTx(
  tx: Prisma.TransactionClient,
  takeId: string,
  input: {
    text: string;
    segments?: TranscriptSegmentDto[] | null;
    source: TranscriptSource;
    language?: string | null;
    sttModel?: string | null;
  },
) {
  return tx.transcriptRevision.create({
    data: {
      takeId,
      kind: "original",
      source: input.source,
      text: input.text,
      segmentsJson: input.segments && input.segments.length > 0 ? JSON.stringify(input.segments) : null,
      language: input.language ?? null,
      sttModel: input.sttModel ?? null,
    },
  });
}

export async function publishMediaJobResult(input: {
  jobId: string;
  leaseOwner: string;
  takeId: string;
  stt?: {
    text: string;
    segments?: TranscriptSegmentDto[] | null;
    language?: string | null;
    sttModel?: string | null;
  } | null;
  analysisPayload?: string | null;
}): Promise<{ ok: false } | { ok: true; reelId: string; transcript: string; originalId: string | null }> {
  const peek = await prisma.take.findUnique({
    where: { id: input.takeId },
    select: { reelId: true },
  });
  if (!peek) return { ok: false };

  await v06TestSeams.beforeAutoPromoteLock?.();
  return prisma.$transaction(async (tx) => {
    if (!(await jobMayPublishInTx(tx, { jobId: input.jobId, leaseOwner: input.leaseOwner }))) {
      return { ok: false as const };
    }
    const locked = await lockVocalReel(tx, peek.reelId);
    if (!locked) return { ok: false as const };
    await v06TestSeams.afterAutoPromoteLocked?.();

    let original = await findOriginalInTx(tx, input.takeId);
    if (!original) {
      const sttText = input.stt?.text.trim() ?? "";
      if (sttText) {
        original = await createOriginalInTx(tx, input.takeId, {
          text: sttText,
          segments: input.stt?.segments,
          source: "stt",
          language: input.stt?.language,
          sttModel: input.stt?.sttModel,
        });
      } else {
        const imported = transcriptFromAnalysisPayload(input.analysisPayload);
        if (imported) {
          original = await createOriginalInTx(tx, input.takeId, {
            text: imported.text,
            segments: imported.segments,
            source: "payload_import",
          });
        }
      }
    }

    if (original) {
      await selectOriginalIfUnsetInTx(tx, {
        takeId: input.takeId,
        originalId: original.id,
        originalText: original.text,
      });
      await promoteWorkingTakeInTx(tx, input.takeId);
    }

    const take = await tx.take.findUnique({
      where: { id: input.takeId },
      select: { selectedTranscriptId: true, bodyText: true },
    });
    let transcript = original?.text ?? "";
    if (take?.selectedTranscriptId) {
      const selected = await tx.transcriptRevision.findFirst({
        where: { id: take.selectedTranscriptId, takeId: input.takeId },
        select: { text: true },
      });
      if (selected?.text.trim()) transcript = selected.text;
    } else if (take?.bodyText.trim()) {
      transcript = take.bodyText;
    }

    return {
      ok: true as const,
      reelId: peek.reelId,
      transcript,
      originalId: original?.id ?? null,
    };
  });
}
