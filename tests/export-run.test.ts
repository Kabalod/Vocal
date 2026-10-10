import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { renderRunMarkdown } from "../scripts/export-run";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

const reply = (json: Record<string, unknown>, tokens = [120, 30]) => ({ text: JSON.stringify(json), usage: { promptTokens: tokens[0], completionTokens: tokens[1] } });
const idOf = (user: string) => /Текущее сообщение автора: (\S+?)\./.exec(user)?.[1] ?? "";
const ask = (question: string, fact?: string) => async (args: { user: string }) =>
  reply({
    action: "ask_question",
    question,
    clarificationReason: "нужно уточнение",
    whyUnknown: "мало данных",
    thoughtUpdate: { fact: fact ? { text: fact, sourceType: "dialogue_message", sourceId: idOf(args.user) } : null, closeGapIds: [] },
  });

test("K1: export-run writes one markdown with raw and normalized voice text, facts, script versions, what changed and tokens", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../src/lib/dialogue");
  const { generateV05Script } = await import("../src/lib/v05-script");
  const made = await createThoughtFromText({ title: "Пример экспорта", body: "Я начал ходить на рынок в шесть утра.", idempotencyKey: "export-run-1" });
  const reelId = made.reel.id;
  await sendDialogueMessage(reelId, { text: "уточни", idempotencyKey: "export-1" }, ask("Что вы там увидели?") as never);
  const whisper = "ну знаете в шесть утра рынок почти пустой и всё будто замерло продавцы спокойно рассказывают что привезли сегодня а тётя люба стоит у прилавка и советует брать сметану развесную потому что в банке она слишком жидкая";
  await sendDialogueMessage(reelId, { text: whisper, idempotencyKey: "export-2", voiceDurationLabel: "0:21" }, ask("Что она ещё сказала?", "Тётя Люба советует брать сметану развесную, потому что в банке она слишком жидкая") as never);
  await sendDialogueMessage(reelId, { text: "Нет ни записей, ни фото.", idempotencyKey: "export-3" }, ask("Что было потом?", "Нет ни записей, ни фото.") as never);
  await generateV05Script(reelId, { idempotencyKey: "export-build" }, (async () =>
    reply({ script: "В шесть утра рынок почти пустой.\nТётя Люба советует брать сметану развесную.", changes: ["Убрал слова-паразиты, потому что в речи они мешают"] }, [900, 140])) as never);

  const md = await renderRunMarkdown(prisma as never, reelId);
  assert.match(md, /Сырой текст Whisper:/);
  assert.ok(md.includes(whisper), "the raw Whisper text is exported as stored");
  assert.match(md, /Нормализованный текст/);
  assert.match(md, /### 3\. Автор \(голос, 0:21\)/);
  assert.match(md, /## Принятые факты\s+1\. Тётя Люба советует брать сметану развесную/);
  assert.doesNotMatch(md, /Нет ни записей, ни фото\.\s*_\(из сообщения/, "the don't-know answer is not an accepted fact");
  assert.match(md, /`fact_dontknow`/);
  assert.match(md, /## Версии сценария[\s\S]*Тётя Люба советует брать сметану развесную\./);
  assert.match(md, /Что изменено[\s\S]*Убрал слова-паразиты/);
  assert.match(md, /\| script \| done \| 900 \| 140 \|/);
  assert.match(md, /Итого: \d+ \+ \d+ = \d+ токенов/);
  if (process.env.EXPORT_EXAMPLE) writeFileSync(process.env.EXPORT_EXAMPLE, md);
});
