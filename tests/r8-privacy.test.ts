import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { safeAiLog } from "../src/lib/ai-runtime-context";
import { extractErrorCode, logLineLeaksSecrets, safeServerLog } from "../src/lib/safe-log";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

test("safe log helpers never embed prompt, thought, profile, media path, or API keys", () => {
  const thought = "секретная мысль про отпуск в Сочи";
  const prompt = "SYSTEM: полный промпт пользователя";
  const profile = "я живу в Казани и веду блог";
  const media = "D:\\\\Vocal\\\\media\\\\takes\\\\abc.mp4";
  const key = "gsk_live_example_secret";
  const samples = [thought, prompt, profile, media, key, "GROQ_API_KEY"];
  const ai = safeAiLog({ kind: "dialogue", reelId: "reel_1", callId: "call_1", code: "RATE_LIMIT" });
  const api = safeServerLog({ route: "thoughts", code: "INTERNAL", jobId: "job_1" });
  assert.equal(ai, "ai dialogue call=call_1 reel=reel_1 RATE_LIMIT");
  assert.equal(api, "api thoughts job=job_1 INTERNAL");
  assert.deepEqual(logLineLeaksSecrets(ai, samples), []);
  assert.deepEqual(logLineLeaksSecrets(api, samples), []);
  assert.equal(extractErrorCode({ code: "SCRIPT_REQUIRED" }), "SCRIPT_REQUIRED");
  assert.equal(extractErrorCode(new Error(thought)), undefined);
});

test("API, pipeline, and AI routes do not console.error raw Error objects", () => {
  const apiFiles = walk(join(root, "src", "app", "api"));
  const dumps: string[] = [];
  for (const file of apiFiles) {
    const text = readFileSync(file, "utf8");
    if (text.includes("console.error(error)")) dumps.push(file);
  }
  assert.deepEqual(dumps, []);
  const pipeline = readFileSync(join(root, "src", "lib", "pipeline.ts"), "utf8");
  assert.match(pipeline, /safeServerLog\(\{ route: "pipeline"/);
  assert.doesNotMatch(pipeline, /console\.error\(error\)/);
  const groq = readFileSync(join(root, "src", "lib", "groq.ts"), "utf8");
  assert.match(groq, /Groq \$\{opts\.label \?\? "request"\} retry/);
  assert.doesNotMatch(groq, /error\.message/);
  const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
  assert.match(schema, /promptText\s+String \/\/ R8:/);
});
