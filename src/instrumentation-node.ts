export async function startNodeApp() {
  const { assertAppDatabaseReady } = await import("@/lib/db-target");
  assertAppDatabaseReady();
  const { prisma, ensureCriteria } = await import("@/lib/db");
  await prisma.$queryRaw`select 1`;
  const { ensureStorageDirs } = await import("@/lib/storage");
  const { recoverUnfinishedJobs } = await import("@/lib/pipeline");
  await ensureStorageDirs();
  await ensureCriteria();
  await recoverUnfinishedJobs();

  // Media nobody references any more (failed unlinks, files written by a worker after its thought
  // was deleted) is collected at start and then every 6 hours. Files younger than 1 hour are kept.
  const { sweepOrphanMedia } = await import("@/lib/data-deletion");
  const sweep = () => void sweepOrphanMedia().catch(() => undefined);
  sweep();
  setInterval(sweep, 6 * 60 * 60_000).unref();

  // A killed process leaves jobs with a lease that expires on its own; pick them up without waiting
  // for someone to open the page.
  setInterval(() => void recoverUnfinishedJobs().catch(() => undefined), 60_000).unref();

  // Graceful stop. Needs NEXT_MANUAL_SIG_HANDLE=true, otherwise Next exits on SIGTERM before this runs.
  const { shutdownPipeline } = await import("@/lib/pipeline");
  const graceMs = Number(process.env.VOCAL_SHUTDOWN_GRACE_MS) > 0 ? Number(process.env.VOCAL_SHUTDOWN_GRACE_MS) : 25_000;
  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.warn(`vocal: ${signal}, stopping jobs (up to ${graceMs} ms)`);
    void shutdownPipeline(graceMs)
      .then((result) => console.warn(`vocal: stopped, drained=${result.drained} released=${result.released}`))
      .catch(() => undefined)
      .finally(() => prisma.$disconnect().catch(() => undefined).finally(() => process.exit(0)));
  };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));
}
