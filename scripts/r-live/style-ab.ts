// Style A/B on NEW author replies (not the R5 eight): 8 dialogues x 6-10 turns, one script build each. Run twice with the SAME
// replies: without and with VOCAL_DIALOGUE_STYLE_RULES=1. Local test Postgres only; model through the S1 gateway.
// Run: DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL node --env-file=.env --import tsx scripts/r-live/style-ab.ts --out=<json> --md=<md> [--token-cap=N]
// Prints counters and ids only, never keys or prompts. No app retries; one own retry per call after 429/5xx/timeout.
import { appendFileSync, writeFileSync } from "node:fs";
import { resetPrismaClient } from "../../src/lib/db";
import { closePostgresTestDb, openPostgresTestDb } from "../../tests/helpers/postgres-test-db";

(process.env as { NODE_ENV?: string }).NODE_ENV = "test";
process.env.VOCAL_TAKE_DIAGNOSIS = "1";
process.env.VOCAL_AI_NO_RETRY = "1";

const argOf = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const OUT = argOf("out");
const MD = argOf("md");
const RAW = argOf("raw");
const TOKEN_CAP = Number(argOf("token-cap") ?? "260000");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OFF = ["Кстати, какой сегодня курс доллара?", "Расскажи что-нибудь смешное."];
const READY = "Я уже знаю, что хочу снять: показать, как я закрываю дверь и выключаю уведомления. Давайте снимать это.";

const DIALOGUES: { title: string; body: string; replies: string[] }[] = [
  { title: "Спор с тёщей", body: "Я перестал спорить с тёщей про воспитание и заметил, что мы стали лучше общаться.", replies: ["Это было в феврале, на семейном обеде.", "Она сказала, что ребёнка надо кормить строго по часам, а я промолчал.", "Раньше я бы начал доказывать своё, и мы разошлись бы злые.", "После обеда она сама спросила, как мы решаем с режимом.", "Мне кажется, молчание тоже может быть ответом.", "Хочу сказать другим родителям: не каждый спор надо выигрывать.", "Не знаю, что ещё добавить."] },
  { title: "Покупки в стрессе", body: "Когда мне тревожно, я иду в магазин и покупаю ненужные вещи, а потом жалею.", replies: ["Последний раз это были три одинаковые кружки.", "Я зашёл за хлебом после тяжёлого созвона.", "Дома я понял, что кружки мне не нужны, и стало ещё хуже.", "Не знаю, почему именно кружки.", "Теперь я пишу список перед выходом из дома.", "Список помогает, но не всегда."] },
  { title: "Почему я бросил курсы", body: "Я бросил онлайн-курс по программированию на третьей неделе, хотя очень хотел его пройти.", replies: ["Я записался в январе и занимался по вечерам.", "На третьей неделе пошли задачи, которые я не мог решить сам.", "Я два вечера просидел над одной задачей и ничего не получилось.", "Писать в чат курса мне было неловко.", "Не знаю.", "Сейчас я думаю, что надо было просто спросить.", "Хочу сказать тем, кто застрял: просить помощи не стыдно.", "Это всё, что я хотел рассказать."] },
  { title: "Новая работа", body: "Через месяц после выхода на новую работу я понял, что боюсь ошибиться на каждом шагу.", replies: ["Я работаю аналитиком, отчёты уходят напрямую директору.", "На прошлой неделе я перепроверял одну таблицу четыре раза.", "Директор потом сказал, что отчёт был хороший.", "Я всё равно не успокоился.", "Коллега посоветовала сначала отправлять черновик ей.", "Это помогло, страх стал меньше.", "Думаю, страх ошибки живёт там, где нет второго человека.", "Хочу сказать новичкам: найдите того, кто посмотрит ваш черновик."] },
  { title: "Утренняя пробежка", body: "Я бегаю по утрам уже месяц и впервые не пропустил ни одного дня.", replies: ["Раньше я бросал на второй неделе.", "В этот раз я кладу кроссовки у кровати с вечера.", "Утром мне остаётся только встать и выйти.", READY, READY, "Да, это и есть то, что я хочу показать.", "Больше добавить нечего.", "Можно переходить к съёмке."] },
  { title: "Фотография для новичков", body: "Новички думают, что для хороших фото нужна дорогая камера, но дело в свете.", replies: ["Я снимаю на телефон уже пять лет.", "Самые удачные кадры у меня были у окна утром.", "Дорогая камера в тёмной комнате снимает хуже телефона у окна.", "Хорошо, когда свет мягкий, без прямого солнца.", "Не знаю, как ещё объяснить.", "Просто встаньте лицом к окну и сделайте снимок.", "Это и есть мой совет."] },
  { title: "Соседи и шум", body: "Сосед сверху шумит по ночам, и я месяц не решался с ним поговорить.", replies: ["Он двигает мебель около полуночи.", OFF[0], "Я боялся, что он обидится или нагрубит.", OFF[1], "В итоге я оставил ему записку под дверью.", "Через два дня шум прекратился.", "Я понял, что страх разговора был больше самой проблемы.", "Хочу сказать: напишите записку, если страшно говорить."] },
  { title: "Соседская собака", body: "Собака соседей лает, когда хозяев нет дома, и я не знаю, как об этом сказать.", replies: ["Она лает примерно с восьми до десяти утра.", "Не знаю.", "Я пробовал надевать наушники, но это не выход.", "Не знаю, что им сказать, чтобы не обидеть.", "Наверное, надо начать с того, что я переживаю за собаку.", "Я так и скажу при встрече.", "Хочу закончить этим."] },
];

