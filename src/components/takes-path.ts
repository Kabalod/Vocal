/** Pure model of the "path of takes" (P3b/P4): order, zig-zag slots, S-curves. The path is the history of takes: no AI layer. */
import { TAKE_INPUT_TYPE_LABELS, type TakeDto } from "@/types/reel";

export type TakeOrder = "newest" | "oldest";

export const POLAROID_W = 236;
export const POLAROID_H = 288;
const SLOT_X = [0.2, 0.76, 0.27, 0.7, 0.23, 0.74];
const SLOT_Y = [70, 340, 640, 930, 1230, 1510];
const SLOT_ROT = [-1.8, 1.5, 1.1, -1.4, 1.7, -1.2];
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
};

/** One smooth S-curve between neighbouring slots. */
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
    return {
      key: `${node?.id ?? "next"}-${next?.id ?? "next"}`,
      d: `M ${ax} ${ay} C ${ax + reach} ${ay}, ${bx - reach} ${by}, ${bx} ${by}`,
    };
  });
}

const QUOTE_MAX = 110;

function clip(text: string, max: number) {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/** Text of the polaroid square for a take without a frame: the start of a text take (the author's own words). */
export function polaroidQuote(take: TakeDto): string | null {
  if (take.inputType === "text" && take.bodyText.trim()) return clip(take.bodyText, QUOTE_MAX);
  return null;
}

export function takeCaption(take: TakeDto): string {
  return `Дубль ${take.number} · ${TAKE_INPUT_TYPE_LABELS[take.inputType]}`;
}

export function takeAriaLabel(take: TakeDto, isFinal: boolean): string {
  return `${takeCaption(take)}${isFinal ? ", итоговый дубль" : ""}`;
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

/** Mobile path (ref 08): the focus card shows the final take, or the newest one while none is final; a removed focus falls back too. */
export function focusTakeId(takes: readonly TakeDto[], finalTakeId: string | null, current: string | null): string | null {
  if (current && takes.some((take) => take.id === current)) return current;
  if (finalTakeId && takes.some((take) => take.id === finalTakeId)) return finalTakeId;
  return takes.length === 0 ? null : orderTakes(takes, "newest")[0].id;
}

/** Mobile timeline: every take in the chosen order except the one in the focus card; the ghost "next take" sits at the newest end. */
export function timelineNodes(takes: readonly TakeDto[], order: TakeOrder, focusId: string | null): PathNode[] {
  return pathNodes(takes, order).filter((node) => node === null || node.id !== focusId);
}
