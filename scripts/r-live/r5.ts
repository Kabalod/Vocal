// R5 (WITHOUT cards): 8 dialogues x 6 turns on a live model. DO NOT RUN without the owner's "запускай R5" and in a new day.
// Composition: 3 raw takes of different genres taken from Analyz as INTERNAL inputs (printed by instagram id only),
// 3 ordinary dialogues, 2 dialogues with off-topic turns. Local test Postgres only; model through the S1 gateway.
// Run: DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL node --env-file=.env --import tsx scripts/r-live/r5.ts
// Pause 3-5 s between turns, one retry after a 429. Prints counters, ids and the two off-topic examples (our own short
// replies and the model's question), never keys, prompts or the raw take texts.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resetPrismaClient } from "../../src/lib/db";
import { closePostgresTestDb, openPostgresTestDb } from "../../tests/helpers/postgres-test-db";

(process.env as { NODE_ENV?: string }).NODE_ENV = "test";
process.env.VOCAL_TAKE_DIAGNOSIS = "1";

const ROOT = path.resolve(__dirname, "../../Analyz");
const TOKEN_CAP = 160_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CUID = /\bc[a-z0-9]{24}\b|\bfact_[A-Za-z0-9_-]+|\bgap_[A-Za-z0-9_-]+|\bcraft_[A-Za-z0-9_]+/;

type Rec = { instagram_id: string; text: string; word_count: number };
function fromCombined(name: string, decisionDir: string): { id: string; text: string } {
  const rows = (JSON.parse(readFileSync(path.join(ROOT, `Blogers2/${name}_combined.json`), "utf8")) as { records: Rec[] }).records;
  const full = new Set(
    readFileSync(path.join(ROOT, `Done/${decisionDir}/00_prompt0-gateway.jsonl`), "utf8")
      .split("\n").filter(Boolean).map((l) => JSON.parse(l) as { instagram_id: string; decision: string })
      .filter((r) => r.decision === "FULL").map((r) => r.instagram_id),
  );
  const pick = rows.find((r) => full.has(r.instagram_id) && r.word_count >= 90 && r.word_count <= 130 && r.text.trim());
  if (!pick) throw new Error(`no input for ${name}`);
  return { id: pick.instagram_id, text: pick.text.trim() };
}
function fromHadunkin(): { id: string; text: string } {
  const catalog = JSON.parse(readFileSync(path.join(ROOT, "hadunkin/_out/01_catalog_80plus.json"), "utf8")) as { id: string; words: number; file: string; dupOf?: string[] }[];
  const pick = catalog.find((c) => c.words >= 100 && c.words <= 125 && !(c.dupOf && c.dupOf.length));
  if (!pick) throw new Error("no hadunkin input");
  const raw = readFileSync(path.join(ROOT, "hadunkin", pick.file), "utf8").trim();
  return { id: pick.id, text: raw };
}

const NEUTRAL_ANSWERS = [
  "Это из моего опыта, я так и думаю.",
  "Могу рассказать подробнее про один случай.",
  "Мне важно, чтобы это было понятно обычному человеку.",
  "Да, главное я уже сказал.",
  "Хочу закончить этим.",
];
const OFF_TOPIC = ["А какая сегодня погода?", "Расскажи анекдот.", "Кто выиграл матч вчера?"];
const ORDINARY: { title: string; body: string; answers: string[] }[] = [
  { title: "Привычка и мотивация", body: "Я неделю вставал в шесть утра и понял, что мотивация пропала на третий день, а привычка осталась.", answers: ["Это было в марте, я начал бегать по утрам.", "На третий день мне стало лень, но я всё равно вышел, потому что так уже делал вчера.", "Хочу сказать тем, кто бросает через неделю: не ждите настроения.", "Привычка держится на простом первом шаге, а не на желании.", "Первый шаг — просто надеть кроссовки."] },
  { title: "Отчёт и злость", body: "Я вчера снова не дописал отчёт и разозлился на себя, хотя на самом деле меня отвлекали.", answers: ["Меня три раза звали на встречи, я их не планировал.", "Я злюсь на себя, потому что привык считать, что должен успевать всё.", "Думаю, злиться надо на привычку не защищать своё время.", "Теперь я закрываю дверь на два часа утром.", "Это помогает дописывать до обеда."] },
  { title: "Чай на подоконнике", body: "Чай остыл на подоконнике, пока я писал письмо, и я понял, что не замечаю, как проходит время.", answers: ["Письмо было длинное, я начал его в обед, а закончил под вечер.", "Время не исчезает, просто я не смотрю на часы, когда мне интересно.", "Хочу рассказать, что скука и интерес по-разному растягивают время.", "Когда скучно, каждая минута заметна.", "Интерес делает часы короткими."] },
];
const WITH_OFF_TOPIC: { title: string; body: string; answers: string[] }[] = [
  { title: "Первый клиент", body: "Мой первый клиент написал мне через знакомых, и я чуть не отказался, потому что боялся не справиться.", answers: ["Это был небольшой заказ на сайт для кофейни.", OFF_TOPIC[0], OFF_TOPIC[1], "Я не отказался, потому что вспомнил, что в прошлый раз пожалел о пропущенном шансе.", "Хочу сказать новичкам: страх справиться почти всегда больше самой задачи."] },
  { title: "Утренний кофе", body: "Я перестал пить кофе по утрам и заметил, что хуже всего первые три дня, дальше легче.", answers: ["Я пил по три чашки, и голова болела с понедельника по среду.", OFF_TOPIC[2], OFF_TOPIC[0], "К четвергу я заметил, что просыпаюсь без будильника.", "Главное пережить первые три дня без исключений."] },
];

