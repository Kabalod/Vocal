import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toJobWithAnalysis } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await prisma.job.findUnique({
    where: { id },
    include: { analysis: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
  }

  return NextResponse.json({ job: toJobWithAnalysis(job) });
}
