/** Pure model of the desktop "path of takes" (P3b): order, zig-zag slots, S-curves, what the AI cloud / conclusion / stickers show. */
import type { CompareDto } from "@/types/compare";
import type { ReviewDto } from "@/types/review";
import { TAKE_INPUT_TYPE_LABELS, type TakeDto } from "@/types/reel";

export type TakeOrder = "newest" | "oldest";

export const POLAROID_W = 236;
export const POLAROID_H = 288;
const SLOT_X = [0.2, 0.76, 0.27, 0.7, 0.23, 0.74];
const SLOT_Y = [70, 340, 640, 930, 1230, 1510];
const SLOT_ROT = [-1.8, 1.5, 1.1, -1.4, 1.7, -1.2];
const TIP_ROT = [-4, 3, -2.5, 4.5, -3, 3.5];
const LAP_HEIGHT = 1800;

export type PathSlot = { side: "left" | "right"; cx: number; top: number; rot: number };

export function orderTakes<T extends { number: number }>(takes: readonly T[], order: TakeOrder): T[] {
  return [...takes].sort((a, b) => (order === "newest" ? b.number - a.number : a.number - b.number));
}

/** Left, right, left… The zig-zag keeps its organic offsets and wraps after six slots. */
export function pathSlot(index: number, width: number): PathSlot {
  const lap = Math.floor(index / SLOT_X.length);
  const half = POLAROID_W / 2 + 12;
  const cx = Math.min(width - half, Math.max(half, SLOT_X[index % SLOT_X.length] * width));
  return {
    side: index % 2 === 0 ? "left" : "right",
    cx,
    top: SLOT_Y[index % SLOT_Y.length] + lap * LAP_HEIGHT,
    rot: SLOT_ROT[index % SLOT_ROT.length],
  };
}

export type PathNode = TakeDto | null;

/** The ghost "next take" stands before the newest take: first when newest-first, last when oldest-first. */
export function pathNodes(takes: readonly TakeDto[], order: TakeOrder): PathNode[] {
  const ordered = orderTakes(takes, order);
  return order === "newest" ? [null, ...ordered] : [...ordered, null];
}

export function pathHeight(nodeCount: number, width: number): number {
  if (nodeCount === 0) return 0;
  return pathSlot(nodeCount - 1, width).top + POLAROID_H + 80;
}

export type PathSegment = {
  key: string;
  d: string;
  mx: number;
  my: number;
  rot: number;
  /** The older neighbour of the pair: its advice sits on the curve (the ghost counts as the newest). */
  olderTakeId: string | null;
};

/** One smooth S-curve between neighbouring slots; the sticker sits in its middle. */
export function pathSegments(nodes: readonly PathNode[], width: number): PathSegment[] {
  const slots = nodes.map((_, index) => pathSlot(index, width));
  return nodes.slice(0, -1).map((node, index) => {
    const from = slots[index];
    const to = slots[index + 1];
    const ay = from.top + 12 + 106;
    const by = to.top + 12 + 106;
    const ax = from.side === "left" ? from.cx + POLAROID_W / 2 + 8 : from.cx - POLAROID_W / 2 - 8;
    const bx = to.side === "left" ? to.cx + POLAROID_W / 2 + 8 : to.cx - POLAROID_W / 2 - 8;
    const reach = (bx - ax) * 0.56;
    const next = nodes[index + 1];
    let older: PathNode;
    if (node && next) older = node.number < next.number ? node : next;
    else older = node ?? next;
    return {
      key: `${node?.id ?? "next"}-${next?.id ?? "next"}`,
      d: `M ${ax} ${ay} C ${ax + reach} ${ay}, ${bx - reach} ${by}, ${bx} ${by}`,
      mx: (ax + bx) / 2,
      my: (ay + by) / 2,
      rot: TIP_ROT[index % TIP_ROT.length],
      olderTakeId: older?.id ?? null,
    };
  });
}

