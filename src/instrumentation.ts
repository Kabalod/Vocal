export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureStorageDirs } = await import("@/lib/storage");
  const { ensureCriteria } = await import("@/lib/db");
  const { recoverUnfinishedJobs } = await import("@/lib/pipeline");
  await ensureStorageDirs();
  await ensureCriteria();
  await recoverUnfinishedJobs();
}
