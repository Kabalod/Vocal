import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { jobDeepLinkHref } from "@/lib/legacy-routes";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    select: { take: { select: { reelId: true } } },
  });
  if (!job) notFound();
  redirect(jobDeepLinkHref(job.take?.reelId));
}
