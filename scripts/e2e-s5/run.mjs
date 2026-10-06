// S5 E2E (mock AI/STT, two users). Not part of npm test: needs `npm i playwright && npx playwright install chromium`
// outside the repo, a production build without NEXT_PUBLIC_SUPABASE_*, a migrated Postgres schema and two servers:
//   VOCAL_UI_TEST_DB=1 TEST_DATABASE_URL=<schema> VOCAL_AI_MOCK=1 VOCAL_STT_MOCK=1 VOCAL_TEST_USER_ID=user-a PORT=3101 next start -p 3101
//   the same with VOCAL_TEST_USER_ID=user-b and port 3102 (different storage root).
// Run: node run.mjs <scratch dir with shots/ and tiny.mp4>. Details: docs/audit/S5_REPORT.md.
import { chromium } from "playwright";
const S = process.argv[2];
const A = "http://localhost:3101", B = "http://localhost:3102";
const results = [];
const b = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });

async function step(vp, name, fn, page) {
  const t0 = Date.now();
  try { await fn(); results.push({ vp, name, ok: true, ms: Date.now() - t0 }); console.log(`PASS ${vp} ${name}`); }
  catch (e) {
    results.push({ vp, name, ok: false, err: String(e.message).split("\n")[0].slice(0, 200) });
    console.log(`FAIL ${vp} ${name}: ${String(e.message).split("\n")[0].slice(0, 200)}`);
    await page.screenshot({ path: `${S}/shots/FAIL-${vp}-${name.replace(/\W+/g, "_")}.png` }).catch(() => {});
  }
}
const newThoughtText = async (p, title, body) => {
  await p.goto(`${A}/reels`); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "+ Новая мысль" }).first().click();
  await p.getByPlaceholder("Новая мысль").fill(title);
  await p.getByPlaceholder("Напишите мысль своими словами").fill(body);
  await p.getByRole("button", { name: "Продолжить с Vocal" }).click();
  await p.waitForURL(/\/reels\/[^/?]+/, { timeout: 20000 });
  await p.waitForLoadState("networkidle");
  return p.url().match(/\/reels\/([^/?]+)/)[1];
};

