import assert from "node:assert/strict";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { resetAiInflightForTests } from "../src/lib/ai/usage-guard";
import { withPostgresTestDb } from "./helpers/postgres-test-db";

test("R4: composeUnderstanding speaks in one human reply and carries no ids", async () => {
  const { composeUnderstanding } = await import("../src/lib/v05-script");
  assert.equal(composeUnderstanding({ position: "", intent: "", facts: [] }), null);
  const text = composeUnderstanding({
    position: "Привычка важнее мотивации.",
    intent: "",
    facts: [{ text: "Я неделю вставал в шесть." }, { text: "" }, { text: "Мотивация пропала на третий день" }],
  });
  assert.equal(text, "Я понял так: Привычка важнее мотивации; Я неделю вставал в шесть; Мотивация пропала на третий день. Собрать сценарий?");
});

test("R4: the leak check rejects card ids and internal ids", async () => {
  const { scriptLeaksInternalIds } = await import("../src/lib/v05-script");
  assert.equal(scriptLeaksInternalIds("Обычный текст автора.", ["abc123", null]), false);
  assert.equal(scriptLeaksInternalIds("Сделай как в craft_example_a.", []), true);
  assert.equal(scriptLeaksInternalIds("Тут cmabc123 внутри.", ["cmabc123"]), true);
});

test("R4: generate stores the changes, shows them for that version, and refuses a text with ids", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
  await resetPrismaClient();
  resetAiInflightForTests();
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    resetAiInflightForTests();
  });
  const { createThoughtFromText } = await import("../src/lib/thought-create");
  const { listScriptWorkspace } = await import("../src/lib/scripts");
  const { generateV05Script } = await import("../src/lib/v05-script");

  const { reel } = await createThoughtFromText({
    title: "Сборка",
    body: "Я хочу сказать, что чай остыл на подоконнике.",
    idempotencyKey: "r4-create",
  });
  const before = await listScriptWorkspace(reel.id);
  assert.deepEqual(before.viewingChanges, []);
  assert.ok(before.understanding === null || before.understanding.startsWith("Я понял так:"));

  const prompts: string[] = [];
  const good = async (args: { user: string }) => {
    prompts.push(args.user);
    return {
      text: JSON.stringify({
        script: "Чай остыл на подоконнике.",
        changes: ["Убрал повтор.", "Оставил вашу формулировку про чай.", "Третья.", "Лишняя четвёртая."],
      }),
      usage: { promptTokens: 1, completionTokens: 1 },
    };
  };
  const many = await generateV05Script(reel.id, { idempotencyKey: "r4-too-many" }, good as never);
  assert.equal(many.viewingChanges.length, 3, "extra phrases are trimmed, the script is kept");

  const fine = async () => ({
    text: JSON.stringify({ script: "Чай остыл на подоконнике.", changes: ["Убрал повтор.", "Оставил вашу формулировку."] }),
    usage: { promptTokens: 1, completionTokens: 1 },
  });
  const generated = await generateV05Script(reel.id, { idempotencyKey: "r4-ok" }, fine as never);
  assert.deepEqual(generated.viewingChanges, ["Убрал повтор.", "Оставил вашу формулировку."]);
  assert.match(prompts[0], /Сохраняй формулировки автора/);

  const leaking = async () => ({
    text: JSON.stringify({ script: `Спроси про ${reel.id} и craft_example_a.`, changes: [] }),
    usage: { promptTokens: 1, completionTokens: 1 },
  });
  await assert.rejects(
    () => generateV05Script(reel.id, { idempotencyKey: "r4-leak" }, leaking as never),
    (error: unknown) => error instanceof Error && "code" in error && (error as { code: string }).code === "LLM_INVALID",
  );
  assert.equal(await prisma.scriptVersion.count({ where: { reelId: reel.id, body: { contains: "craft_" } } }), 0);

  const again = await listScriptWorkspace(reel.id, generated.viewing?.id ?? null);
  assert.deepEqual(again.viewingChanges, ["Убрал повтор.", "Оставил вашу формулировку."]);
});
