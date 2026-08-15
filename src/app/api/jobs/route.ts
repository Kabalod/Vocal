import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parsePayload, toJobDto } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await prisma.job.findMany({
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
}
