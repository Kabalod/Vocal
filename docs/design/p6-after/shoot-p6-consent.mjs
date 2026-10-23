// P6 consent / privacy / feedback shots: node p6c.mjs <out dir>; server on :3100 started with VOCAL_FEEDBACK_URL=mailto:…
import { chromium } from "playwright-core";
import { readdirSync, mkdirSync } from "node:fs";
const base = process.env.HOME + "/.cache/ms-playwright/";
const exe = `${base}${readdirSync(base).find((d) => d.startsWith("chromium-"))}/chrome-linux64/chrome`;
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const A = "http://127.0.0.1:3100";
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] });
const workspace = { phase: "idle", skipped: false, supplementing: false, pendingChange: false, awaitingConfirm: false, pending: null, mode: null, portrait: null, draftPortrait: null, currentQuestion: null, applyError: null, profile: { id: "p", currentRevisionId: null, fields: [], revisions: [], updatedAt: new Date().toISOString() }, dialogue: { threadId: "t", nextCursor: null, analyzing: false, messages: [] } };
for (const [vp, size] of [["1440x900", { width: 1440, height: 900 }], ["390x844", { width: 390, height: 844 }]]) {
  const touch = size.width < 600;
  const ctx = await browser.newContext({ viewport: size, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await page.route("**/api/profile/dialogue*", (r) => r.fulfill({ json: workspace }));
  const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${vp}_${n}.png` }); console.log("shot", vp, n); };
  await page.goto(`${A}/reels`, { waitUntil: "networkidle" });
  await shot("consent-sheet");
  await page.keyboard.press("Escape");
  console.log(vp, "sheet after Escape:", await page.locator("[data-consent-sheet]").count());
  await page.locator("[data-consent-sheet]").click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
  console.log(vp, "sheet after backdrop click:", await page.locator("[data-consent-sheet]").count());
  await page.getByRole("button", { name: "Понятно, продолжить" }).click();
  await page.waitForTimeout(400);
  console.log(vp, "sheet after accept:", await page.locator("[data-consent-sheet]").count());
  await page.reload({ waitUntil: "networkidle" });
  console.log(vp, "sheet after reload:", await page.locator("[data-consent-sheet]").count());
  await page.goto(`${A}/profile`, { waitUntil: "networkidle" }); await shot("profile-feedback");
  await page.goto(`${A}/privacy`, { waitUntil: "networkidle" }); await shot("privacy");
  await page.goto(`${A}/login`, { waitUntil: "networkidle" }); await shot("auth-login-privacy-link");
  await ctx.close();
}
await browser.close();
