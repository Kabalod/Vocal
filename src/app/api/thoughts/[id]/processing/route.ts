import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toJobDto } from "@/lib/serialize";
import { thoughtProcessingPhase } from "@/lib/thought-media";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const reel = await prisma.reel.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      selectedScriptId: true,
      takes: {
        orderBy: { number: "asc" },
        take: 1,
        select: { id: true, mediaStatus: true, inputType: true },
      },
    },
  });
  if (!reel) {
    return NextResponse.json({ error: "Карточка не найдена." }, { status: 404 });
  }
  const take = reel.takes[0] ?? null;
  const jobId = take
    ? (
        await prisma.job.findFirst({
          where: { takeId: take.id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
      )?.id ?? null
    : null;
  if (jobId) {
    const { recoverJobIfStale } = await import("@/lib/pipeline");
    await recoverJobIfStale(jobId);
  }
  const jobRow = jobId
    ? await prisma.job.findUnique({ where: { id: jobId } })
    : null;
  const job = jobRow ? toJobDto(jobRow) : null;
  const phase = thoughtProcessingPhase(job);
  return NextResponse.json({
    reelId: reel.id,
    title: reel.title,
    take,
    job,
    scriptReady: Boolean(reel.selectedScriptId),
    phase,
    error:
      phase === "error"
        ? {
            code: job?.errorCode ?? "PIPELINE",
            message: job?.errorMessage ?? "Не удалось обработать материал.",
            retry: (job?.stage === "analyze" ? "analysis" : job?.stage === "stt" ? "stt" : "upload") as
              | "upload"
              | "stt"
              | "analysis",
          }
        : null,
  });
}
