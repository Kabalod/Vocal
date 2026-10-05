/**
 * Child process for tests/s4-restart.test.ts. Env: TEST_DATABASE_URL, VOCAL_STORAGE_ROOT,
 * VOCAL_JOB_LEASE_MS, STT_LOG (file, one line per STT call), JOB_ID, MODE = run | recover | graceful.
 */
import { appendFileSync } from "node:fs";
import { processJob, recoverUnfinishedJobs, shutdownPipeline } from "../../src/lib/pipeline";

const jobId = process.env.JOB_ID!;
const mode = process.env.MODE!;
const sttMs = Number(process.env.STT_MS ?? 1500);

const deps = {
  extractAudio: async (_video: string, out: string) => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(out, "mp3");
  },
  probeDuration: async () => 2,
  transcribeAudio: async () => {
    appendFileSync(process.env.STT_LOG!, `stt pid=${process.pid}\n`);
    console.log("IN_STT");
    await new Promise((resolve) => setTimeout(resolve, sttMs));
    return { text: "расшифровка после рестарта", segments: [{ start: 0, end: 1, text: "расшифровка после рестарта" }], model: "mock-stt" };
  },
  suggestTitle: async () => ({ text: JSON.stringify({ title: "После рестарта" }), usage: {} }),
};

async function main() {
  if (mode === "recover") {
    const ids = await recoverUnfinishedJobs();
    for (const id of ids) await processJob(id, deps);
    console.log(`RECOVERED ${ids.join(",")}`);
    return;
  }
  if (mode === "graceful") {
    process.once("SIGTERM", () => {
      void shutdownPipeline(10_000).then((result) => {
        console.log(`SHUTDOWN drained=${result.drained} released=${result.released}`);
        process.exit(0);
      });
    });
  }
  await processJob(jobId, deps);
  console.log("JOB_FINISHED");
  if (mode === "graceful") await new Promise((resolve) => setTimeout(resolve, 5000));
}

void main().then(() => process.exit(0));
