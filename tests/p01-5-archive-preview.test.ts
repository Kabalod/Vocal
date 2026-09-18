import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import {
  archivePreviewHonesty,
  archiveScriptVersionNumber,
  excerptArchiveScript,
  pickAcceptedArchiveScript,
} from "../src/lib/archive-preview";
import { studioThoughtHref } from "../src/components/reel-studio";
import { resolveStudioRecordDeepLink } from "../src/lib/recording-session";
import {
  archiveListHref,
  closeArchivePreview,
  defaultArchiveListUrlState,
  openArchivePreview,
  parseArchiveListUrl,
  restoreArchiveFocusOnce,
} from "../src/lib/thought-archive-state";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function fileUrl(dbPath: string): string {
  return `file:${dbPath.replace(/\\/g, "/")}`;
}

function migrateDeploy(url: string) {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
    shell: true,
  });
}

class ArchiveHistory {
  stack: string[] = ["/reels"];

  href() {
    return this.stack[this.stack.length - 1] ?? "/reels";
  }

  state() {
    return parseArchiveListUrl(new URL(this.href(), "https://vocal.local").searchParams);
  }

  push(next: ReturnType<typeof parseArchiveListUrl>) {
    this.stack.push(archiveListHref(next));
  }

  replaceHref(href: string) {
    this.stack[this.stack.length - 1] = href;
  }

  back() {
    if (this.stack.length > 1) this.stack.pop();
  }
}

test("P01.5 accepted script ignores proposals and keeps version numbers", () => {
  const versions = [
    { id: "prop", kind: "ai_proposal", body: "черновик модели", createdAt: "2026-09-18T12:00:00.000Z" },
    { id: "v2", kind: "accepted_ai", body: "принятый второй", createdAt: "2026-09-17T12:00:00.000Z" },
    { id: "v1", kind: "manual", body: "принятый первый", createdAt: "2026-09-16T12:00:00.000Z" },
  ];
  const accepted = pickAcceptedArchiveScript({
    selectedScriptId: "v2",
    finalScriptId: "v1",
    versions,
  });
  assert.equal(accepted?.id, "v2");
  assert.equal(archiveScriptVersionNumber("v2", versions), 2);
  assert.equal(archiveScriptVersionNumber("v1", versions), 1);

  const none = pickAcceptedArchiveScript({
    selectedScriptId: null,
    finalScriptId: null,
    versions: [versions[0]],
  });
  assert.equal(none, null);

  const excerpt = excerptArchiveScript(`  ${"слово ".repeat(80)}  `);
  assert.ok(excerpt.endsWith("…"));
  assert.ok(excerpt.length <= 281);
});

test("P01.5 processing stays honest and does not relabel an older accepted script", () => {
  assert.equal(archivePreviewHonesty(null).honesty, "idle");
  assert.equal(archivePreviewHonesty({ status: "done", stage: "analyze" }).honesty, "idle");
  const processing = archivePreviewHonesty({ status: "transcribing", stage: "stt" });
  assert.equal(processing.honesty, "processing");
  assert.match(processing.message ?? "", /обрабатывается/i);
  const failed = archivePreviewHonesty({
    status: "error",
    stage: "analyze",
    errorMessage: "Не удалось обработать материал.",
  });
  assert.equal(failed.honesty, "error");
  assert.match(failed.message ?? "", /Не удалось обработать/);
});

test("P01.5 preview URL, dialog, record and back restore archive filters", () => {
  const history = new ArchiveHistory();
  const base = { ...defaultArchiveListUrlState(), q: "альфа", status: "idea" as const };
  history.replaceHref(archiveListHref(base));
  history.push(openArchivePreview(history.state(), "thought-1"));
  assert.equal(history.state().previewId, "thought-1");
  assert.equal(history.state().q, "альфа");
  assert.equal(history.state().calendarOpen, false);

  history.replaceHref(studioThoughtHref("thought-1", "dialog"));
  assert.equal(history.href(), "/reels/thought-1?tab=dialog");
  history.back();
  assert.equal(history.state().q, "альфа");
  assert.equal(history.state().previewId, null);

  history.push(openArchivePreview(history.state(), "thought-1"));
  history.replaceHref(studioThoughtHref("thought-1", "takes", { record: true }));
  assert.equal(history.href(), "/reels/thought-1?tab=takes&record=1");
  history.back();
  assert.equal(history.state().status, "idea");

  history.push(openArchivePreview(history.state(), "thought-1"));
  history.back();
  assert.deepEqual(
    { ...history.state(), calendarOpen: false, previewId: null },
    { ...base, calendarOpen: false, previewId: null },
  );
  assert.equal(closeArchivePreview(openArchivePreview(base, "x")).previewId, null);
});