type Counter = { attempts: number; failures: { status: number | string; code: string; retried: boolean }[] };
async function main() {
  const db = await openPostgresTestDb();
  await resetPrismaClient();
  const { prisma } = db;
  const { createThoughtFromText } = await import("../../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../../src/lib/dialogue");
  const { generateV05Script } = await import("../../src/lib/v05-script");
  const { defaultCompleteJson } = await import("../../src/lib/ai/complete");
  const stats: Counter = { attempts: 0, failures: [] };
  let current = "";
  const complete = async (args: Parameters<typeof defaultCompleteJson>[0]) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      stats.attempts += 1;
      try {
        const result = await defaultCompleteJson(args);
        if (RAW) appendFileSync(RAW, JSON.stringify({ dialogue: current, label: args.label ?? "chat", text: result.text }) + "\n");
        return result;
      } catch (error) {
        const e = error as { status?: number; code?: string; message?: string; headers?: Record<string, string> };
        const status = e.status ?? "none";
        const retryable = status === 429 || (typeof status === "number" && status >= 500) || /вовремя|timeout|timed out/i.test(String(e.message ?? ""));
        stats.failures.push({ status, code: String(e.code ?? "").slice(0, 40), retried: retryable && attempt === 0 });
        console.warn(`provider failure: status=${status} retry=${retryable && attempt === 0}`);
        if (!retryable || attempt === 1) throw error;
        const ra = Number(e.headers?.["retry-after"]);
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 120) * 1000 + 750 : 20_000);
      }
    }
    throw new Error("unreachable");
  };
  const tokens = async () => (await prisma.aiCall.findMany({ select: { promptTokens: true, completionTokens: true } })).reduce((a, r) => a + (r.promptTokens ?? 0) + (r.completionTokens ?? 0), 0);

  const md: string[] = ["# Style A/B: диалоги целиком", ""];
  const scripts: Record<string, string> = {};
  let n = 0;
  for (const d of DIALOGUES) {
    n += 1;
    if ((await tokens()) > TOKEN_CAP) { console.log(`stopped before dialogue ${n}: token cap`); break; }
    current = d.title;
    const made = await createThoughtFromText({ title: d.title, body: d.body, idempotencyKey: `ab-${n}` });
    const turns = ["уточни", ...d.replies];
    for (let i = 0; i < turns.length; i += 1) {
      try {
        await sendDialogueMessage(made.reel.id, { text: turns[i], idempotencyKey: `ab-${n}-t${i}` }, complete);
      } catch { /* the failed turn is stored as an error message and counted below */ }
      await sleep(2500 + Math.floor(Math.random() * 1500));
    }
    try {
      const ws = await generateV05Script(made.reel.id, { idempotencyKey: `ab-${n}-script` }, complete);
      scripts[d.title] = `ok(changes=${ws.viewingChanges.length})`;
    } catch (error) {
      scripts[d.title] = (error as { code?: string }).code ?? "error";
    }
    const thread = await prisma.dialogueThread.findUnique({ where: { reelId: made.reel.id } });
    const rows = thread ? await prisma.dialogueMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } }) : [];
    md.push(`## ${n}. ${d.title}`, "");
    for (const row of rows) {
      if (row.role === "user") md.push(`**Автор:** ${row.body}`, "");
      else if (row.status === "done") md.push(`**Vocal** (${row.kind}): ${row.body}`, "");
      else if (row.status === "error") md.push(`**Vocal** [ошибка хода]: ${row.body}`, "");
    }
    md.push(`_Сборка сценария: ${scripts[d.title]}_`, "");
  }
  if (MD) writeFileSync(MD, md.join("\n"));

  // Counters from the stored data
  const msgs = await prisma.dialogueMessage.findMany({ orderBy: { createdAt: "asc" } });
  const assistant = msgs.filter((m) => m.role === "assistant" && m.status === "done");
  const errors = msgs.filter((m) => m.role === "assistant" && m.status === "error");
  const NOT_EXEC = /вовремя|timeout|429|rate.?limit|лимит|limit/i;
  const notExecuted = errors.filter((m) => NOT_EXEC.test(m.body)).length;
  const marks = (m: { payloadJson: string }) => { try { return ((JSON.parse(m.payloadJson) as { discardedUpdates?: string[] }).discardedUpdates ?? []); } catch { return []; } };
  const actionOf = (m: { payloadJson: string }) => { try { return (JSON.parse(m.payloadJson) as { action?: { action?: string } }).action?.action ?? ""; } catch { return ""; } };
  // A false return = a redirect (replaced) on an author reply that is not one of the two off-topic lines.
  const byId = new Map(msgs.map((m) => [m.id, m]));
  void byId;
  let redirects = 0, falseReturns = 0;
  for (let i = 0; i < msgs.length; i += 1) {
    const m = msgs[i];
    if (m.role === "assistant" && m.status === "done" && marks(m).some((x) => x === "redirect_replaced" || x === "redirect_invalid")) {
      redirects += 1;
      const prev = [...msgs.slice(0, i)].reverse().find((x) => x.role === "user" && x.threadId === m.threadId);
      if (prev && !OFF.includes(prev.body)) falseReturns += 1;
    }
  }
  // Semantic repeats: within a dialogue, question pairs whose content-word overlap (Jaccard) is >= 0.5
  const toks = (t: string) => new Set(t.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4));
  let repeatPairs = 0, questionCount = 0;
  const byThread = new Map<string, string[]>();
  for (const m of assistant.filter((x) => x.kind === "question")) byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m.body]);
  for (const qs of byThread.values()) {
    questionCount += qs.length;
    for (let i = 1; i < qs.length; i += 1) {
      const a = toks(qs[i - 1]), b = toks(qs[i]);
      let shared = 0; for (const w of a) if (b.has(w)) shared += 1;
      if (a.size && b.size && shared / (a.size + b.size - shared) >= 0.5) repeatPairs += 1;
    }
  }
  // Content hints: the question puts a conclusion into the author's mouth.
  const HINT = /это показывает|получается,? что|значит,? что|то есть|выходит,? что|верно ли,? что|вы считаете,? что|вы думаете,? что|не так ли/i;
  const hintQuestions = assistant.filter((m) => m.kind === "question" && HINT.test(m.body)).length;
  const discarded: Record<string, number> = {};
  for (const m of assistant) for (const r of marks(m)) discarded[r] = (discarded[r] ?? 0) + 1;
  const textReplies = assistant.filter((m) => m.kind === "text");
  const suggestTakes = assistant.filter((m) => actionOf(m) === "suggest_take").length;
  const calls = await prisma.aiCall.findMany({ select: { kind: true, status: true, promptTokens: true, completionTokens: true } });
  const result = {
    styleRules: process.env.VOCAL_DIALOGUE_STYLE_RULES === "1",
    dialogues: Object.keys(scripts).length,
    turns: assistant.length + errors.length,
    errorTurns: errors.length - notExecuted,
    notExecutedTurns: notExecuted,
    redirects, falseReturns,
    questions: questionCount, semanticRepeatPairs: repeatPairs, hintQuestions,
    suggestTakeActions: suggestTakes, proposalRepeatReplaced: discarded.proposal_repeat_replaced ?? 0,
    textReplies: textReplies.length,
    scripts,
    discarded,
    aiCallTokens: calls.reduce((a, c) => a + (c.promptTokens ?? 0) + (c.completionTokens ?? 0), 0),
    providerAttempts: stats.attempts, failures: stats.failures,
  };
  if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result, null, 1));
  await closePostgresTestDb(db);
}
main().then(() => process.exit(0)).catch((error) => { console.error("style-ab failed:", error instanceof Error ? error.message.slice(0, 200) : "error"); process.exit(1); });
