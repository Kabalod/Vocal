import { existsSync } from "fs";
import { analyzeSpeech } from "@/lib/analyze";
import { ensureCriteria, prisma } from "@/lib/db";
import { extractAudio, probeDuration } from "@/lib/ffmpeg";
import { computeMetrics } from "@/lib/metrics";
import { toCriterionDto } from "@/lib/serialize";
import { audioPathFor } from "@/lib/storage";
import { transcribeAudio } from "@/lib/stt";
import { MAX_VIDEO_SECONDS } from "@/lib/config";

const queue: string[] = [];
let draining = false;

export function enqueueJob(jobId: string) {
  if (!queue.includes(jobId)) {
    queue.push(jobId);
  }
  void drain();
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

async function fail(jobId: string, error: unknown) {
  const err = error as { code?: string; message?: string; status?: number };
  let code = err.code ?? "PIPELINE";
  let message = err.message ?? "Неизвестная ошибка обработки.";

  if (err.status === 413) {
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
  } else if (err.status === 429) {
    code = "GROQ_RATE_LIMIT";
    message = "Лимит Groq. Подождите минуту и нажмите «Повторить».";
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "error",
      errorCode: String(code).slice(0, 64),
      errorMessage: message.slice(0, 1000),
    },
  });
}

export async function processJob(jobId: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;

  try {
    if (!existsSync(job.videoPath)) {
      throw Object.assign(new Error("Исходное видео не найдено на диске."), {
        code: "VIDEO_MISSING",
      });
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { status: "converting", errorCode: null, errorMessage: null },
    });

    const duration = await probeDuration(job.videoPath);
    if (duration > MAX_VIDEO_SECONDS + 0.4) {
      throw Object.assign(
        new Error(
          `Видео длиннее 3 минут (${Math.round(duration)} с). Загрузите ролик до 180 секунд.`,
        ),
        { code: "TOO_LONG" },
      );
    }

    const audioPath = audioPathFor(jobId);
    await extractAudio(job.videoPath, audioPath);

    await prisma.job.update({
      where: { id: jobId },
      data: { status: "transcribing", audioPath, durationSec: duration },
    });

    const stt = await transcribeAudio(audioPath);

    await prisma.job.update({
      where: { id: jobId },
      data: { status: "analyzing" },
    });

    await ensureCriteria();
    const criteria = (
      await prisma.criterion.findMany({
        orderBy: [{ categoryOrder: "asc" }, { sortOrder: "asc" }],
      })
    ).map(toCriterionDto);
    const metrics = computeMetrics(stt.segments, stt.text, duration);
    const result = await analyzeSpeech({
      criteria,
      metrics,
      transcript: stt.text,
      segments: stt.segments,
    });

    await prisma.analysisResult.upsert({
      where: { jobId },
      update: {
        overallScore: result.overallScore,
        summary: result.summary,
        payload: JSON.stringify(result),
      },
      create: {
        jobId,
        overallScore: result.overallScore,
        summary: result.summary,
        payload: JSON.stringify(result),
      },
    });

    await prisma.job.update({
      where: { id: jobId },
      data: { status: "done" },
    });
  } catch (error) {
    console.error(`Job ${jobId} failed`, error);
    await fail(jobId, error);
  }
}
