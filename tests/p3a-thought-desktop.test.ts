import "./helpers/react-global";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { DialogueChips } from "../src/components/DialogueChips";
import { ThoughtDesktopTitle, ThoughtDesktopToolbar } from "../src/components/ThoughtDesktopToolbar";
import {
  DONT_KNOW_CHIPS,
  formatThoughtStamp,
  readingCaption,
  showDialogueTimeLabel,
  splitParagraphs,
} from "../src/components/thought-desktop";
import { Chip } from "../src/components/vocal-ui/Chip";
import { isDontKnow } from "../src/lib/turn-policy";

const root = path.resolve(import.meta.dirname, "..");
const src = (file: string) => readFileSync(path.join(root, file), "utf8");
const html = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(node);

function chipsOf(node: ReactNode): ReactElement<{ children?: ReactNode; onClick?: () => void; disabled?: boolean }>[] {
  const found: ReactElement<{ children?: ReactNode; onClick?: () => void; disabled?: boolean }>[] = [];
  const walk = (child: ReactNode) => {
    Children.forEach(child, (item) => {
      if (!isValidElement(item)) return;
      const element = item as ReactElement<{ children?: ReactNode; onClick?: () => void; disabled?: boolean }>;
      if (element.type === Chip) found.push(element);
      walk(element.props.children);
    });
  };
  walk(node);
  return found;
}

test("chips: 'Не помню' and 'Пропустить вопрос' call the existing text path with an answer the server reads as «не знаю»", () => {
  const sent: string[] = [];
  let built = 0;
  const tree = DialogueChips({ disabled: false, onSend: (text) => sent.push(text), onBuild: () => (built += 1) });
  const chips = chipsOf(tree);
  assert.deepEqual(
    chips.map((chip) => chip.props.children),
    ["Не помню", "Пропустить вопрос", "Собрать сценарий"],
  );
  chips[0].props.onClick?.();
  chips[1].props.onClick?.();
  assert.deepEqual(sent, ["Не помню", "Не знаю"]);
  for (const chip of DONT_KNOW_CHIPS) assert.equal(isDontKnow(chip.text), true, chip.text);
  chips[2].props.onClick?.();
  assert.equal(built, 1);
  assert.equal(sent.length, 2, "the build chip sends no dialogue text");
});

test("chips are disabled while a send or a recording is in progress, and 'Собрать сценарий' needs its handler", () => {
  const busy = chipsOf(DialogueChips({ disabled: true, onSend: () => undefined, onBuild: () => undefined }));
  assert.equal(busy.every((chip) => chip.props.disabled === true), true);
  const noBuild = chipsOf(DialogueChips({ disabled: false, onSend: () => undefined }));
  assert.equal(noBuild[2].props.disabled, true);
  assert.equal(noBuild[0].props.disabled, false);
});

