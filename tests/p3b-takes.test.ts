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
  takeInsights,
  takeMediaUrl,
  takesCountLabel,
  formatClock,
} from "../src/components/takes-path";
import type { CompareDto } from "../src/types/compare";
import type { ReviewDto } from "../src/types/review";
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

function compare(left: string, right: string, patch: Partial<CompareDto> = {}): CompareDto {
  return {
    id: `c-${left}-${right}`,
    reelId: "r1",
    leftTakeId: left,
    rightTakeId: right,
    leftTranscriptId: "x",
    rightTranscriptId: "y",
    intent: "",
    textDiff: {} as CompareDto["textDiff"],
    semantic: { thoughtPreserved: true, intentMet: null, notes: "Заход короче.", leftOnly: [], rightOnly: [], inventedIdeas: [] },
    status: "done",
    errorMessage: null,
    model: null,
    promptVersion: null,
    createdAt: "2026-10-15T09:00:00.000Z",
    ...patch,
  };
}

function review(takeId: string, missing: string[], authorThought = "Мысль автора"): ReviewDto {
  return {
    id: `rv-${takeId}`,
    status: "done",
    result: { authorThought, modelSuggestion: "", quotes: [], keep: [], missing, notInText: [], insufficientMaterial: false, questions: [] },
  } as unknown as ReviewDto;
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

test("S-curves join neighbours; the sticker belongs to the older take of a pair, the ghost counts as the newest", () => {
  const takes = [take(1), take(2), take(3)];
  const nodes = pathNodes(takes, "newest"); // ghost, 3, 2, 1
  const segments = pathSegments(nodes, 1000);
  assert.equal(segments.length, 3);
  assert.ok(segments.every((segment) => segment.d.startsWith("M ") && segment.d.includes(" C ")));
  assert.deepEqual(segments.map((segment) => segment.olderTakeId), ["t3", "t2", "t1"]);
  const oldest = pathSegments(pathNodes(takes, "oldest"), 1000); // 1, 2, 3, ghost
  assert.deepEqual(oldest.map((segment) => segment.olderTakeId), ["t1", "t2", "t3"]);
});

test("insights: cloud and conclusion from a saved comparison, tips from a saved review; no data → nothing", () => {
  const takes = [take(1), take(2), take(3)];
  const insights = takeInsights(
    takes,
    [compare("t1", "t2"), compare("t2", "t3", { semantic: { thoughtPreserved: false, intentMet: null, notes: "  ", leftOnly: [], rightOnly: [], inventedIdeas: [] } })],
    { t1: [review("t1", ["Начни сразу с главного", "Одна мысль — одно предложение", "Третий совет лишний"])] },
  );
  assert.equal(insights.t1.verdict, null, "the first take has nothing to be compared with");
  assert.equal(insights.t2.verdict, "Мысль сохранилась");
  assert.equal(insights.t2.conclusion, "Заход короче.");
  assert.equal(insights.t3.verdict, "Мысль могла сместиться");
  assert.equal(insights.t3.conclusion, null, "empty notes are not drawn");
  assert.deepEqual(insights.t1.tips, ["Начни сразу с главного", "Одна мысль — одно предложение"]);
  assert.deepEqual(insights.t2.tips, []);
  assert.equal(insights.t1.quote, "Мысль автора");
  const failed = takeInsights(takes, [compare("t1", "t2", { status: "error", semantic: null })], {});
  assert.equal(failed.t2.verdict, null);
});

test("insights: a comparison counts for the newer take only, and the latest one wins", () => {
  const takes = [take(1), take(2)];
  const older = compare("t1", "t2", { id: "old", createdAt: "2026-10-14T09:00:00.000Z" });
  const newer = compare("t2", "t1", {
    id: "new",
    createdAt: "2026-10-15T09:00:00.000Z",
    semantic: { thoughtPreserved: false, intentMet: null, notes: "Сместилась.", leftOnly: [], rightOnly: [], inventedIdeas: [] },
  });
  const insights = takeInsights(takes, [older, newer], {});
  assert.equal(insights.t2.conclusion, "Сместилась.");
  assert.equal(insights.t1.conclusion, null);
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
  assert.equal(takeAriaLabel(take(4), true, "Мысль сохранилась"), "Дубль 4 · Аудио, Мысль сохранилась, итоговый дубль");
  assert.equal(takesCountLabel(1), "1 дубль");
  assert.equal(takesCountLabel(3), "3 дубля");
  assert.equal(takesCountLabel(5), "5 дублей");
  assert.equal(takesCountLabel(11), "11 дублей");
  assert.equal(takesCountLabel(21), "21 дубль");
  assert.equal(formatClock(75), "1:15");
  assert.equal(formatClock(Number.NaN), "0:00");
  assert.equal(polaroidQuote(take(1, { inputType: "text", bodyText: "Первая мысль текстом." }), undefined), "Первая мысль текстом.");
  assert.equal(polaroidQuote(take(2), undefined), null);
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
  for (const name of ["Слушать", "Читать", "Видео", "Сделать итоговым", "Следующий дубль", "Что улучшить", "итоговый"]) assert.ok(path_.includes(name), name);
  assert.match(path_, /от последнего/);
  assert.match(path_, /от первого/);
});
