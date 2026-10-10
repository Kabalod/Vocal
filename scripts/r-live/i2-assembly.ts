// I2: the build step only. The dialogue of a saved run (h1-B-<seed>.md + its raw log) is REPLAYED without any model call
// (the recorded answers are fed back), then the script is built twice from the same state: facts only (VOCAL_FACT_QUOTES=0) and facts with
// a short verbatim quote (=1). 12 live calls for 6 dialogues. With --dry nothing live happens: the two build inputs are measured
// and the token cost is estimated. Local test Postgres only.
// Run: DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL node --env-file=.env --import tsx scripts/r-live/i2-assembly.ts --dir=<scratch> --seed=1 [--dry] [--out=<json>] [--md=<md>]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resetPrismaClient } from "../../src/lib/db";
import { closePostgresTestDb, openPostgresTestDb } from "../../tests/helpers/postgres-test-db";
import { scriptRepeats } from "../../src/lib/author-speech";
import { factShares, fillersIn, phraseShares } from "./script-metrics-lib";

(process.env as { NODE_ENV?: string }).NODE_ENV = "test";
process.env.VOCAL_TAKE_DIAGNOSIS = "1";
process.env.VOCAL_AI_NO_RETRY = "1";
process.env.VOCAL_TURN_POLICY = "0"; // the recorded answers are replayed as they were; guards would ask the model again
process.env.VOCAL_DAILY_TOKEN_LIMIT = "50000000";

const argOf = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const DIR = argOf("dir") ?? ".";
const SEED = argOf("seed") ?? "1";
const DRY = process.argv.includes("--dry");
// --quotes-only: a single build per dialogue, with quotes (at most two per script); the "without quotes" build is not repeated.
const QUOTES_ONLY = process.argv.includes("--quotes-only");

type Raw = { dialogue: string; label: string; text: string };

async function main() {
  const md = readFileSync(path.join(DIR, `h1-B-${SEED}.md`), "utf8");
  const raw = readFileSync(path.join(DIR, `h1-B-${SEED}-raw.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Raw);
  const db = await openPostgresTestDb();
  await resetPrismaClient();
  const { createThoughtFromText } = await import("../../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../../src/lib/dialogue");
  const { generateV05Script, collectV05SourceTexts } = await import("../../src/lib/v05-script");
  const { defaultCompleteJson } = await import("../../src/lib/ai/complete");
  const { prisma } = db;

  let liveCalls = 0, liveTokens = 0;
  const results: Record<string, unknown>[] = [];
  const out: string[] = ["# I2: сборка до и после цитат (повтор диалога без вызовов модели)", ""];
  for (const block of md.split(/\n## /).slice(1)) {
    const pid = block.split(".")[0];
    const title = /«(.+?)»/.exec(block.split("\n")[0])?.[1] ?? pid;
    const opening = /\*\*Первое сообщение \(дубль\):\*\* (.*)/.exec(block)?.[1] ?? "";
    const said = [...block.matchAll(/\*\*Автор:\*\* (.*)/g)].map((m) => m[1]);
    const queues: Record<string, string[]> = {};
    for (const r of raw.filter((x) => x.dialogue === pid && x.label !== "script")) (queues[r.label] ??= []).push(r.text);
    const replay = (async (args: { label?: string }) => {
      const queue = queues[args.label ?? "chat"];
      const text = queue?.shift();
      if (text === undefined) throw new Error(`no recorded answer for ${args.label}`);
      return { text, usage: { promptTokens: 0, completionTokens: 0 } };
    }) as never;
    const made = await createThoughtFromText({ title, body: opening, idempotencyKey: `i2-${SEED}-${pid}` });
    for (let i = 0; i < said.length; i += 1) {
      try { await sendDialogueMessage(made.reel.id, { text: said[i], idempotencyKey: `i2-${SEED}-${pid}-${i}` }, replay); } catch { /* a replayed turn that fails is simply not replayed */ }
    }
    const answers = said.slice(1);
    const row: Record<string, unknown> = { persona: pid };
    const facts = JSON.parse((await prisma.thoughtState.findUniqueOrThrow({ where: { reelId: made.reel.id }, select: { factsJson: true } })).factsJson) as { text: string }[];
    row.factsInState = facts.length;
    for (const quotes of QUOTES_ONLY ? ["1"] : ["0", "1"]) {
      process.env.VOCAL_FACT_QUOTES = quotes;
      const sources = await collectV05SourceTexts(made.reel.id);
      const chars = sources.texts.reduce((a, t) => a + t.label.length + t.text.length, 0);
      row[`inputChars_${quotes}`] = chars;
      row[`quotesInInput_${quotes}`] = sources.texts.filter((t) => t.text.includes("Слова автора:")).length;
      row[`quotesText_${quotes}`] = sources.texts.filter((t) => t.text.includes("Слова автора:")).map((t) => t.text.split("Слова автора:")[1].trim());
      if (DRY) continue;
      let scriptText = "";
      let tokens = 0;
      let modelScript = "";
      try {
        const complete = (async (args: Parameters<typeof defaultCompleteJson>[0]) => {
          const result = await defaultCompleteJson(args);
          try { modelScript = String((JSON.parse(result.text) as { script?: string }).script ?? ""); } catch { /* none */ }
          liveCalls += 1;
          tokens += (result.usage?.promptTokens ?? 0) + (result.usage?.completionTokens ?? 0);
          return result;
        }) as never;
        const ws = await generateV05Script(made.reel.id, { idempotencyKey: `i2-build-${SEED}-${pid}-${quotes}` }, complete);
        scriptText = ws.viewing?.body ?? ws.draft?.body ?? "";
      } catch (error) {
        row[`error_${quotes}`] = (error as { code?: string }).code ?? "error";
      }
      liveTokens += tokens;
      const p = scriptText ? phraseShares(answers, scriptText) : null;
      const f = scriptText ? factShares(facts.map((x) => x.text), scriptText) : null;
      row[`phrases_${quotes}`] = p ? { raw: `${p.raw.found}/${p.raw.total}`, clean: `${p.clean.found}/${p.clean.total}` } : null;
      row[`facts_${quotes}`] = f ? `${f.raw.found}/${f.raw.total}` : null;
      row[`fillers_${quotes}`] = scriptText ? fillersIn(scriptText) : null;
      row[`tokens_${quotes}`] = tokens;
      row[`repeatsModel_${quotes}`] = modelScript ? scriptRepeats(modelScript) : null;
      row[`repeatsFinal_${quotes}`] = scriptText ? scriptRepeats(scriptText) : null;
      row[`script_${quotes}`] = scriptText;
    }
    results.push(row);
  }
  const summary = { dry: DRY, seed: SEED, liveCalls, liveTokens, results: results.map((r) => ({ ...r, script_0: undefined, script_1: undefined })) };
  if (!DRY) {
    for (const r of results) out.push(`## ${r.persona}`, "", "**Без цитат:**", String(r.script_0 ?? ""), "", "**С цитатами:**", String(r.script_1 ?? ""), "");
    if (argOf("md")) writeFileSync(argOf("md")!, out.join("\n"));
  }
  if (argOf("out")) writeFileSync(argOf("out")!, JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  await closePostgresTestDb(db);
}
main().then(() => process.exit(0)).catch((error) => { console.error("i2 failed:", error instanceof Error ? error.message.slice(0, 300) : "error"); process.exit(1); });