export type TakeInsight = {
  /** Cloud above the polaroid: how the thought moved relative to the previous take (saved comparison). */
  verdict: string | null;
  /** One line under the polaroid: the notes of that comparison. */
  conclusion: string | null;
  /** Stickers "что улучшить": what a saved review of this take says is missing. */
  tips: string[];
  /** Main idea of the take for the polaroid square (saved review), when there is no video frame. */
  quote: string | null;
};

const CONCLUSION_MAX = 160;
const TIPS_MAX = 2;

function clip(text: string, max: number) {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/**
 * Cloud and conclusion come from the saved comparison in which the take is the newer one (by number); several → the latest.
 * Tips and the quote come from the latest successful saved review of the take. Nothing is invented: no data → null / [].
 */
export function takeInsights(
  takes: readonly TakeDto[],
  comparisons: readonly CompareDto[],
  reviewsByTake: Readonly<Record<string, readonly ReviewDto[]>>,
): Record<string, TakeInsight> {
  const byId = new Map(takes.map((take) => [take.id, take]));
  const result: Record<string, TakeInsight> = {};
  const latestFirst = [...comparisons].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const take of takes) {
    const compare = latestFirst.find((item) => {
      if (item.status !== "done" || !item.semantic) return false;
      const ids = [item.leftTakeId, item.rightTakeId];
      if (!ids.includes(take.id)) return false;
      const other = byId.get(ids[0] === take.id ? ids[1] : ids[0]);
      return Boolean(other) && other!.number < take.number;
    });
    const review = (reviewsByTake[take.id] ?? []).find((item) => item.status === "done" && item.result) ?? null;
    const semantic = compare?.semantic ?? null;
    result[take.id] = {
      verdict: semantic ? (semantic.thoughtPreserved ? "Мысль сохранилась" : "Мысль могла сместиться") : null,
      conclusion: semantic?.notes?.trim() ? clip(semantic.notes, CONCLUSION_MAX) : null,
      tips: (review?.result?.missing ?? []).map((tip) => clip(tip, 90)).filter(Boolean).slice(0, TIPS_MAX),
      quote: review?.result?.authorThought?.trim() ? clip(review.result.authorThought, 110) : null,
    };
  }
  return result;
}

/** Text of the polaroid square for a take without a frame: the review's main idea, or the start of a text take. */
export function polaroidQuote(take: TakeDto, insight: TakeInsight | undefined): string | null {
  if (insight?.quote) return insight.quote;
  if (take.inputType === "text" && take.bodyText.trim()) return clip(take.bodyText, 110);
  return null;
}

export function takeCaption(take: TakeDto): string {
  return `Дубль ${take.number} · ${TAKE_INPUT_TYPE_LABELS[take.inputType]}`;
}

export function takeAriaLabel(take: TakeDto, isFinal: boolean, verdict: string | null): string {
  return `${takeCaption(take)}${verdict ? `, ${verdict}` : ""}${isFinal ? ", итоговый дубль" : ""}`;
}

export function takesCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? "дублей" : mod10 === 1 ? "дубль" : mod10 >= 2 && mod10 <= 4 ? "дубля" : "дублей";
  return `${count} ${word}`;
}

/** Which of the three actions a take offers: listen needs playable media (or video), read needs text, video only for a ready browser-playable clip. */
/** The reel list omits media URLs on purpose; the endpoint itself is stable (`/api/takes/:id/media`). */
export function takeMediaUrl(take: TakeDto): string | null {
  if (take.mediaUrl) return take.mediaUrl;
  return take.hasFile ? `/api/takes/${take.id}/media` : null;
}

export function takeActions(take: TakeDto): { listen: boolean; read: boolean; video: boolean } {
  const playable = take.inputType !== "text" && take.mediaStatus === "ready" && take.hasFile && take.browserPlayback;
  return {
    listen: playable,
    read: true,
    video: playable && take.inputType === "video",
  };
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
