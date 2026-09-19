import { existsSync } from "fs";
import { enterWithOwner } from "@/lib/auth/session";
import { analyzeSpeech } from "@/lib/analyze";
import { MAX_VIDEO_SECONDS } from "@/lib/config";
import { ensureCriteria, prisma } from "@/lib/db";
import { extractAudio, probeDuration } from "@/lib/ffmpeg";
import { isGroqConnectionError, isGroqTokenLimitError } from "@/lib/groq";
import { claimJob, completeJob, heartbeatJob, listRecoverableJobIds, releaseJobLease, failExhaustedRunningJobs, markJobFailed, EXHAUSTED_JOB_USER_MESSAGE } from "@/lib/jobs";
import { computeMetrics } from "@/lib/metrics";
import { safeServerLog } from "@/lib/safe-log";
import { toCriterionDto } from "@/lib/serialize";
import { audioPathFor } from "@/lib/storage";
import { transcribeAudio } from "@/lib/stt";
import {
  findOriginalRevision,
  importOriginalFromAnalysisPayload,
  saveOriginalIfAbsent,
  selectedTranscriptText,
} from "@/lib/transcripts";
import type { TranscriptSegmentDto } from "@/types/transcript";

const queue: string[] = [];
let draining = false;

export type PipelineDeps = {
  transcribeAudio?: typeof transcribeAudio;
  analyzeSpeech?: typeof analyzeSpeech;
  extractAudio?: typeof extractAudio;
  probeDuration?: typeof probeDuration;
  now?: () => Date;
  suggestTitle?: import("@/types/review").CompleteJsonFn;
};

export function enqueueJob(jobId: string) {
  if (process.env.VOCAL_SKIP_JOB_ENQUEUE === "1") return;
  if (!queue.includes(jobId)) {
    queue.push(jobId);
  }
  void drain();
}

export async function recoverUnfinishedJobs(now = new Date()) {
  await failExhaustedRunningJobs();
  const ids = await listRecoverableJobIds(now);
  for (const id of ids) enqueueJob(id);
  return ids;
}

export async function recoverJobIfStale(jobId: string, now = new Date()): Promise<boolean> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, attempts: true, maxAttempts: true },
  });
  if (!job) return false;
  if (job.status === "done" || job.status === "error") return false;
  if (job.attempts >= job.maxAttempts) {
    await markJobFailed(job.id, "RETRY_EXHAUSTED", EXHAUSTED_JOB_USER_MESSAGE);
    return false;
  }
  const ids = await listRecoverableJobIds(now);
  if (!ids.includes(jobId)) return false;
  enqueueJob(jobId);
  return true;
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) continue;
      await processJob(id);
    }
  } finally {
    draining = false;
  }
}

export function classifyPipelineError(error: unknown, stage: string) {
  const err = error as { code?: string; message?: string; status?: number };
  let code = err.code ?? "PIPELINE";
  let message = err.message ?? "Неизвестная ошибка обработки.";

  if (err.code === "TOO_LONG") {
    code = "TOO_LONG";
  } else if (err.code === "VIDEO_MISSING") {
    code = "VIDEO_MISSING";
  } else if (/Таймаут/i.test(message)) {
    code = "MEDIA_TIMEOUT";
    message = "Обработка файла слишком долго. Нажмите «Повторить».";
  } else if (isGroqTokenLimitError(error) || err.status === 429) {
    code = "GROQ_RATE_LIMIT";
    message = "Лимит Groq (токены или частота). Подождите минуту и нажмите «Повторить».";
  } else if (err.status === 413) {
    code = "FILE_TOO_LARGE";
    message = "Аудио слишком большое для распознавания. Загрузите более короткий ролик.";
  } else if (err.status === 401) {
    code = "GROQ_AUTH";
    message =
      "Groq не принял ключ (401). Создайте новый ключ на console.groq.com/keys и вставьте в GROQ_API_KEY, затем перезапустите npm run dev.";
  } else if (err.status === 403) {
    code = "GROQ_AUTH";
    message =
      "Groq отклонил ключ (403 Forbidden). Ключ отозван, истёк или без доступа. Создайте новый на console.groq.com/keys, замените GROQ_API_KEY в .env и перезапустите сервер.";
  } else if (/invalid_type|ZodError|не JSON/i.test(message)) {
    code = "LLM_SCHEMA";
    message = "Модель вернула неполный разбор. Нажмите «Повторить».";
  } else if (isGroqConnectionError(error)) {
    code = "GROQ_NETWORK";
    message =
      "Обрыв связи с Groq при распознавании. Часто из‑за VPN: смените сервер (например Вильнюс) или выключите VPN и нажмите «Повторить».";
  }

  return {
    code: `${code}|${stage}`.slice(0, 64),
    message: message.slice(0, 1000),
  };
}

async function fail(jobId: string, error: unknown, stage: string) {
  const { code, message } = classifyPipelineError(error, stage);
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "error",
      stage,
      errorCode: code,
      errorMessage: message,
      leaseUntil: null,
      leaseOwner: null,
    },
  });
}

