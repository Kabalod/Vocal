// P6 after-shots: node p6.mjs <out dir>. Needs `next start -p 3100` of a build with VOCAL_UI_TEST_DB=1 (mock AI/STT), see docs/design/p6-after/README.md.
import { chromium } from "playwright-core";
import { readdirSync, mkdirSync } from "node:fs";

const base = process.env.HOME + "/.cache/ms-playwright/";
const dir = readdirSync(base).find((d) => d.startsWith("chromium-"));
const exe = `${base}${dir}/chrome-linux64/chrome`;
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const A = "http://127.0.0.1:3100";

const FIELDS = ["whyRecord", "blogGoal", "audience", "lifeNow", "experience", "topics", "speakingStyle", "boundaries"];
const sections = [
  ["goals", "Цели", "Хочу вести блог о том, как думать вслух и не бояться камеры. Пишу для тех, кто начинает говорить публично."],
  ["experience", "Опыт", "Двенадцать лет в продуктовой разработке, последние пять — руковожу небольшой командой."],
  ["topics", "Темы", "Привычки мышления, рабочие разговоры, как готовиться к выступлению."],
  ["delivery", "Подача", "Спокойно, без лозунгов, короткими фразами; примеры из своей жизни."],
  ["boundaries", "Границы", "Не обсуждаю семью и здоровье."],
].map(([id, title, text]) => ({ id, title, text }));
const portrait = { completed: true, coveredKeys: FIELDS, missingKeys: [], sections };
const workspace = {
  phase: "portrait", skipped: false, supplementing: false, pendingChange: false, awaitingConfirm: false, pending: null, mode: null,
  portrait, draftPortrait: null, currentQuestion: null, applyError: null,
  profile: { id: "p1", currentRevisionId: "r1", fields: FIELDS.map((id) => ({ id, label: id, text: "…", usage: "understanding" })), revisions: [], updatedAt: new Date().toISOString() },
  dialogue: {
    threadId: "t1", nextCursor: null, analyzing: false,
    messages: [
      { id: "m1", role: "assistant", kind: "question", body: "Расскажите, зачем вы записываете мысли?", createdAt: new Date().toISOString(), status: "done", voice: null, proposal: null, source: null },
      { id: "m2", role: "user", kind: "answer", body: "Хочу научиться говорить спокойно и собирать из этого блог.", createdAt: new Date().toISOString(), status: "done", voice: null, proposal: null, source: null },
    ],
  },
};
const mockProfile = (page) => page.route("**/api/profile/dialogue*", (r) => r.request().method() === "GET" ? r.fulfill({ json: workspace }) : r.continue());

const browser = await chromium.launch({
  executablePath: exe,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const results = [];
const seed = await (async () => {
  const ctx = await browser.newContext();
  const res = await ctx.request.post(`${A}/api/thoughts`, { data: { title: "Тихий вечер", body: "Я хочу рассказать, как тихий вечер помогает мне думать.", idempotencyKey: "p6-shots-" + Date.now() } });
  const json = await res.json();
  await ctx.close();
  return json.reel.id;
})();
console.log("seeded", seed);

async function run(vp, size) {
  const touch = size.width < 600;
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await ctx.grantPermissions(["microphone"], { origin: A });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${vp}_${name}.png` }); };
  const step = async (name, fn) => {
    try { await fn(); results.push([vp, name, "PASS"]); console.log("PASS", vp, name); }
    catch (e) { results.push([vp, name, "FAIL " + String(e.message).split("\n")[0]]); console.log("FAIL", vp, name, String(e.message).split("\n")[0]); await page.screenshot({ path: `${out}/FAIL_${vp}_${name}.png` }).catch(() => {}); }
  };

  for (const [name, path] of [["auth-login", "/login"], ["auth-signup", "/signup"], ["auth-forgot", "/forgot-password"], ["auth-update-password", "/auth/update-password"]])
    await step(name, async () => { await page.goto(A + path, { waitUntil: "networkidle" }); await shot(name); });
  await step("auth-login-error", async () => {
    await page.goto(A + "/login", { waitUntil: "networkidle" });
    await page.locator('input[type="email"]').fill("nobody@example.com");
    await page.locator('input[type="password"]').fill("wrong-password");
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(1200);
    await shot("auth-login-error");
  });
  await step("404", async () => { await page.goto(A + "/net-takoy-stranicy", { waitUntil: "networkidle" }); await shot("404"); });
  await step("loading-skeleton", async () => {
    const p2 = await ctx.newPage();
    await p2.route("**/api/reels?*", () => {}); // never answers
    await p2.route("**/api/reels", () => {});
    await p2.goto(A + "/reels", { waitUntil: "commit" });
    await p2.waitForTimeout(1500);
    await p2.screenshot({ path: `${out}/${vp}_loading-skeleton.png` });
    await p2.close();
  });
  await step("list-error", async () => {
    const p2 = await ctx.newPage();
    await p2.route(/\/api\/reels(\?.*)?$/, (r) => r.fulfill({ status: 500, json: { error: "Не удалось загрузить мысли.", code: "INTERNAL" } }));
    await p2.goto(A + "/reels", { waitUntil: "networkidle" });
    await p2.waitForTimeout(800);
    await p2.screenshot({ path: `${out}/${vp}_list-error.png` });
    await p2.close();
  });

  await mockProfile(page);
  await step("profile", async () => { await page.goto(A + "/profile", { waitUntil: "networkidle" }); await shot("profile"); });
  await step("profile-supplement", async () => {
    await page.getByRole("button", { name: /Дополнить о себе/ }).first().click();
    await shot(touch ? "profile-supplement-sheet" : "profile-supplement-dialog");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });
  await step("profile-delete-alert", async () => {
    await page.goto(A + "/profile", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Удалить аккаунт" }).first().click();
    await shot("profile-delete-alert");
    await page.getByPlaceholder("УДАЛИТЬ").fill("УДАЛИТЬ");
    await shot("profile-delete-alert-typed");
    await page.getByRole("button", { name: "Отмена" }).first().click(); // never confirm
  });

  await step("record", async () => {
    await page.goto(`${A}/reels/${seed}?record=1`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    if (!touch) { await shot("record-desktop"); return; }
    await shot("record-idle");
    await page.getByRole("button", { name: "Начать запись" }).click();
    await page.waitForTimeout(2500);
    await shot("record-recording");
    await page.getByRole("button", { name: "Отмена" }).first().click();
    await shot("record-cancel-confirm");
    await page.getByRole("button", { name: /Продолжить|Нет|Вернуться/ }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Завершить запись" }).click().catch(() => {});
    await page.waitForTimeout(1500);
    await shot("record-preview");
  });
  if (errs.length) console.log(vp, "pageerrors:", errs);
  await ctx.close();
}
await run("1440x900", { width: 1440, height: 900 });
await run("390x844", { width: 390, height: 844 });
await browser.close();
console.log(results.filter((r) => r[2] !== "PASS").length ? "SOME FAILED" : "ALL PASS");
