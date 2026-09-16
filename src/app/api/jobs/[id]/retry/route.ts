import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { JOB_LEASE_MS } from "@/lib/jobs";
import { enqueueJob } from "@/lib/pipeline";
import { toJobDto } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json({ error: "Запись не найдена.", code: "JOB_NOT_FOUND" }, { status: 404 });
  }
  if (job.status === "done") {
    return NextResponse.json({ error: "Задача уже выполнена.", code: "JOB_DONE" }, { status: 400 });
  }
  if (job.attempts >= job.maxAttempts) {
    return NextResponse.json(
      {
        error: `Повторы исчерпаны (${job.attempts} из ${job.maxAttempts}). Новую задачу не создаём.`,
        code: "RETRY_EXHAUSTED",
      },
      { status: 409 },
    );
  }

  const leaseActive =
    Boolean(job.leaseOwner) &&
    job.leaseUntil !== null &&
    job.leaseUntil.getTime() > Date.now();
  if (leaseActive) {
    return NextResponse.json(
      { error: "Задача ещё обрабатывается. Подождите или повторите позже.", code: "JOB_BUSY" },
      { status: 409 },
    );
  }

  const updated = await prisma.job.update({
    where: { id },
    data: {
      status: "queued",
      errorCode: null,
      errorMessage: null,
      leaseUntil: null,
      leaseOwner: null,
    },
  });

  after(() => {
    enqueueJob(id);
  });
  return NextResponse.json({ job: toJobDto(updated), leaseMs: JOB_LEASE_MS });
}
