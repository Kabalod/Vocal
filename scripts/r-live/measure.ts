// Live measurement for the R5 budget: three short thoughts, each = create → diagnosis → 3 dialogue turns → one script.
// Local test Postgres only (TEST_DATABASE_URL), real model through the S1 gateway, so the daily limit applies.
// Run: node --env-file=.env --import tsx scripts/r-live/measure.ts   with DATABASE_URL/DIRECT_URL pre-set to the test DB
// (pre-set variables win over --env-file). Prints only token counts, never keys or prompts.
import { resetPrismaClient } from "../../src/lib/db";
import { closePostgresTestDb, openPostgresTestDb } from "../../tests/helpers/postgres-test-db";

(process.env as { NODE_ENV?: string }).NODE_ENV = "test";
process.env.VOCAL_TAKE_DIAGNOSIS = "1";

const THOUGHTS = [
  {
    title: "Привычка и мотивация",
    body: "Я неделю вставал в шесть утра и понял, что мотивация пропала на третий день, а привычка осталась.",
    answers: ["Это было в марте, я начал бегать по утрам.", "На третий день мне стало лень, но я всё равно вышел, потому что так уже делал вчера.", "Хочу сказать тем, кто бросает через неделю: не ждите настроения."],
  },
  {
    title: "Отчёт и злость",
    body: "Я вчера снова не дописал отчёт и разозлился на себя, хотя на самом деле меня отвлекали.",
    answers: ["Меня три раза звали на встречи, я их не планировал.", "Я злюсь на себя, потому что привык считать, что должен успевать всё.", "Думаю, злиться надо на привычку не защищать своё время."],
  },
  {
    title: "Чай на подоконнике",
    body: "Чай остыл на подоконнике, пока я писал письмо, и я понял, что не замечаю, как проходит время.",
    answers: ["Письмо было длинное, я начал его в обед, а закончил под вечер.", "Время не исчезает, просто я не смотрю на часы, когда мне интересно.", "Хочу рассказать, что скука и интерес по-разному растягивают время."],
  },
];

async function main() {
  const db = await openPostgresTestDb();
  await resetPrismaClient(); // the app client must follow the isolated schema, not the base URL
  const { prisma } = db;
  const { createThoughtFromText } = await import("../../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../../src/lib/dialogue");
  const { generateV05Script } = await import("../../src/lib/v05-script");
  const out: Record<string, { calls: number; prompt: number; completion: number }> = {};
  let n = 0;
  const turnResults: string[] = [];
  for (const thought of THOUGHTS) {
    n += 1;
    const made = await createThoughtFromText({ title: thought.title, body: thought.body, idempotencyKey: `live-${n}` });
    const turns = ["уточни", ...thought.answers];
    for (let i = 0; i < turns.length; i += 1) {
      try {
        await sendDialogueMessage(made.reel.id, { text: turns[i], idempotencyKey: `live-${n}-t${i}` });
        turnResults.push("ok");
      } catch (error) {
        const code = (error as { code?: string }).code ?? "error";
        turnResults.push(code);
        console.log(`thought ${n} turn ${i}: ${code}: ${error instanceof Error ? error.message.slice(0, 120) : ""}`);
      }
    }
    try {
      await generateV05Script(made.reel.id, { idempotencyKey: `live-${n}-script` });
    } catch (error) {
      console.log(`thought ${n}: script not built (${error instanceof Error ? error.constructor.name : "error"}: ${(error as { code?: string }).code ?? ""})`);
    }
  }
  console.log("mode:", process.env.VOCAL_AI_MOCK === "1" ? "MOCK" : "LIVE", "schema:", db.schema, "aiCall rows:", await prisma.aiCall.count(), "dialogue msgs:", await prisma.dialogueMessage.count());
  const rows = await prisma.aiCall.findMany({ select: { kind: true, status: true, promptTokens: true, completionTokens: true } });
  for (const row of rows) {
    const key = `${row.kind}/${row.status}`;
    out[key] ??= { calls: 0, prompt: 0, completion: 0 };
    out[key].calls += 1;
    out[key].prompt += row.promptTokens ?? 0;
    out[key].completion += row.completionTokens ?? 0;
  }
  console.log("turns:", JSON.stringify(turnResults));
  console.log(JSON.stringify(out, null, 2));
  await closePostgresTestDb(db);
}
main().then(() => process.exit(0)).catch((error) => {
  console.error("measure failed:", error instanceof Error ? error.message.slice(0, 200) : "error");
  process.exit(1);
});