for (const [vp, size] of [["1280", { width: 1280, height: 800 }], ["390", { width: 390, height: 844 }]]) {
  const ctx = await b.newContext({ viewport: size, acceptDownloads: true });
  await ctx.grantPermissions(["microphone"], { origin: A });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  let id;
  await step(vp, "01 list opens (empty or not)", async () => { await p.goto(`${A}/reels`); await p.getByRole("button", { name: "+ Новая мысль" }).first().waitFor(); await p.screenshot({ path: `${S}/shots/${vp}-01-list.png` }); }, p);
  await step(vp, "02 create text thought", async () => { id = await newThoughtText(p, `Тихий вечер ${vp}`, "Я хочу рассказать, как тихий вечер помогает мне думать."); await p.screenshot({ path: `${S}/shots/${vp}-02-thought.png` }); }, p);
  await step(vp, "03 dialogue: send message, get reply", async () => {
    await p.getByRole("tab", { name: "Диалог" }).click();
    await p.getByPlaceholder("Напишите ответ…").fill("Главное — тихий вечер и чай.");
    await p.getByRole("button", { name: "Отправить" }).click();
    await p.waitForFunction(async (rid) => { const r = await fetch(`/api/thoughts/${rid}/dialogue`); const j = await r.json(); return (j.messages ?? []).filter((m) => m.role === "assistant" && m.status === "done").length >= 1; }, id, { timeout: 30000 });
    await p.screenshot({ path: `${S}/shots/${vp}-03-dialogue.png` });
  }, p);
  await step(vp, "04 script: build by button", async () => {
    await p.getByRole("tab", { name: "Сценарий" }).click();
    await p.getByRole("button", { name: "Собрать сценарий" }).click();
    await p.waitForTimeout(4000);
    await p.screenshot({ path: `${S}/shots/${vp}-04-script.png` });
    const txt = await p.locator("main").innerText();
    if (/ошибк|не удалось/i.test(txt)) throw new Error("script error shown: " + txt.match(/.{0,40}(ошибк|не удалось).{0,60}/i)?.[0]);
  }, p);
  await step(vp, "05 final take", async () => {
    await p.getByRole("tab", { name: "Дубли" }).click();
    await p.getByRole("button", { name: /Сделать итоговым/ }).first().click();
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${S}/shots/${vp}-05-final.png` });
    await p.getByRole("button", { name: "Снять итоговый" }).waitFor({ timeout: 5000 });
  }, p);
  await step(vp, "06 complete thought", async () => {
    await p.getByRole("button", { name: "Завершить мысль" }).click();
    const confirm = p.getByRole("button", { name: /Завершить|Подтвердить/ }).last();
    await p.waitForTimeout(800);
    if (await confirm.isVisible().catch(() => false)) await confirm.click().catch(() => {});
    await p.waitForTimeout(2000);
    await p.screenshot({ path: `${S}/shots/${vp}-06-complete.png` });
    if (!(await p.getByText(/Успешно завершена|Завершена/).count())) throw new Error("status not completed");
  }, p);
  await step(vp, "07 export .txt", async () => {
    const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 15000 }), p.getByRole("button", { name: "Скачать .txt" }).first().click()]);
    if (!/\.txt$/.test(dl.suggestedFilename())) throw new Error("bad file " + dl.suggestedFilename());
  }, p);
  // isolation: B must not reach A's thought
  const cb = await b.newContext({ viewport: size }); const pb = await cb.newPage();
  await step(vp, "08 isolation: user B list empty", async () => { await pb.goto(`${B}/reels`); await pb.waitForLoadState("networkidle"); if (await pb.locator("a[href^='/reels/']").count()) throw new Error("B sees reels"); }, pb);
  await step(vp, "09 isolation: B gets 404 for A thought and dialogue", async () => {
    await pb.goto(`${B}/reels/${id}`); await pb.waitForLoadState("networkidle");
    if (!(await pb.getByText("Мысль не найдена").count())) throw new Error("A thought is visible to B");
    const api = await pb.evaluate(async (rid) => (await fetch(`/api/thoughts/${rid}/dialogue`)).status, id); if (api !== 404) throw new Error("api status " + api);
  }, pb);
  await cb.close();
  await step(vp, "10 delete thought", async () => {
    await p.goto(`${A}/reels/${id}`); await p.waitForLoadState("networkidle");
    await p.getByRole("button", { name: "Удалить мысль" }).first().click();
    await p.getByRole("button", { name: "Удалить мысль" }).last().click();
    await p.waitForURL(/\/reels\/?(\?.*)?$/, { timeout: 15000 });
    await p.goto(`${A}/reels/${id}`); await p.waitForLoadState("networkidle");
    if (!(await p.getByText("Мысль не найдена").count())) throw new Error("deleted thought still shown");
  }, p);
  await step(vp, "11 video thought: upload -> STT -> working take", async () => {
    await p.goto(`${A}/reels`); await p.waitForLoadState("networkidle");
    await p.getByRole("button", { name: "+ Новая мысль" }).first().click();
    await p.getByRole("button", { name: "Видео" }).click();
    const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: "Выбрать файл" }).click()]);
    await fc.setFiles(`${S}/tiny.mp4`);
    await p.waitForURL(/\/reels\/[^/?]+/, { timeout: 60000 });
    await p.waitForFunction(() => /Мок расшифровки/.test(document.body.innerText), null, { timeout: 60000 });
    await p.screenshot({ path: `${S}/shots/${vp}-11-video.png` });
  }, p);
  await step(vp, "12 voice thought: fake mic -> STT", async () => {
    await p.goto(`${A}/reels`); await p.waitForLoadState("networkidle");
    await p.getByRole("button", { name: "+ Новая мысль" }).first().click();
    await p.getByRole("button", { name: "Голос" }).click();
    await p.getByRole("button", { name: "Начать запись" }).click();
    await p.waitForTimeout(2500);
    console.log("   recording buttons:", (await p.getByRole("button").allInnerTexts()).map((t) => t.trim().replace(/\n/g," ")).filter(Boolean).slice(-6).join(" | "));
    await p.screenshot({ path: `${S}/shots/${vp}-12-voice-recording.png` });
    const stop = p.getByRole("button", { name: "Завершить запись" }).first();
    await stop.click({ timeout: 8000 });
    await p.waitForTimeout(2000);
    await p.getByRole("button", { name: "Продолжить с Vocal" }).first().click({ timeout: 15000 });
    await p.waitForURL(/\/reels\/[^/?]+/, { timeout: 60000 });
    await p.waitForFunction(() => /Мок расшифровки/.test(document.body.innerText), null, { timeout: 60000 });
  }, p);
  if (errs.length) console.log(`pageerrors ${vp}:`, [...new Set(errs)].slice(0, 3));
  await ctx.close();
}
await b.close();
const fail = results.filter((r) => !r.ok).length;
console.log(`\nTOTAL ${results.length - fail}/${results.length} pass, ${fail} fail`);
