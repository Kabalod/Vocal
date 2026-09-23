export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startNodeApp } = await import("./instrumentation-node");
  await startNodeApp();
}
