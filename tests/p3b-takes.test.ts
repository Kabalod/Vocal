import "./helpers/react-global";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  orderTakes,
  pathHeight,
  pathNodes,
  pathSegments,
  pathSlot,
  polaroidQuote,
  takeActions,
  takeAriaLabel,
  takeCaption,
  takeMediaUrl,
  takesCountLabel,
  formatClock,
} from "../src/components/takes-path";
import type { TakeDto } from "../src/types/reel";

function take(number: number, patch: Partial<TakeDto> = {}): TakeDto {
  return {
    id: `t${number}`,
    reelId: "r1",
    number,
    inputType: "audio",
    authorNote: "",
    mediaStatus: "ready",
    originalName: null,
    mimeType: "audio/webm",
    bodyText: "",
    hasFile: true,
    browserPlayback: true,
    mediaUrl: `/media/t${number}`,
    downloadUrl: null,
    scriptVersionId: null,
    createdAt: "2026-10-15T08:00:00.000Z",
    jobs: [],
    ...patch,
  };
}

test("order and the ghost: newest first puts the ghost first, oldest first puts it last", () => {
  const takes = [take(2), take(1), take(3)];
  assert.deepEqual(orderTakes(takes, "newest").map((item) => item.number), [3, 2, 1]);
  assert.deepEqual(orderTakes(takes, "oldest").map((item) => item.number), [1, 2, 3]);
  const newest = pathNodes(takes, "newest");
  assert.equal(newest[0], null);
  assert.equal(newest.length, 4);
  const oldest = pathNodes(takes, "oldest");
  assert.equal(oldest[oldest.length - 1], null);
});

test("zig-zag: sides alternate, slots stay inside the width, the path grows with the takes", () => {
  const width = 1000;
  for (let index = 0; index < 8; index += 1) {
    const slot = pathSlot(index, width);
    assert.equal(slot.side, index % 2 === 0 ? "left" : "right");
    assert.ok(slot.cx >= 130 && slot.cx <= width - 130);
  }
  assert.ok(pathSlot(6, width).top > pathSlot(5, width).top);
  assert.equal(pathHeight(0, width), 0);
  assert.ok(pathHeight(5, width) > pathHeight(2, width));
});

test("S-curves join neighbours", () => {
  const takes = [take(1), take(2), take(3)];
  const nodes = pathNodes(takes, "newest"); // ghost, 3, 2, 1
  const segments = pathSegments(nodes, 1000);
  assert.equal(segments.length, 3);
  assert.ok(segments.every((segment) => segment.d.startsWith("M ") && segment.d.includes(" C ")));
});

test("no AI layer on the path: no insights model, no cloud / conclusion / stickers in the markup or styles", () => {
  const root = process.cwd();
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");
  const model = read("src/components/takes-path.ts");
  assert.doesNotMatch(model, /takeInsights|TakeInsight|olderTakeId/);
  for (const file of ["src/components/TakesPathDesktop.tsx", "src/components/TakesPathMobile.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /data-take-verdict|data-take-conclusion|data-take-tips|useTakeInsights|\/compare|\/review/, file);
  }
  assert.doesNotMatch(read("src/components/takes-path.css"), /tp-cloud|tp-conclusion|tp-tip/);
});

test("actions per take: listen/video only for a ready browser-playable file; read always", () => {
  assert.deepEqual(takeActions(take(1)), { listen: true, read: true, video: false });
  assert.deepEqual(takeActions(take(2, { inputType: "video" })), { listen: true, read: true, video: true });
  assert.deepEqual(takeActions(take(3, { inputType: "text", hasFile: false, mediaUrl: null })), { listen: false, read: true, video: false });
  // the reel list carries no media URL: the stable endpoint is used
  assert.deepEqual(takeActions(take(6, { mediaUrl: null })), { listen: true, read: true, video: false });
  assert.equal(takeMediaUrl(take(6, { mediaUrl: null })), "/api/takes/t6/media");
  assert.equal(takeMediaUrl(take(7, { inputType: "text", hasFile: false, mediaUrl: null })), null);
  assert.deepEqual(takeActions(take(4, { mediaStatus: "pending" })), { listen: false, read: true, video: false });
  assert.deepEqual(takeActions(take(5, { inputType: "video", browserPlayback: false })), { listen: false, read: true, video: false });
});

test("labels: caption, aria label, count and clock", () => {
  assert.equal(takeCaption(take(4)), "Дубль 4 · Аудио");
  assert.equal(takeAriaLabel(take(4), true), "Дубль 4 · Аудио, итоговый дубль");
  assert.equal(takesCountLabel(1), "1 дубль");
  assert.equal(takesCountLabel(3), "3 дубля");
  assert.equal(takesCountLabel(5), "5 дублей");
  assert.equal(takesCountLabel(11), "11 дублей");
  assert.equal(takesCountLabel(21), "21 дубль");
  assert.equal(formatClock(75), "1:15");
  assert.equal(formatClock(Number.NaN), "0:00");
  assert.equal(polaroidQuote(take(1, { inputType: "text", bodyText: "Первая мысль текстом." })), "Первая мысль текстом.");
  assert.equal(polaroidQuote(take(2)), null);
});

test("wiring: the path replaces the list on the desktop only; recording keeps its logic and starts only on the button", () => {
  const root = process.cwd();
  const takes = readFileSync(path.join(root, "src/components/ReelTakes.tsx"), "utf8");
  assert.match(takes, /desktop \? TakesPathDesktop : TakesPathMobile/);
  const studio = readFileSync(path.join(root, "src/components/ReelStudio.tsx"), "utf8");
  assert.match(studio, /desktop=\{desktop\}/);
  const rec = readFileSync(path.join(root, "src/components/RecordingView.tsx"), "utf8");
  assert.match(rec, /data-recording-desktop/);
  assert.match(rec, /data-teleprompter/);
  // startRecording is reachable only from the "Начать запись" button.
  assert.equal(rec.match(/void startRecording\(\)/g)?.length, 1);
  assert.doesNotMatch(rec, /useEffect\([^)]*startRecording/);
  const path_ = readFileSync(path.join(root, "src/components/TakesPathDesktop.tsx"), "utf8");
  for (const name of ["Слушать", "Читать", "Видео", "Сделать итоговым", "Следующий дубль", "итоговый"]) assert.ok(path_.includes(name), name);
  assert.match(path_, /от последнего/);
  assert.match(path_, /от первого/);
});
