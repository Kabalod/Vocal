import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/auth/request";
import { prisma } from "@/lib/db";
import { ownerUserId } from "@/lib/auth/session";
import { parsePayload, toJobDto } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export const GET = withApiUser(async function GET() {
  const jobs = await prisma.job.findMany({
    where: { ownerUserId: ownerUserId() },
    orderBy: { createdAt: "desc" },
    include: { analysis: true },
  });

  return NextResponse.json({
    jobs: jobs.map((job) => {
      const analysis = job.analysis ? parsePayload(job.analysis.payload) : null;
      return {
        ...toJobDto(job),
        overallScore: job.analysis?.overallScore ?? null,
        summary: job.analysis?.summary ?? null,
        topRecommendations: analysis?.recommendations.slice(0, 2) ?? [],
      };
    }),
  });
});