test("the status in the thought header is a token, not a control", () => {
  for (const [status, label] of [
    ["idea", "Не завершена"],
    ["in_progress", "В работе"],
    ["completed", "Завершена"],
  ] as const) {
    const out = html(createElement(ThoughtDesktopTitle, { title: "Мысль про бег", status, createdAt: "2026-10-12T10:42:00" }));
    assert.match(out, /<h1[^>]*>Мысль про бег<\/h1>/);
    assert.match(out, new RegExp(`data-thought-status="[a-z_]+"[^>]*>.*${label}`));
    assert.match(out, /<svg/, "status icon");
    assert.doesNotMatch(out, /<button|role="button"|role="menu|aria-haspopup|aria-expanded|tabindex/i);
  }
  const source = src("src/components/ThoughtDesktopToolbar.tsx");
  const titleBlock = source.slice(source.indexOf("export function ThoughtDesktopTitle"));
  assert.doesNotMatch(titleBlock, /onClick|<button|DeleteThought/);
});

test("toolbar: back link, three icon tabs with names, the menu button; delete only inside the menu", () => {
  // Rendering needs the app router (next/link, useRouter), so the structure is checked on the source.
  const source = src("src/components/ThoughtDesktopToolbar.tsx");
  assert.match(source, /href="\/reels"/);
  assert.match(source, /Все мысли/);
  assert.match(source, /h-\[52px\]/);
  assert.match(source, /backdrop-blur/);
  assert.match(source, /<SegmentedTabs variant="icon"/);
  assert.match(source, /STUDIO_TABS\.map/);
  assert.match(source, /label="Меню мысли"/);
  assert.match(source, /label: "Записать дубль"/);
  assert.match(source, /label: "Удалить мысль", destructive: true/);
  assert.match(source, /DeleteThoughtConfirm/);
  const tabs = src("src/components/reel-studio.ts");
  for (const name of ["Дубли", "Диалог", "Сценарий"]) assert.match(tabs, new RegExp(`label: "${name}"`));
  // icon tabs carry the name and the tooltip (kit test covers the roles); the header block has no delete link
  assert.doesNotMatch(source.slice(source.indexOf("export function ThoughtDesktopTitle")), /Удалить/);
});

test("delete from the menu is confirmed in an alert with the safe answer first and reuses the same DELETE endpoint", () => {
  const source = src("src/components/DeleteActions.tsx");
  const confirm = source.slice(source.indexOf("export function DeleteThoughtConfirm"), source.indexOf("export function DeleteTakeAction"));
  assert.match(confirm, /<ConfirmAlert/);
  assert.match(confirm, /sendDelete\(`\/api\/reels\/\$\{reelId\}`\)/);
  assert.match(confirm, /destructive/);
  assert.match(confirm, /cancelLabel="Оставить"/);
});

test("desktop thought screen: own toolbar and title on the shell breakpoint; below it the earlier frame, header and delete link stay", () => {
  const studio = src("src/components/ReelStudio.tsx");
  assert.match(studio, /useDesktopShell\(\)/);
  assert.match(studio, /desktop \? \(/);
  assert.match(studio, /<ThoughtDesktopToolbar/);
  assert.match(studio, /<ReelStudioFrame/);
  assert.match(studio, /<DeleteThoughtAction reelId=\{reelId\}/);
  const desktopBranch = studio.slice(studio.indexOf("data-thought-desktop"), studio.indexOf("<ReelStudioFrame"));
  assert.doesNotMatch(desktopBranch, /DeleteThoughtAction|StatusBadge/);
  assert.match(src("src/components/use-desktop-shell.ts"), /SHELL_DESKTOP_MEDIA/);
});

test("dialogue: 'Записать дубль' is gone from the desktop layout and stays in the earlier one", () => {
  const source = src("src/components/ThoughtDialogue.tsx");
  const desktopBranch = source.slice(source.indexOf("const readingText = scriptPreview"), source.indexOf("return (\n    <section className=\"flex min-h-[28rem]"));
  assert.doesNotMatch(desktopBranch, /Записать дубль|onGoRecord/);
  assert.match(desktopBranch, /<DialogueChips/);
  assert.match(desktopBranch, /<Composer/);
  assert.match(desktopBranch, /w-\[380px\]|380px/);
  assert.match(source.slice(source.indexOf("return (\n    <section className=\"flex min-h-[28rem]")), /Записать дубль/);
});

test("dialogue chips keep a typed draft; the build chip only hands over to the script tab", () => {
  const source = src("src/components/ThoughtDialogue.tsx");
  assert.match(source, /sendText\(text, \{ keepDraft: true \}\)/);
  assert.match(source, /if \(!options\?\.keepDraft\) onDraftChange\(""\)/);
  const studio = src("src/components/ReelStudio.tsx");
  assert.match(studio, /function buildScriptFromDialogue\(\) \{\s*setGenerateRequested\(true\);\s*changeTab\("script"\);/);
  assert.match(studio, /if \(next !== "script"\) setGenerateRequested\(false\)/);
  const editor = src("src/components/ScriptEditor.tsx");
  assert.match(editor, /if \(!generateRequested \|\| !workspace\) return;\s*onGenerateHandled\?\.\(\);/);
});

test("script desktop: versions list with the primary build button, reader actions, collapsible changes, building skeleton without cancel", () => {
  const editor = src("src/components/ScriptEditor.tsx");
  const desktop = editor.slice(editor.indexOf("if (desktop) {"), editor.indexOf('return (\n    <section className="space-y-4"'));
  assert.match(desktop, /aria-label="Версии сценария"/);
  assert.match(desktop, /Собрать новую версию/);
  assert.match(desktop, /"Редактировать"/);
  assert.match(desktop, /Помочь со сценарием/);
  assert.match(desktop, /Сделать итоговым/);
  assert.match(desktop, /<details[\s\S]*Что изменено/);
  assert.match(desktop, /текущая/);
  assert.match(desktop, /итоговая/);
  const building = desktop.slice(desktop.indexOf("data-script-building"), desktop.indexOf("snap.mode === \"draft\" ?"));
  assert.match(building, /Vocal собирает сценарий…/);
  assert.doesNotMatch(building, /Отмена|onCancel|abort/i, "there is no cancel of a script build on the backend");
  assert.doesNotMatch(editor, /scripts\/generate\/cancel|cancelGenerate/);
  // the handlers are the existing ones
  assert.match(desktop, /openDraft\(\)/);
  assert.match(desktop, /setFinal\(\)/);
  assert.match(desktop, /generate\(keyStateRef\.current\.nextExplicitKey\)/);
});

test("labels and time stamps", () => {
  const now = new Date(2026, 9, 14, 12, 0);
  assert.equal(formatThoughtStamp(new Date(2026, 9, 14, 10, 42).toISOString(), now), "Сегодня, 10:42");
  assert.equal(formatThoughtStamp(new Date(2026, 9, 13, 21, 5).toISOString(), now), "Вчера, 21:05");
  assert.equal(formatThoughtStamp(new Date(2026, 9, 2, 9, 3).toISOString(), now), "2 октября, 09:03");
  assert.equal(formatThoughtStamp(new Date(2025, 11, 31, 23, 59).toISOString(), now), "31 декабря 2025, 23:59");
  assert.equal(formatThoughtStamp(null, now), "");
  assert.equal(showDialogueTimeLabel(null, "2026-10-14T10:00:00"), true);
  assert.equal(showDialogueTimeLabel("2026-10-14T10:00:00", "2026-10-14T10:10:00"), false);
  assert.equal(showDialogueTimeLabel("2026-10-14T10:00:00", "2026-10-14T10:40:00"), true);
  assert.equal(readingCaption({ versionNumber: 2, baseLabel: null }), "Сценарий · версия 2");
  assert.equal(readingCaption({ versionNumber: null, baseLabel: "Основа из дубля №1" }), "Основа · ваш дубль №1");
  assert.equal(readingCaption({ versionNumber: null, baseLabel: null }), "Основа · ваш дубль");
  assert.deepEqual(splitParagraphs("а\n\nб\n\n\nв"), ["а", "б", "в"]);
});
