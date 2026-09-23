export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertSupabasePublicTarget, resolveAppDatabaseUrl } = await import("@/lib/db-target");
  assertSupabasePublicTarget();
  resolveAppDatabaseUrl();
  const { prisma, ensureCriteria } = await import("@/lib/db");
  await prisma.$queryRaw`select 1`;
  const { ensureStorageDirs } = await import("@/lib/storage");
  const { recoverUnfinishedJobs } = await import("@/lib/pipeline");
  await ensureStorageDirs();
  await ensureCriteria();
  await recoverUnfinishedJobs();
}
