import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { classifyC00CorrectionSignal } from "../src/lib/c00-classify-signal";
import { peekAiCallBudget } from "../src/lib/ai-call-budget";
import { chatCompletionModel, resetGroq, usesXaiChat } from "../src/lib/groq";

for (const file of [path.resolve("D:/Vocal/.env.local"), path.resolve(process.cwd(), ".env.local")]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

resetGroq();

async function main() {
  if (!usesXaiChat()) {
    console.log(JSON.stringify({ ok: false, reason: "no_xai" }));
    process.exit(1);
  }
  const before = peekAiCallBudget();
  const classified = await classifyC00CorrectionSignal({
    userText: "Это сказал оператор, не я.",
    userMessageId: "msg_smoke",
    thoughtStateRevision: 1,
    facts: [{ id: "fact_seed", text: "Вечер тихий.", sourceType: "initial_note" }],
  });
  const after = peekAiCallBudget();
  console.log(
    JSON.stringify({
      ok: true,
      provider: "xai",
      model: chatCompletionModel("openai/gpt-oss-120b"),
      signalType: classified.candidate?.signalType ?? null,
      targetId: classified.candidate?.targetId ?? null,
      budgetBefore: before.count,
      budgetAfter: after.count,
      remaining: after.remaining,
    }),
  );
}

main().catch((error) => {
  const err = error as { status?: number; message?: string; name?: string };
  console.log(
    JSON.stringify({
      ok: false,
      status: err.status ?? null,
      name: err.name ?? null,
      message: err.message?.replace(/xai-[A-Za-z0-9]+/g, "xai-[redacted]") ?? "failed",
    }),
  );
  process.exit(1);
});
