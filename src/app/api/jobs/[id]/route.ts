import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { toJobWithAnalysis } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export const GET = withApiUser(async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await prisma.job.findFirst({
    where: { id, ownerUserId: ownerUserId() },
    include: { analysis: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Запись не найдена.", code: "JOB_NOT_FOUND" }, { status: 404 });
  }

  const { recoverJobIfStale } = await import("@/lib/pipeline");
  await recoverJobIfStale(job.id);

  const fresh = await prisma.job.findFirst({
    where: { id, ownerUserId: ownerUserId() },
    include: { analysis: true },
  });
  if (!fresh) {
    return NextResponse.json({ error: "Запись не найдена.", code: "JOB_NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ job: toJobWithAnalysis(fresh) });
});
