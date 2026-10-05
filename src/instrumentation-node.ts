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
}
