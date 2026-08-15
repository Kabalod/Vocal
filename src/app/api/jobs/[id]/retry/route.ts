import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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
    return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
  }

  const updated = await prisma.job.update({
    where: { id },
    data: {
      status: "queued",
      errorCode: null,
      errorMessage: null,
    },
  });

  after(() => {
    enqueueJob(id);
  });
  return NextResponse.json({ job: toJobDto(updated) });
}
