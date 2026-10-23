import "./helpers/react-global";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmAlert } from "../src/components/vocal-ui/ConfirmAlert";
import { Portrait } from "../src/components/Portrait";
import { quotaLine } from "../src/components/ProfileScreen";
import { RecordingView } from "../src/components/RecordingView";
import { ShellEmpty, ShellError, ShellLoading } from "../src/components/shell-status";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("P6 loading: skeletons per screen, the label stays for assistive technology", () => {
  for (const variant of ["list", "thought", "page"] as const) {
    const html = renderToStaticMarkup(createElement(ShellLoading, { label: "Загрузка мыслей…", variant }));
    assert.match(html, new RegExp(`data-shell-loading="${variant}"`));
    assert.match(html, /animate-pulse/);
    assert.match(html, /role="status"/);
    assert.match(html, /<p class="sr-only">Загрузка мыслей…<\/p>/);
  }
  assert.match(read("src/app/reels/loading.tsx"), /variant="list"/);
  assert.match(read("src/app/reels/[id]/loading.tsx"), /variant="thought"/);
  assert.match(read("src/app/profile/loading.tsx"), /ShellLoading/);
});

test("P6 error and empty states use the kit: InlineError with Повторить, EmptyState with a way back", () => {
  const err = renderToStaticMarkup(createElement(ShellError, { message: "Не удалось открыть экран.", onRetry: () => undefined }));
  assert.match(err, /role="alert"/);
  assert.match(err, /Не удалось открыть экран\./);
  assert.match(err, /Повторить/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(ShellError, { message: "x" })), /Повторить/);
  const empty = renderToStaticMarkup(createElement(ShellEmpty, { title: "Страница не найдена", href: "/reels", hrefLabel: "К мыслям" }));
  assert.match(empty, /Страница не найдена/);
  assert.match(empty, /href="\/reels"/);
  assert.match(read("src/app/not-found.tsx"), /href="\/reels"/);
});

test("P6 profile: the portrait reads in Literata 18/1.65, the quota line exists only when the quota is enforced", () => {
  const portrait = { sections: [{ id: "a", title: "Кто вы", text: "Автор пишет о привычках." }] } as never;
  assert.match(renderToStaticMarkup(createElement(Portrait, { portrait, reading: true })), /text-\[18px\] leading-\[1\.65\]/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(Portrait, { portrait })), /text-\[18px\]/);
  const base = { enforced: true, exempt: false, hasPeriod: true, thoughtsLimit: 20, thoughtsUsed: 5, remaining: 15, periodEnd: "2026-11-10T00:00:00.000Z" };
  assert.match(quotaLine(base) ?? "", /Мыслей осталось 15 из 20 · до 10 ноября/);
  assert.equal(quotaLine({ ...base, enforced: false }), null);
  assert.equal(quotaLine({ ...base, exempt: true }), null);
  assert.equal(quotaLine(null), null);
  assert.equal(quotaLine({ ...base, hasPeriod: false }), "Нет оплаченного периода");
  const screen = read("src/components/ProfileScreen.tsx");
  assert.match(screen, /IosNavBar title="Профиль" backLabel="Мысли"/);
  assert.match(screen, /DeleteAccountRow/);
  assert.match(screen, /LogoutButton/);
  assert.match(read("src/components/ProfileConversation.tsx"), /presentation === "page"/);
  const alert = read("src/components/DeleteActions.tsx");
  assert.match(alert, /Все ваши мысли, дубли и сценарии будут удалены/);
});

test("P6 mobile recording: fullscreen teleprompter, a big start button, timer, wave, red stop; nothing records before the tap", () => {
  const html = renderToStaticMarkup(
    createElement(RecordingView, { reelId: "r1", thoughtTitle: "Привычка", scriptVersionId: null, scriptNumber: null, onClose: () => undefined, onSaved: () => undefined }),
  );
  assert.match(html, /data-recording-mobile/);
  assert.match(html, /fixed inset-0/);
  assert.match(html, /data-record-start/);
  assert.match(html, /aria-label="Начать запись"/);
  assert.doesNotMatch(html, /data-record-stop/);
  const src = read("src/components/RecordingView.tsx");
  assert.match(src, /text-\[22px\]/);
  assert.match(src, /tabular-nums/);
  assert.match(src, /data-record-wave/);
  assert.match(src, /bg-bad/);
  assert.match(src, /retry === "mic"/);
  assert.equal((src.match(/getUserMedia/g) ?? []).length, 1, "the microphone is requested in one place, from startRecording");
});

test("P6 auth screens: one card, kit fields, InlineError, texts unchanged", () => {
  const src = read("src/components/AuthScreen.tsx");
  assert.match(src, /data-auth-card/);
  assert.match(src, /<Field/);
  assert.match(src, /<InlineError message=\{error\}/);
  assert.match(src, /variant="primary"/);
  for (const text of ["Вход", "Регистрация", "Восстановление пароля", "Новый пароль", "Создать аккаунт", "Отправить ссылку", "Сохранить пароль", "Забыли пароль"]) assert.ok(src.includes(text), text);
  assert.match(src, /env\(safe-area-inset-bottom\)/);
});

test("P6 account deletion: the typed word is required, the client never fills the phrase in", () => {
  const alert = renderToStaticMarkup(
    createElement(
      ConfirmAlert,
      { open: true, title: "Удалить аккаунт?", confirmLabel: "Удалить", destructive: true, confirmDisabled: true, onCancel: () => undefined, onConfirm: () => undefined },
      createElement("input", { placeholder: "УДАЛИТЬ" }),
    ),
  );
  assert.match(alert, /<button[^>]*disabled=""[^>]*>Удалить<\/button>/);
  assert.match(alert, /placeholder="УДАЛИТЬ"/);
  const enabled = renderToStaticMarkup(createElement(ConfirmAlert, { open: true, title: "t", confirmLabel: "Удалить", onCancel: () => undefined, onConfirm: () => undefined }));
  assert.doesNotMatch(enabled, /disabled=/);
  const src = read("src/components/DeleteActions.tsx");
  const row = src.slice(src.indexOf("export function DeleteAccountRow"));
  assert.match(row, /confirmDisabled=\{phrase !== ACCOUNT_DELETE_PHRASE \|\| busy\}/);
  assert.match(row, /if \(busy \|\| phrase !== ACCOUNT_DELETE_PHRASE\) return;/);
  assert.match(row, /sendDelete\("\/api\/account", \{ confirm: phrase \}\)/, "the body carries what the author typed");
  assert.doesNotMatch(row, /confirm: ACCOUNT_DELETE_PHRASE/);
  assert.match(row, /useState\(""\)/);
});
