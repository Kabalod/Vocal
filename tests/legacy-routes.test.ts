import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { SHELL_NAV } from "../src/components/shell-nav";
import {
  isLegacyRedirectLoop,
  jobDeepLinkHref,
  legacyHistoryHref,
  legacyUserRedirect,
} from "../src/lib/legacy-routes";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("legacy history and jobs redirect to thoughts without loops; settings stay", () => {
  assert.deepEqual(
    SHELL_NAV.map((item) => item.href),
    ["/reels", "/profile"],
  );
  assert.equal(legacyHistoryHref(), "/reels");
  assert.equal(legacyUserRedirect("/history"), "/reels");
  assert.equal(legacyUserRedirect("/history/extra"), "/reels");
  assert.equal(legacyUserRedirect("/settings"), null);
  assert.equal(legacyUserRedirect("/"), null);
  assert.equal(legacyUserRedirect("/reels"), null);
  assert.equal(jobDeepLinkHref("abc"), "/reels/abc?tab=takes");
  assert.equal(jobDeepLinkHref(null), "/reels");
  assert.equal(isLegacyRedirectLoop("/history", "/reels"), false);
  assert.equal(isLegacyRedirectLoop("/reels", "/history"), true);
  assert.equal(isLegacyRedirectLoop("/reels", "/reels"), true);

  const history = readFileSync(join(root, "src/app/history/page.tsx"), "utf8");
  const jobs = readFileSync(join(root, "src/app/jobs/[id]/page.tsx"), "utf8");
  const settings = readFileSync(join(root, "src/app/settings/page.tsx"), "utf8");
  const home = readFileSync(join(root, "src/app/page.tsx"), "utf8");
  const nav = readFileSync(join(root, "src/components/shell-nav.ts"), "utf8");
  assert.match(history, /redirect\(legacyHistoryHref\(\)\)/);
  assert.match(jobs, /jobDeepLinkHref/);
  assert.match(jobs, /notFound/);
  assert.equal(settings.includes("redirect("), false);
  assert.match(settings, /\/api\/criteria/);
  assert.equal(home.includes("redirect("), false);
  assert.match(home, /LandingPage/);
  assert.equal(home.includes("UploadDropzone"), false);
  assert.match(nav, /href: "\/reels", label: "Мысли"/);
  assert.equal(nav.includes('href: "/history"'), false);
});
