import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { isAuthShellPath, isPublicPagePath } from "../src/lib/auth/paths";
import { authHref, safeReturnTo } from "../src/lib/auth/return-to";
import {
  landingConversation,
  landingCopy,
  landingDesktopConversation,
  landingFaq,
  landingMobileConversation,
} from "../src/lib/landing-content";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("returnTo stays on-site", () => {
  assert.equal(safeReturnTo("/reels"), "/reels");
  assert.equal(safeReturnTo("//evil.example"), "/reels");
  assert.equal(safeReturnTo("https://evil.example"), "/reels");
  assert.equal(safeReturnTo("\\reels"), "/reels");
  assert.equal(authHref("/signup", "/reels"), "/signup?next=%2Freels");
  assert.equal(authHref("/login", "/"), "/login?next=%2F");
});

test("landing copy keeps agent left, user right, and one CTA", () => {
  assert.equal(landingConversation[0].role, "user");
  assert.equal(landingConversation[1].role, "agent");
  assert.deepEqual(
    landingConversation.map((item) => item.role),
    ["user", "agent", "user", "agent", "user", "agent"],
  );
  assert.deepEqual(
    landingDesktopConversation.map((item) => item.role),
    ["user", "agent", "user", "agent"],
  );
  assert.equal(landingDesktopConversation.length, 4);
  assert.deepEqual(
    landingMobileConversation.map((item) => item.role),
    ["user", "agent", "user", "agent"],
  );
  assert.equal(landingMobileConversation.length, 4);
  assert.equal(landingCopy.conversationMobileTitle, "Найдите, что хотите сказать");
  assert.equal(landingCopy.feedbackMobileTitle, "Каждый дубль — понятнее");
  assert.equal(landingCopy.cta, "Подготовить первый ролик");
  assert.equal(landingFaq[2].approved, false);
});

test("public landing and existing auth screens stay outside app shell", () => {
  assert.equal(isPublicPagePath("/"), true);
  assert.equal(isAuthShellPath("/login"), true);
  assert.equal(isAuthShellPath("/signup"), true);
  assert.equal(isAuthShellPath("/reels"), false);
});

test("home is landing, CTA uses signup, video is not a fake player", () => {
  const page = readFileSync(join(root, "src/app/page.tsx"), "utf8");
  const landing = readFileSync(join(root, "src/components/landing/LandingPage.tsx"), "utf8");
  const polaroid = readFileSync(join(root, "src/components/landing/PolaroidVideo.tsx"), "utf8");
  assert.match(page, /LandingPage/);
  assert.equal(page.includes("UploadDropzone"), false);
  assert.match(landing, /authHref\("\/signup"/);
  assert.match(landing, /data-placement="hero"/);
  const header = readFileSync(join(root, "src/components/landing/LandingHeader.tsx"), "utf8");
  assert.match(header, /authHref\("\/login", "\/"\)/);
  assert.match(header, /landingCopy\.logout/);
  assert.match(header, /landing-account-name/);
  const middleware = readFileSync(join(root, "src/lib/supabase/middleware.ts"), "utf8");
  assert.match(middleware, /safeReturnTo\(request\.nextUrl\.searchParams\.get\("next"\)\)/);
  assert.match(polaroid, /landingCopy\.videoPending/);
  assert.match(polaroid, /demo-poster|LANDING_POSTER_SRC/);
  const conversation = readFileSync(join(root, "src/components/landing/ConversationDemo.tsx"), "utf8");
  assert.match(conversation, /LANDING_AVATAR_SRC/);
  assert.match(conversation, /landingDesktopConversation/);
  assert.match(conversation, /landingMobileConversation/);
  assert.match(conversation, /onError/);
  assert.equal(existsSync(join(root, "public/landing/demo-avatar.jpg")), true);
  assert.equal(polaroid.includes("autoPlay"), false);
  assert.match(middleware, /isPublicPagePath/);
});
