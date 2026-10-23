import "./helpers/react-global";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConsentSheet } from "../src/components/ConsentGate";
import { isAuthShellPath, isPublicPagePath } from "../src/lib/auth/paths";
import { CONSENT_META_KEY, CONSENT_VERSION, consentMetadata, feedbackLink, hasCurrentConsent } from "../src/lib/consent";
import { CONSENT_ACCEPT, CONSENT_POINTS, CONSENT_TITLE, PRIVACY_DRAFT_NOTE, PRIVACY_SECTIONS } from "../src/lib/privacy-content";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("consent record: only the current version counts, the written value carries version and time", () => {
  assert.equal(hasCurrentConsent(undefined), false);
  assert.equal(hasCurrentConsent(null), false);
  assert.equal(hasCurrentConsent({}), false);
  assert.equal(hasCurrentConsent({ [CONSENT_META_KEY]: "yes" }), false);
  assert.equal(hasCurrentConsent({ [CONSENT_META_KEY]: { version: "2020-01-01" } }), false, "an older notice is asked again");
  assert.equal(hasCurrentConsent({ [CONSENT_META_KEY]: { version: CONSENT_VERSION } }), true);
  const written = consentMetadata(new Date("2026-10-23T10:00:00.000Z"));
  assert.deepEqual(written, { [CONSENT_META_KEY]: { version: CONSENT_VERSION, acceptedAt: "2026-10-23T10:00:00.000Z" } });
  assert.equal(hasCurrentConsent(written), true);
});

test("feedback link: mailto, https or a bare address; unset or anything else hides the row", () => {
  assert.equal(feedbackLink(undefined), null);
  assert.equal(feedbackLink(""), null);
  assert.equal(feedbackLink("   "), null);
  assert.deepEqual(feedbackLink("mailto:help@example.com"), { href: "mailto:help@example.com", external: false });
  assert.deepEqual(feedbackLink("mailto:help@example.com?subject=Vocal"), { href: "mailto:help@example.com?subject=Vocal", external: false });
  assert.deepEqual(feedbackLink(" https://forms.example.com/vocal "), { href: "https://forms.example.com/vocal", external: true });
  assert.deepEqual(feedbackLink("help@example.com"), { href: "mailto:help@example.com", external: false });
  for (const bad of ["javascript:alert(1)", "http://insecure.example.com", "//evil.example.com", "just words", "data:text/html,x", "mailto:"]) {
    assert.equal(feedbackLink(bad), null, bad);
  }
});

test("consent sheet: title, three points, one button, a link to /privacy, no way to close it", () => {
  const html = renderToStaticMarkup(createElement(ConsentSheet, { open: true, onAccept: () => undefined }));
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.ok(html.includes(CONSENT_TITLE));
  assert.equal(CONSENT_POINTS.length, 3);
  for (const point of CONSENT_POINTS) assert.ok(html.includes(point), point);
  assert.match(CONSENT_POINTS[0], /Groq \(США\)/);
  assert.match(CONSENT_POINTS[1], /Supabase/);
  assert.match(CONSENT_POINTS[2], /удалить мысль или весь аккаунт в любой момент/);
  assert.equal(CONSENT_ACCEPT, "Понятно, продолжить");
  assert.match(html, />Понятно, продолжить</);
  assert.match(html, /href="\/privacy"/);
  assert.doesNotMatch(html, /aria-label="Закрыть"/, "no close button");
  assert.equal((html.match(/<button/g) ?? []).length, 1, "the only control is the accept button");
  assert.equal(renderToStaticMarkup(createElement(ConsentSheet, { open: false, onAccept: () => undefined })), "");
});

test("consent sheet: an error is shown through InlineError, the button waits while saving", () => {
  const failed = renderToStaticMarkup(createElement(ConsentSheet, { open: true, error: "Не удалось сохранить ответ.", onAccept: () => undefined }));
  assert.match(failed, /Не удалось сохранить ответ\./);
  const busy = renderToStaticMarkup(createElement(ConsentSheet, { open: true, busy: true, onAccept: () => undefined }));
  assert.match(busy, /<button[^>]*disabled=""/);
});