async function setStage(
  jobId: string,
  leaseOwner: string,
  status: "converting" | "transcribing" | "analyzing",
  extra: Record<string, unknown> = {},
) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status,
      stage: status === "converting" ? "convert" : status === "transcribing" ? "stt" : "analyze",
      errorCode: null,
      errorMessage: null,
      ...extra,
    },
  });
  await heartbeatJob(jobId, leaseOwner);
}

export async function processJob(jobId: string, deps: PipelineDeps = {}) {
  const now = deps.now?.() ?? new Date();
  const claimed = await claimJob(jobId, now);
  if (!claimed.ok) {
    if (
      claimed.reason === "exhausted" &&
      claimed.job &&
      claimed.job.status !== "done" &&
      claimed.job.status !== "error"
    ) {
      await markJobFailed(claimed.job.id, "RETRY_EXHAUSTED", EXHAUSTED_JOB_USER_MESSAGE);
    }
    return claimed;
  }

  enterWithOwner({ id: claimed.job.ownerUserId, email: null });

  const transcribe = deps.transcribeAudio ?? transcribeAudio;
  const analyze = deps.analyzeSpeech ?? analyzeSpeech;
  const extract = deps.extractAudio ?? extractAudio;
  const probe = deps.probeDuration ?? probeDuration;
  const leaseOwner = claimed.leaseOwner;
  let stage = claimed.job.stage || "convert";

  try {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return claimed;

    if (job.takeId) {
      const analysis = await prisma.analysisResult.findUnique({ where: { jobId } });
      await importOriginalFromAnalysisPayload(job.takeId, analysis?.payload);
    }

    let original = job.takeId ? await findOriginalRevision(job.takeId) : null;
    let transcript = "";
    let segments: TranscriptSegmentDto[] = [];
    let duration = job.durationSec ?? 0;

    if (original) {
      transcript = original.text;
      try {
        segments = original.segmentsJson
          ? (JSON.parse(original.segmentsJson) as TranscriptSegmentDto[])
          : [];
      } catch {
        segments = [];
      }
    } else {
      if (!existsSync(job.videoPath)) {
        throw Object.assign(new Error("Исходное видео не найдено на диске."), {
          code: "VIDEO_MISSING",
        });
      }

      stage = "convert";
      await setStage(jobId, leaseOwner, "converting");

      duration = await probe(job.videoPath);
      if (duration > MAX_VIDEO_SECONDS + 0.4) {
        throw Object.assign(
          new Error(`Видео длиннее 3 минут (${Math.round(duration)} с). Загрузите ролик до 180 секунд.`),
          { code: "TOO_LONG" },
        );
      }

      const audioPath = audioPathFor(jobId);
      await extract(job.videoPath, audioPath);

      stage = "stt";
      await setStage(jobId, leaseOwner, "transcribing", { audioPath, durationSec: duration });

      const stt = await transcribe(audioPath);
      transcript = stt.text;
      segments = stt.segments;
      if (!transcript.trim()) {
        throw Object.assign(new Error("В записи не удалось распознать речь."), {
          code: "EMPTY_TRANSCRIPT",
        });
      }

      if (job.takeId) {
        original = await saveOriginalIfAbsent(job.takeId, {
          text: transcript,
          segments,
          source: "stt",
          language: stt.language,
          sttModel: stt.model,
        });
      }
    }

    if (job.takeId) {
      const selected = await selectedTranscriptText(job.takeId);
      if (selected?.text) {
        transcript = selected.text;
        if (selected.segments.length > 0) segments = selected.segments;
      }
    }

    if (job.takeId && transcript.trim()) {
      const { applyThoughtMediaFromTranscript } = await import("@/lib/thought-media");
      await applyThoughtMediaFromTranscript(job.takeId, transcript, deps.suggestTitle);
      try {
        const take = await prisma.take.findUnique({ where: { id: job.takeId }, select: { reelId: true } });
        if (take) {
          const { ensureAutomaticTakeComparison } = await import("@/lib/ai/compare");
          await ensureAutomaticTakeComparison(take.reelId, deps.suggestTitle);
        }
      } catch {
        /* comparison is best-effort after processing */
      }
    }

    stage = "analyze";
    await setStage(jobId, leaseOwner, "analyzing", { durationSec: duration });

    await ensureCriteria();
    const criteria = (
      await prisma.criterion.findMany({
        orderBy: [{ categoryOrder: "asc" }, { sortOrder: "asc" }],
      })
    ).map(toCriterionDto);
    const metrics = computeMetrics(segments, transcript, duration);
    const result = await analyze({
      criteria,
      metrics,
      transcript,
      segments,
    });

    const payload = result;
    await prisma.analysisResult.upsert({
      where: { jobId },
      update: {
        overallScore: result.overallScore,
        summary: result.summary,
        payload: JSON.stringify(payload),
      },
      create: {
        jobId,
        overallScore: result.overallScore,
        summary: result.summary,
        payload: JSON.stringify(payload),
      },
    });

    await completeJob(jobId);
    return claimed;
  } catch (error) {
    console.error(safeServerLog({ route: "pipeline", jobId, code: classifyPipelineError(error, stage).code }));
    await fail(jobId, error, stage);
    await releaseJobLease(jobId);
    return claimed;
  }
}

export { drain as drainJobQueueForTests };
