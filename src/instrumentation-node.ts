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
}
