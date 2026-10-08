// Live measurement of dialogue turns: SIX thoughts x FIVE turns = 30 turns, one diagnosis per thought, one script each.
// Local test Postgres only (TEST_DATABASE_URL), real model through the S1 gateway (daily limit applies).
// Run: DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL node --env-file=.env --import tsx scripts/r-live/measure.ts
// Prints only counters, never keys or prompts. Pause 3-5 s between turns; one retry after a 429.
import { resetPrismaClient } from "../../src/lib/db";
import { closePostgresTestDb, openPostgresTestDb } from "../../tests/helpers/postgres-test-db";

(process.env as { NODE_ENV?: string }).NODE_ENV = "test";
process.env.VOCAL_TAKE_DIAGNOSIS = "1";
process.env.VOCAL_AI_NO_RETRY = "1"; // no automatic app retries; the script keeps its own single retry after a 429

const THOUGHTS = [
  ["Привычка и мотивация", "Я неделю вставал в шесть утра и понял, что мотивация пропала на третий день, а привычка осталась.", ["Это было в марте, я начал бегать по утрам.", "На третий день мне стало лень, но я всё равно вышел, потому что так уже делал вчера.", "Хочу сказать тем, кто бросает через неделю: не ждите настроения.", "Привычка держится на простом первом шаге, а не на желании."]],
  ["Отчёт и злость", "Я вчера снова не дописал отчёт и разозлился на себя, хотя на самом деле меня отвлекали.", ["Меня три раза звали на встречи, я их не планировал.", "Я злюсь на себя, потому что привык считать, что должен успевать всё.", "Думаю, злиться надо на привычку не защищать своё время.", "Теперь я закрываю дверь на два часа утром."]],
  ["Чай на подоконнике", "Чай остыл на подоконнике, пока я писал письмо, и я понял, что не замечаю, как проходит время.", ["Письмо было длинное, я начал его в обед, а закончил под вечер.", "Время не исчезает, просто я не смотрю на часы, когда мне интересно.", "Хочу рассказать, что скука и интерес по-разному растягивают время.", "Когда скучно, каждая минута заметна."]],
  ["Первый клиент", "Мой первый клиент написал мне через знакомых, и я чуть не отказался, потому что боялся не справиться.", ["Это был небольшой заказ на сайт для кофейни.", "Я не отказался, потому что вспомнил, что в прошлый раз пожалел о пропущенном шансе.", "Хочу сказать новичкам: страх справиться почти всегда больше самой задачи.", "Первый заказ научил меня просить уточнения, а не гадать."]],
  ["Утренний кофе", "Я перестал пить кофе по утрам и заметил, что хуже всего первые три дня, дальше легче.", ["Я пил по три чашки, и голова болела с понедельника по среду.", "К четвергу я заметил, что просыпаюсь без будильника.", "Хочу сказать, что тяга проходит быстрее, чем кажется.", "Главное пережить первые три дня без исключений."]],
  ["Письмо себе", "Я написал письмо самому себе на год вперёд и вчера открыл его, а там совсем не то, что я ожидал.", ["Я писал, что хочу сменить работу, а сейчас доволен своей.", "Меня удивило, что страхи из письма почти все не сбылись.", "Думаю, мы плохо помним, чего боялись раньше.", "Теперь я пишу такие письма каждый январь."]],
] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CUID = /\bc[a-z0-9]{24}\b|\bfact_[A-Za-z0-9_-]+|\bgap_[A-Za-z0-9_-]+/;

async function main() {
  const db = await openPostgresTestDb();
  await resetPrismaClient();
  const { prisma } = db;
  const { createThoughtFromText } = await import("../../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../../src/lib/dialogue");
  const { generateV05Script } = await import("../../src/lib/v05-script");
  const results: { thought: number; turn: number; outcome: string }[] = [];
  const scriptResults: string[] = [];
  let n = 0;
  for (const [title, body, answers] of THOUGHTS) {
    n += 1;
    const made = await createThoughtFromText({ title, body, idempotencyKey: `live-${n}` });
    const turns = ["уточни", ...answers];
    for (let i = 0; i < turns.length; i += 1) {
      let outcome = "ok";
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await sendDialogueMessage(made.reel.id, { text: turns[i], idempotencyKey: `live-${n}-t${i}-${attempt}` });
          outcome = "ok";
          break;
        } catch (error) {
          const msg = error instanceof Error ? error.message : "";
          outcome = (error as { code?: string }).code ?? "error";
          if (/429|Rate limit/i.test(msg) && attempt === 0) {
            outcome = "429";
            await sleep(20000);
            continue;
          }
          break;
        }
      }
      results.push({ thought: n, turn: i, outcome });
      await sleep(3000 + Math.floor(Math.random() * 2000));
    }
    try {
      const ws = await generateV05Script(made.reel.id, { idempotencyKey: `live-${n}-script` });
      scriptResults.push(`ok(changes=${ws.viewingChanges.length})`);
    } catch (error) {
      scriptResults.push((error as { code?: string }).code ?? "error");
    }
  }
  const msgs = await prisma.dialogueMessage.findMany({ where: { role: "assistant", status: "done" }, select: { body: true, kind: true, payloadJson: true } });
  const discarded: Record<string, number> = {};
  let leaks = 0;
  for (const m of msgs) {
    if (CUID.test(m.body)) leaks += 1;
    for (const reason of (JSON.parse(m.payloadJson) as { discardedUpdates?: string[] }).discardedUpdates ?? []) discarded[reason] = (discarded[reason] ?? 0) + 1;
  }
  const failed = results.filter((r) => r.outcome !== "ok");
  const facts = await prisma.thoughtState.findMany({ select: { factsJson: true } });
  const calls = await prisma.aiCall.findMany({ select: { kind: true, status: true, promptTokens: true, completionTokens: true } });
  const sum: Record<string, { calls: number; prompt: number; completion: number }> = {};
  for (const c of calls) {
    const k = `${c.kind}/${c.status}`;
    sum[k] ??= { calls: 0, prompt: 0, completion: 0 };
    sum[k].calls += 1;
    sum[k].prompt += c.promptTokens ?? 0;
    sum[k].completion += c.completionTokens ?? 0;
  }
  console.log(JSON.stringify({
    turns: results.length,
    failedTurns: failed.length,
    failedShare: +(failed.length / results.length).toFixed(3),
    failedByOutcome: failed.reduce<Record<string, number>>((a, r) => ((a[r.outcome] = (a[r.outcome] ?? 0) + 1), a), {}),
    discardedUpdates: discarded,
    discardedTotal: Object.values(discarded).reduce((a, b) => a + b, 0),
    committedReplies: msgs.length,
    leaksToAuthor: leaks,
    factsStored: facts.reduce((a, f) => a + (JSON.parse(f.factsJson) as unknown[]).length, 0),
    scripts: scriptResults,
    tokens: sum,
  }, null, 1));
  await closePostgresTestDb(db);
}
main().then(() => process.exit(0)).catch((error) => {
  console.error("measure failed:", error instanceof Error ? error.message.slice(0, 200) : "error");
  process.exit(1);
});