test("P01.5 preview endpoint returns summary without N+1 list fields", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-p01-5-"));
  const dbPath = path.join(dir, "test.db");
  closeSync(openSync(dbPath, "a"));
  const url = fileUrl(dbPath);
  process.env.DATABASE_URL = url;
  await resetPrismaClient();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows */
    }
  });
  migrateDeploy(url);

  const { GET } = await import("../src/app/api/reels/[id]/archive-preview/route");
  const { GET: listGet } = await import("../src/app/api/reels/route");

  const reel = await prisma.reel.create({
    data: {
      id: "prev-1",
      title: "Превью мысль",
      initialNote: "исходная мысль пользователя",
      status: "in_progress",
    },
  });
  const first = await prisma.scriptVersion.create({
    data: { reelId: reel.id, kind: "manual", body: "первая готовая версия" },
  });
  const second = await prisma.scriptVersion.create({
    data: { reelId: reel.id, kind: "accepted_ai", body: "последний принятый сценарий для превью" },
  });
  await prisma.scriptVersion.create({
    data: { reelId: reel.id, kind: "ai_proposal", body: "непринятое предложение не должно стать последним" },
  });
  await prisma.reel.update({
    where: { id: reel.id },
    data: { selectedScriptId: second.id, finalScriptId: first.id },
  });
  const take = await prisma.take.create({
    data: { reelId: reel.id, number: 1, inputType: "audio" },
  });
  await prisma.job.create({
    data: {
      originalName: "voice.webm",
      videoPath: "/tmp/voice.webm",
      status: "transcribing",
      stage: "stt",
      takeId: take.id,
    },
  });

  const listed = await (await listGet(new Request("http://vocal.local/api/reels?status=all&q=Превью"))).json();
  assert.equal(listed.reels.length, 1);
  assert.equal(JSON.stringify(listed).includes("последний принятый сценарий для превью"), false);

  const preview = await (
    await GET(new Request("http://vocal.local/api/reels/prev-1/archive-preview"), {
      params: Promise.resolve({ id: "prev-1" }),
    })
  ).json();
  assert.equal(preview.title, "Превью мысль");
  assert.equal(preview.takeCount, 1);
  assert.equal(preview.completed, false);
  assert.equal(preview.honesty, "processing");
  assert.equal(preview.acceptedScript.versionNumber, 2);
  assert.match(preview.acceptedScript.excerpt, /последний принятый/);
  assert.equal(JSON.stringify(preview).includes("непринятое предложение"), false);
  assert.equal(preview.noScriptHint, null);

  const emptyReel = await prisma.reel.create({
    data: { id: "prev-empty", title: "Без сценария", status: "idea" },
  });
  const emptyPreview = await (
    await GET(new Request("http://vocal.local/api/reels/prev-empty/archive-preview"), {
      params: Promise.resolve({ id: emptyReel.id }),
    })
  ).json();
  assert.equal(emptyPreview.acceptedScript, null);
  assert.match(emptyPreview.noScriptHint, /Сценария пока нет/);

  const doneReel = await prisma.reel.create({
    data: { id: "prev-done", title: "Готово", status: "completed" },
  });
  const donePreview = await (
    await GET(new Request("http://vocal.local/api/reels/prev-done/archive-preview"), {
      params: Promise.resolve({ id: doneReel.id }),
    })
  ).json();
  assert.equal(donePreview.completed, true);

  const missing = await GET(new Request("http://vocal.local/api/reels/missing/archive-preview"), {
    params: Promise.resolve({ id: "missing" }),
  });
  assert.equal(missing.status, 404);
});

