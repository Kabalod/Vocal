// R4 interface check (mock AI/STT). Needs playwright outside the repo, a production build, a migrated Postgres schema
// and one server: VOCAL_UI_TEST_DB=1 TEST_DATABASE_URL=<schema> VOCAL_AI_MOCK=1 VOCAL_STT_MOCK=1 VOCAL_TEST_USER_ID=user-a PORT=3101 next start -p 3101
// Run: TEST_DATABASE_URL=<schema> node run.mjs <out dir for screenshots>
import { chromium } from "playwright";
import { execSync } from "node:child_process";
const OUT = process.argv[2];
const A = "http://localhost:3101";
const results = [];
const b = await chromium.launch();
const check = async (vp, name, fn, p, shot) => {
  try { await fn(); results.push({ vp, name, ok: true }); console.log(`PASS ${vp} ${name}`); }
  catch (e) { results.push({ vp, name, ok: false }); console.log(`FAIL ${vp} ${name}: ${String(e.message).split("\n")[0].slice(0, 200)}`); }
  if (shot) await p.screenshot({ path: `${OUT}/${vp}-${shot}.png`, fullPage: true }).catch(() => {});
};
for (const [vp, size] of [["1280", { width: 1280, height: 800 }], ["390", { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: size });
  const p = await ctx.newPage();
  let id;
  await check(vp, "create text thought", async () => {
    await p.goto(`${A}/reels`); await p.waitForLoadState("networkidle");
    await p.getByRole("button", { name: "+ Новая мысль" }).first().click();
    await p.getByPlaceholder("Новая мысль").fill(`Тихий вечер ${vp}`);
    await p.getByPlaceholder("Напишите мысль своими словами").fill("Я хочу рассказать, как тихий вечер помогает мне думать.");
    await p.getByRole("button", { name: "Продолжить с Vocal" }).click();
    await p.waitForURL(/\/reels\/[^/?]+/, { timeout: 20000 });
    await p.waitForLoadState("networkidle");
    id = p.url().match(/\/reels\/([^/?]+)/)[1];
  }, p, "01-created");
  await check(vp, "dialogue: message and reply", async () => {
    await p.getByRole("tab", { name: "Диалог" }).click();
    await p.getByPlaceholder("Напишите ответ…").fill("Главное — тихий вечер и чай.");
    await p.getByRole("button", { name: "Отправить" }).click();
    await p.waitForFunction(async (rid) => { const r = await fetch(`/api/thoughts/${rid}/dialogue`); const j = await r.json(); return (j.messages ?? []).filter((m) => m.role === "assistant" && m.status === "done").length >= 1; }, id, { timeout: 30000 });
  }, p, "02-dialogue");
  execSync("npx tsx scripts/e2e-r4/seed.ts", { stdio: "inherit", env: process.env });
  await check(vp, "script tab: base card, understanding, button", async () => {
    await p.goto(`${A}/reels/${id}`); await p.waitForLoadState("networkidle");
    await p.getByRole("tab", { name: "Сценарий" }).click();
    await p.getByRole("button", { name: "Сгенерировать сценарий" }).waitFor({ timeout: 15000 });
    await p.locator("[data-script-base]").waitFor({ timeout: 15000 });
    await p.locator("[data-script-understanding]").waitFor({ timeout: 15000 });
    const main = await p.locator("main").innerText();
    if (!/Ваш дубль №1, как он записан/.test(main)) throw new Error("base card label missing");
    if (!/Я хочу рассказать, как тихий вечер помогает мне думать\./.test(main)) throw new Error("base text missing");
    if (!/Я понял так: Тихий вечер помогает мне думать/.test(main)) throw new Error("understanding missing");
    if (/from_take|gap_|fact_|craft_|\bc[a-z0-9]{24}\b/.test(main)) throw new Error("technical name visible");
    if (/Собрать сценарий(?!\?)/.test(main)) throw new Error("old button label");
  }, p, "03-script-before");
  await check(vp, "generate: script and 'what changed'", async () => {
    await p.getByRole("button", { name: "Сгенерировать сценарий" }).click();
    await p.getByText("Что изменено и почему").waitFor({ timeout: 20000 });
    const main = await p.locator("main").innerText();
    if (!/Убрал повтор и оставил ваши слова\./.test(main)) throw new Error("change phrase missing");
    if (!/Мок прямой речи/.test(main)) throw new Error("script text missing");
    if (/Я понял так/.test(main)) throw new Error("understanding still shown after the script was built");
  }, p, "04-script-after");
  await ctx.close();
}
await b.close();
const bad = results.filter((r) => !r.ok);
console.log(`${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
