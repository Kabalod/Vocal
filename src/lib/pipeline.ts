import { existsSync } from "fs";
import { enterWithOwner } from "@/lib/auth/session";
import { MAX_VIDEO_SECONDS } from "@/lib/config";
import { prisma } from "@/lib/db";
import { extractAudio, probeDuration } from "@/lib/ffmpeg";
import { isGroqConnectionError, isGroqTokenLimitError } from "@/lib/groq";
import {
  claimJob,
  completeJob,
  heartbeatJob,
  jobLeaseMs,
  listRecoverableJobIds,
  releaseJobLease,
  failExhaustedRunningJobs,
  markJobFailed,
  EXHAUSTED_JOB_USER_MESSAGE,
} from "@/lib/jobs";
import { safeServerLog } from "@/lib/safe-log";
import { audioPathFor } from "@/lib/storage";
import { meteredTranscribe } from "@/lib/ai/gateway";
import { transcribeAudio } from "@/lib/stt";
import { publishMediaJobResult } from "@/lib/job-publish";
import {
  findOriginalRevision,
  transcriptFromAnalysisPayload,
} from "@/lib/transcripts";
import type { TranscriptSegmentDto } from "@/types/transcript";

export const pipelineTestSeams = {
  duringTranscribe: null as ((ctx: { jobId: string; leaseOwner: string }) => Promise<void>) | null,
};

const queue: string[] = [];
let draining = false;

export type PipelineDeps = {
  transcribeAudio?: typeof transcribeAudio;
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
  } else if (err.code === "LEASE_LOST") {
    code = "LEASE_LOST";
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

function leaseLostError() {
  return Object.assign(new Error("LEASE_LOST"), { code: "LEASE_LOST" });
}

function isLeaseLost(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "LEASE_LOST");
}

async function fail(jobId: string, error: unknown, stage: string, leaseOwner: string) {
  const { code, message } = classifyPipelineError(error, stage);
  await prisma.job.updateMany({
    where: { id: jobId, leaseOwner, status: { notIn: ["done", "error"] } },
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

/** Keeps the lease alive while a long external call (STT, title) runs, so the job is not re-claimed and paid twice. */
async function withLeaseHeartbeat<T>(jobId: string, leaseOwner: string, run: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => {
    void heartbeatJob(jobId, leaseOwner).catch(() => undefined);
  }, Math.max(10, Math.floor(jobLeaseMs() / 3)));
  try {
    return await run();
  } finally {
    clearInterval(timer);
  }
}

async function setStage(
  jobId: string,
  leaseOwner: string,
  status: "converting" | "transcribing",
  extra: Record<string, unknown> = {},
) {
  const updated = await prisma.job.updateMany({
    where: { id: jobId, leaseOwner },
    data: {
      status,
      stage: status === "converting" ? "convert" : "stt",
      errorCode: null,
      errorMessage: null,
      ...extra,
    },
  });
  if (updated.count !== 1) throw leaseLostError();
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
  const extract = deps.extractAudio ?? extractAudio;
  const probe = deps.probeDuration ?? probeDuration;
  const leaseOwner = claimed.leaseOwner;
  let stage = claimed.job.stage || "convert";

  try {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return claimed;
    if (job.leaseOwner !== leaseOwner) throw leaseLostError();

    const analysis = job.takeId ? await prisma.analysisResult.findUnique({ where: { jobId } }) : null;
    const analysisPeek = transcriptFromAnalysisPayload(analysis?.payload);

    const original = job.takeId ? await findOriginalRevision(job.takeId) : null;
    let transcript = "";
    let segments: TranscriptSegmentDto[] = [];
    let duration = job.durationSec ?? 0;
    let sttForPublish: {
      text: string;
      segments: TranscriptSegmentDto[];
      language?: string | null;
      sttModel?: string | null;
    } | null = null;

    if (original) {
      transcript = original.text;
      try {
        segments = original.segmentsJson
          ? (JSON.parse(original.segmentsJson) as TranscriptSegmentDto[])
          : [];
      } catch {
        segments = [];
      }
    } else if (analysisPeek) {
      transcript = analysisPeek.text;
      segments = analysisPeek.segments ?? [];
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

      await pipelineTestSeams.duringTranscribe?.({ jobId, leaseOwner });
      const stt = await withLeaseHeartbeat(jobId, leaseOwner, () =>
        meteredTranscribe(audioPath, transcribe, { seconds: duration }),
      );
      transcript = stt.text;
      segments = stt.segments;
      if (!transcript.trim()) {
        throw Object.assign(new Error("В записи не удалось распознать речь."), {
          code: "EMPTY_TRANSCRIPT",
        });
      }
      sttForPublish = {
        text: transcript,
        segments,
        language: stt.language,
        sttModel: stt.model,
      };
    }

    if (job.takeId) {
      const published = await publishMediaJobResult({
        jobId,
        leaseOwner,
        takeId: job.takeId,
        stt: sttForPublish,
        analysisPayload: analysis?.payload ?? null,
      });
      if (!published.ok) throw leaseLostError();
      if (published.transcript.trim()) transcript = published.transcript;

      if (transcript.trim()) {
        const key = await prisma.thoughtCreateKey.findUnique({ where: { reelId: published.reelId } });
        if (key) {
          const { applyThoughtTitleFromTranscript } = await import("@/lib/thought-title");
          await withLeaseHeartbeat(jobId, leaseOwner, () =>
            applyThoughtTitleFromTranscript(published.reelId, transcript, deps.suggestTitle, {
              jobId,
              leaseOwner,
            }),
          );
        }
      }
    }

    const finished = await completeJob(jobId, leaseOwner);
    if (!finished) throw leaseLostError();
    return claimed;
  } catch (error) {
    if (isLeaseLost(error)) return claimed;
    console.error(safeServerLog({ route: "pipeline", jobId, code: classifyPipelineError(error, stage).code }));
    await fail(jobId, error, stage, leaseOwner);
    await releaseJobLease(jobId, leaseOwner);
    return claimed;
  }
}

export { drain as drainJobQueueForTests };