test("consent gate: Escape and the backdrop do nothing; the fact goes to Supabase metadata, not to the database", () => {
  const gate = read("src/components/ConsentGate.tsx");
  assert.match(gate, /onClose: noop/);
  const backdrop = gate.split("\n").find((line) => line.includes('className="absolute inset-0 bg-black/60"')) ?? "";
  assert.ok(backdrop && !backdrop.includes("onClick"), "the backdrop does not close the sheet");
  assert.match(gate, /supabase\.auth\.updateUser\(\{ data: consentMetadata\(\) \}\)/);
  assert.match(gate, /hasCurrentConsent\(data\.user\.user_metadata\)/);
  assert.doesNotMatch(gate, /prisma|@\/lib\/db|fetch\(/, "no migration, no API: the record is Supabase user_metadata");
  assert.match(gate, /readError \|\| !data\.user\) setPhase\("done"\)/, "a failed read never blocks the app");
  assert.match(gate, /CONSENT_LOCAL_KEY/, "local UI without Supabase keeps it in the browser");
  assert.equal(/model Consent|vocal_consent/.test(read("prisma/schema.prisma")), false, "the Prisma schema is untouched");
});

test("consent gate is mounted in the app shell, not on the bare pages", () => {
  const shell = read("src/components/VocalAppShell.tsx");
  assert.match(shell, /import \{ ConsentGate \} from "@\/components\/ConsentGate"/);
  const frame = shell.slice(shell.indexOf("function VocalAppShellFrame"));
  assert.match(frame, /<ConsentGate \/>/);
  const bare = shell.slice(shell.indexOf("export function VocalAppShell("), shell.indexOf("function VocalAppShellFrame"));
  assert.doesNotMatch(bare, /ConsentGate/);
});

test("/privacy is public and bare, carries the draft note, the same points and the sections", () => {
  assert.equal(isAuthShellPath("/privacy"), true);
  assert.equal(isPublicPagePath("/privacy"), true);
  assert.equal(isPublicPagePath("/profile"), false);
  assert.match(PRIVACY_DRAFT_NOTE, /Черновик для проверки юристом/);
  assert.deepEqual(PRIVACY_SECTIONS.map((section) => section.id), ["collect", "processing", "delete", "consent", "contact"]);
  const text = JSON.stringify(PRIVACY_SECTIONS);
  for (const needle of ["Groq", "Supabase", "Удалить мысль", "Удалить аккаунт", "УДАЛИТЬ", "резервные копии", "Контакт"]) {
    assert.ok(text.toLowerCase().includes(needle.toLowerCase()), needle);
  }
  const page = read("src/app/privacy/page.tsx");
  assert.match(page, /PRIVACY_DRAFT_NOTE/);
  assert.match(page, /CONSENT_POINTS/);
  assert.match(page, /feedbackLink\(process\.env\.VOCAL_FEEDBACK_URL\)/);
  assert.match(page, /robots: \{ index: false/);
});

test("the sign-in and sign-up screens link to /privacy; the profile links to it and shows the feedback row only when configured", () => {
  const auth = read("src/components/AuthScreen.tsx");
  assert.match(auth, /mode === "login" \|\| mode === "signup"[\s\S]{0,200}href="\/privacy"/);
  assert.match(auth, /Как мы работаем с данными/);
  const profile = read("src/components/ProfileScreen.tsx");
  assert.match(profile, /<Link data-account-privacy className=\{ROW\} href="\/privacy">/);
  assert.match(profile, /\{feedback \? \(\s*<a\s+data-account-feedback/);
  assert.match(profile, /Сообщить о проблеме/);
  assert.match(profile, /feedback = null/);
  const page = read("src/app/profile/page.tsx");
  assert.match(page, /feedback=\{feedbackLink\(process\.env\.VOCAL_FEEDBACK_URL\)\}/);
  assert.equal(page.includes("NEXT_PUBLIC_VOCAL_FEEDBACK"), false, "the variable is read on the server, not baked into the client build");
  assert.match(read(".env.example"), /^VOCAL_FEEDBACK_URL=/m);
  assert.match(read("docs/OPERATIONS.md"), /`VOCAL_FEEDBACK_URL`/);
});