test("P01.5 completed thought does not open RecordingView from record=1", () => {
  assert.equal(
    resolveStudioRecordDeepLink({ thoughtCompleted: true, hasReadyScript: true, hasDraft: false }),
    "blocked",
  );
  assert.equal(
    resolveStudioRecordDeepLink({ thoughtCompleted: false, hasReadyScript: true, hasDraft: false }),
    "record",
  );
  assert.equal(
    resolveStudioRecordDeepLink({ thoughtCompleted: false, hasReadyScript: false, hasDraft: true }),
    "draft",
  );

  const studio = readFileSync(path.join(root, "src/components/ReelStudio.tsx"), "utf8");
  const preview = readFileSync(path.join(root, "src/components/ArchiveThoughtPreview.tsx"), "utf8");
  assert.match(studio, /resolveStudioRecordDeepLink/);
  assert.match(studio, /thoughtCompleted: thoughtStatus === "completed"/);
  assert.match(studio, /deepLink === "record"/);
  assert.match(studio, /setRecording\(true\)/);
  assert.match(preview, /Сначала верните мысль в работу/);
  assert.match(preview, /data\.completed/);
  const recordBranch = studio.slice(studio.indexOf("resolveStudioRecordDeepLink"));
  assert.match(recordBranch, /if \(deepLink === "record"\)[\s\S]*setRecording\(true\)/);
  assert.doesNotMatch(
    recordBranch,
    /if \(deepLink === "blocked"\)[\s\S]*setRecording\(true\)/,
  );
});

test("P01.5 archive focus is written only on studio leave and cleared after the card is found", () => {
  const first = restoreArchiveFocusOnce({ storedId: "r1", presentIds: ["r1"] });
  assert.equal(first.scrolledTo, "r1");
  assert.equal(first.nextStoredId, null);

  const laterPage = restoreArchiveFocusOnce({
    storedId: first.nextStoredId,
    presentIds: ["r1", "r2", "r3"],
  });
  assert.equal(laterPage.scrolledTo, null);
  assert.equal(laterPage.nextStoredId, null);

  const waiting = restoreArchiveFocusOnce({ storedId: "r9", presentIds: ["r1"] });
  assert.equal(waiting.scrolledTo, null);
  assert.equal(waiting.nextStoredId, "r9");

  const list = readFileSync(path.join(root, "src/components/ReelList.tsx"), "utf8");
  const preview = readFileSync(path.join(root, "src/components/ArchiveThoughtPreview.tsx"), "utf8");
  assert.match(list, /restoreArchiveFocusOnce/);
  assert.match(list, /clearArchiveFocus\(\)/);
  const openPreviewFn = list.slice(list.indexOf("function openPreview"), list.indexOf("useEffect", list.indexOf("function openPreview")));
  assert.match(openPreviewFn, /pushUrl\(openArchivePreview/);
  assert.equal(openPreviewFn.includes("rememberArchiveFocus"), false);
  assert.match(preview, /onLeaveToStudio\?/);
  assert.match(list, /onLeaveToStudio=\{\(\) => rememberArchiveFocus\(previewId\)\}/);
});

test("P01.5 UI opens preview from polaroid zones and routes dialog/record without AI", () => {
  const list = readFileSync(path.join(root, "src/components/ReelList.tsx"), "utf8");
  const card = readFileSync(path.join(root, "src/components/ArchivePolaroidCard.tsx"), "utf8");
  const preview = readFileSync(path.join(root, "src/components/ArchiveThoughtPreview.tsx"), "utf8");
  const studio = readFileSync(path.join(root, "src/components/ReelStudio.tsx"), "utf8");

  assert.match(list, /ArchiveThoughtPreview/);
  assert.match(list, /openArchivePreview/);
  assert.match(list, /rememberArchiveFocus/);
  assert.equal(list.includes("/api/reels/${reel.id}/archive-preview"), false);
  assert.match(card, /onOpenPreview/);
  assert.match(card, /Открыть превью мысли/);
  assert.equal(card.includes("disabled"), false);
  assert.match(card, /studioThoughtHref\(reel\.id, "dialog"\)/);
  assert.match(preview, /Снять новый дубль/);
  assert.match(preview, /Перейти к работе с мыслью/);
  assert.match(preview, /archive-preview/);
  assert.match(preview, /href=\{recordHref\}\s+replace/);
  assert.match(preview, /href=\{dialogHref\}\s+replace/);
  assert.equal(preview.includes("groq"), false);
  assert.equal(preview.includes("/api/analyze"), false);
  assert.match(studio, /record"\) !== "1"/);
  assert.equal(studioThoughtHref("abc", "takes", { record: true }), "/reels/abc?tab=takes&record=1");
});