// Options for focused re-runs (not the whole R5): --only=offtopic|repeats  --turns=N  --no-scripts  --raw=<file>
const argOf = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ONLY = argOf("only");
const TURNS = Number(argOf("turns") ?? "0");
const NO_SCRIPTS = process.argv.includes("--no-scripts");
const RAW_FILE = argOf("raw");

async function main() {
  const db = await openPostgresTestDb();
  await resetPrismaClient(); // the app client must follow the isolated schema
  const { prisma } = db;
  const { createThoughtFromText } = await import("../../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../../src/lib/dialogue");
  const { generateV05Script } = await import("../../src/lib/v05-script");

  const raw = [
    { kind: "personal (hadunkin)", ...fromHadunkin() },
    { kind: "explanation (chemistry_by_olga)", ...fromCombined("chemistry_by_olga", "Chemistry_by_olga") },
    { kind: "story (marysstories)", ...fromCombined("marysstories", "Marysstories") },
  ];
  const plans = [
    ...raw.map((r) => ({ label: `raw:${r.kind}:${r.id}`, title: `Сырой дубль ${r.id}`, body: r.text, answers: NEUTRAL_ANSWERS })),
    ...ORDINARY.map((o) => ({ label: `ordinary:${o.title}`, title: o.title, body: o.body, answers: o.answers })),
    ...WITH_OFF_TOPIC.map((o) => ({ label: `offtopic:${o.title}`, title: o.title, body: o.body, answers: o.answers })),
  ];

  const { defaultCompleteJson } = await import("../../src/lib/ai/complete");
  // Raw model answers go to a file OUTSIDE the test schema, so they survive the cleanup.
  let currentDialogue = "";
  const complete = async (args: Parameters<typeof defaultCompleteJson>[0]) => {
    const result = await defaultCompleteJson(args);
    if (RAW_FILE) appendFileSync(RAW_FILE, JSON.stringify({ dialogue: currentDialogue, label: args.label ?? "chat", text: result.text }) + "\n");
    return result;
  };
  if (ONLY) {
    const keep = (label: string) => (ONLY === "offtopic" ? label.startsWith("offtopic") : ONLY === "repeats" ? /DYSu2FDuQyw|DW6nB5hDPPa/.test(label) : true);
    for (let i = plans.length - 1; i >= 0; i -= 1) if (!keep(plans[i].label)) plans.splice(i, 1);
  }
  if (process.argv.includes("--dry")) {
    console.log(JSON.stringify(plans.map((p) => ({ label: p.label, words: p.body.split(/\s+/).length, turns: p.answers.length + 1 })), null, 1));
    await closePostgresTestDb(db);
    return;
  }
  const results: { dialogue: string; turn: number; outcome: string }[] = [];
  const scripts: Record<string, string[]> = {};
  const offTopicExamples: { dialogue: string; authorSaid: string; modelAsked: string }[] = [];
  const reelIds: string[] = [];
  let spent = 0;
  const tokens = async () => {
    const rows = await prisma.aiCall.findMany({ select: { promptTokens: true, completionTokens: true } });
    return rows.reduce((a, r) => a + (r.promptTokens ?? 0) + (r.completionTokens ?? 0), 0);
  };

  let n = 0;
  for (const plan of plans) {
    n += 1;
    spent = await tokens();
    if (spent > TOKEN_CAP) {
      console.log(`stopped before dialogue ${n}: token cap ${TOKEN_CAP} reached (${spent})`);
      break;
    }
    currentDialogue = plan.label;
    const made = await createThoughtFromText({ title: plan.title, body: plan.body, idempotencyKey: `r5-${n}` });
    reelIds.push(made.reel.id);
    const allTurns = ["уточни", ...plan.answers];
    const turns = TURNS > 0 ? allTurns.slice(0, TURNS) : allTurns;
    for (let i = 0; i < turns.length; i += 1) {
      let outcome = "ok";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await sendDialogueMessage(made.reel.id, { text: turns[i], idempotencyKey: `r5-${n}-t${i}-${attempt}` }, complete);
          outcome = "ok";
          break;
        } catch (error) {
          outcome = (error as { code?: string }).code ?? "error";
          if (/429|Rate limit/i.test(error instanceof Error ? error.message : "") && attempt === 0) {
            outcome = "429";
            await sleep(20_000);
            continue;
          }
          break;
        }
      }
      results.push({ dialogue: plan.label, turn: i, outcome });
      if (OFF_TOPIC.includes(turns[i]) && outcome === "ok") {
        const last = await prisma.dialogueMessage.findFirst({ where: { threadId: (await prisma.dialogueThread.findUniqueOrThrow({ where: { reelId: made.reel.id } })).id, role: "assistant", status: "done" }, orderBy: { createdAt: "desc" } });
        if (last) offTopicExamples.push({ dialogue: plan.label.split(":")[1], authorSaid: turns[i], modelAsked: last.body });
      }
      await sleep(3000 + Math.floor(Math.random() * 2000));
    }
    scripts[plan.label] = [];
    for (let build = 1; build <= (NO_SCRIPTS ? 0 : 2); build += 1) {
      try {
        const ws = await generateV05Script(made.reel.id, { idempotencyKey: `r5-${n}-script-${build}` }, complete);
        scripts[plan.label].push(`ok(changes=${ws.viewingChanges.length})`);
      } catch (error) {
        scripts[plan.label].push((error as { code?: string }).code ?? "error");
      }
    }
  }

  const mdArg = process.argv.find((a) => a.startsWith("--md="))?.slice(5);
  if (mdArg) {
    const lines = [
      "# R5: диалоги целиком",
      "",
      "Реплики автора здесь заранее подготовленные (список в `R5_REPORT.md`), модель их не генерировала. Первое сообщение сырых дублей (текст из Analyz) не приводится, только id.",
      "",
    ];
    let idx = 0;
    for (const [label, reelId] of plans.map((p, i) => [p.label, reelIds[i]] as const)) {
      idx += 1;
      if (!reelId) continue;
      const thread = await prisma.dialogueThread.findUnique({ where: { reelId } });
      const rows = thread ? await prisma.dialogueMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } }) : [];
      lines.push(`## ${idx}. ${label}`, "");
      for (const row of rows) {
        if (row.role === "user") lines.push(`**Автор:** ${row.body}`, "");
        else if (row.status === "done") lines.push(`**Vocal** (${row.kind}): ${row.body}`, "");
        else if (row.status === "error") lines.push(`**Vocal** [ошибка хода]: ${row.body}`, "");
      }
      const ws = scripts[label] ?? [];
      lines.push(`_Сборка сценария: ${ws.join(", ") || "не выполнялась"}_`, "");
    }
    writeFileSync(mdArg, lines.join("\n"));
  }
  const msgs = await prisma.dialogueMessage.findMany({ select: { role: true, id: true, body: true, payloadJson: true, status: true } });
  const assistant = msgs.filter((m) => m.role === "assistant" && m.status === "done");
  const userIds = new Set(msgs.filter((m) => m.role === "user").map((m) => m.id));
  const leaks = assistant.filter((m) => CUID.test(m.body)).length;
  const discarded: Record<string, number> = {};
  for (const m of assistant) for (const r of (JSON.parse(m.payloadJson) as { discardedUpdates?: string[] }).discardedUpdates ?? []) discarded[r] = (discarded[r] ?? 0) + 1;
  const states = await prisma.thoughtState.findMany({ select: { factsJson: true } });
  const facts = states.flatMap((s) => JSON.parse(s.factsJson) as { sourceType: string; sourceId: string }[]);
  const factsWithoutAuthorReply = facts.filter((f) => f.sourceType !== "dialogue_message" || !userIds.has(f.sourceId)).length;
  // Turn classes (R report rule): ok / error (the model answered and the answer failed) / NOT EXECUTED (the provider did
  // not answer: timeout, rate limit, our own budget stop). Not-executed turns are neither a success nor a turn error and
  // are excluded from the error share; any of them makes the run incomplete. Stored error rows are the source of truth:
  // a failed turn leaves exactly one assistant error message, thrown or not.
  const NOT_EXECUTED = /вовремя|timeout|429|rate.?limit|лимит|limit/i;
  const errorRows = msgs.filter((m) => m.role === "assistant" && m.status === "error");
  const notExecutedRows = errorRows.filter((m) => NOT_EXECUTED.test(m.body));
  const turnErrorRows = errorRows.filter((m) => !NOT_EXECUTED.test(m.body));
  const countBy = (rows: typeof errorRows) =>
    rows.reduce<Record<string, number>>((a, m) => ((a[m.body.slice(0, 60)] = (a[m.body.slice(0, 60)] ?? 0) + 1), a), {});
  const executedTurns = Math.max(1, results.length - notExecutedRows.length);
  const failed = turnErrorRows;
  const calls = await prisma.aiCall.findMany({ select: { kind: true, status: true, promptTokens: true, completionTokens: true } });
  const sum: Record<string, { calls: number; prompt: number; completion: number }> = {};
  for (const c of calls) {
    const k = `${c.kind}/${c.status}`;
    sum[k] ??= { calls: 0, prompt: 0, completion: 0 };
    sum[k].calls += 1;
    sum[k].prompt += c.promptTokens ?? 0;
    sum[k].completion += c.completionTokens ?? 0;
  }
  const allScripts = Object.values(scripts).flat();
  console.log(JSON.stringify({
    dialogues: Object.keys(scripts).length,
    turns: results.length,
    executedTurns,
    notExecutedTurns: notExecutedRows.length,
    notExecutedKinds: countBy(notExecutedRows),
    runComplete: notExecutedRows.length === 0,
    failedTurns: failed.length,
    failedShareOfExecuted: +(failed.length / executedTurns).toFixed(3),
    failedKinds: countBy(turnErrorRows),
    criterion1_failedShareAtMost25pct: notExecutedRows.length > 0 ? "not evaluated (run incomplete)" : failed.length / executedTurns <= 0.25,
    discardedUpdates: discarded,
    discardedFactsShare: +(((discarded.fact_invalid ?? 0)) / executedTurns).toFixed(3),
    factSourceReplaced: discarded.fact_source_replaced ?? 0,
    factSourceReplacedShareOfFacts: +(((discarded.fact_source_replaced ?? 0)) / Math.max(1, facts.length)).toFixed(3),
    downgrades: { evidence: discarded.downgrade_evidence ?? 0, gap: discarded.downgrade_gap ?? 0 },
    updatesDroppedAtCommit: discarded.update_dropped_at_commit ?? 0,
    neutralQuestionsAfterIdLeak: assistant.filter((m) => /служебными данными заменён/.test(m.payloadJson)).length,
    scripts,
    criterion2_allScriptsOkWithChanges: allScripts.length > 0 && allScripts.every((s) => /^ok\(changes=[1-9]/.test(s)),
    leaksToAuthor: leaks,
    criterion3_noLeaks: leaks === 0,
    offTopicExamples,
    factsStored: facts.length,
    factsWithoutAuthorReply,
    criterion5_noFactWithoutAuthorReply: factsWithoutAuthorReply === 0,
    tokens: sum,
    totalTokens: await tokens(),
  }, null, 1));
  await closePostgresTestDb(db);
}
main().then(() => process.exit(0)).catch((error) => {
  console.error("r5 failed:", error instanceof Error ? error.message.slice(0, 200) : "error");
  process.exit(1);
});
