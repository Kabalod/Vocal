export const ARCHIVE_DESK_SPREAD_SIZE = 6;
export type ArchiveDeskSlot = 1 | 2 | 3 | 4 | 5 | 6;

/** Workspace field of `план разработки/Vocal_итог_v2_календарь.png` below the top pills. */
export const ARCHIVE_DESK_REF = {
  width: 1280,
  height: 828,
} as const;

/**
 * One reference layout. Card sizes and angles stay as measured;
 * centers are spread a little wider, with the specified corner nudges.
 */
export const ARCHIVE_DESK_SLOTS = [
  { slot: 1, cx: 0.218, cy: 0.278, w: 0.3156, h: 0.5278, angle: 0 },
  { slot: 2, cx: 0.527, cy: 0.248, w: 0.263, h: 0.3925, angle: 3 },
  { slot: 3, cx: 0.848, cy: 0.248, w: 0.2963, h: 0.4236, angle: 2 },
  { slot: 4, cx: 0.128, cy: 0.802, w: 0.2293, h: 0.3594, angle: -4.4 },
  { slot: 5, cx: 0.484, cy: 0.778, w: 0.2939, h: 0.3226, angle: 2.4 },
  { slot: 6, cx: 0.852, cy: 0.78, w: 0.2572, h: 0.4541, angle: 3 },
] as const;

export const ARCHIVE_DESK_CENTER_SLOTS: ReadonlySet<ArchiveDeskSlot> = new Set([2, 5]);
export const ARCHIVE_DESK_HORIZONTAL_SPREAD = 1.07;
export const ARCHIVE_DESK_HEIGHT_FIT = 0.94;
/** Work area at 1920×1080 with the desktop sidebar (~240px) still open. */
export const ARCHIVE_DESK_WIDE_MIN_WIDTH = 1560;
export const ARCHIVE_DESK_WIDE_ASPECT = 1.62;
export const ARCHIVE_DESK_WIDE_INSET = 36;
export const ARCHIVE_DESK_WIDE_EDGE_PUSH = 1;

export function isArchiveDeskWide(availW: number, availH: number): boolean {
  return availW >= ARCHIVE_DESK_WIDE_MIN_WIDTH && availW / availH >= ARCHIVE_DESK_WIDE_ASPECT;
}

export type ArchiveDeskPlacedSlot = {
  slot: ArchiveDeskSlot;
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
};

export function chunkArchiveDeskSpreads<T>(items: readonly T[]): T[][] {
  const spreads: T[][] = [];
  for (let i = 0; i < items.length; i += ARCHIVE_DESK_SPREAD_SIZE) {
    spreads.push(items.slice(i, i + ARCHIVE_DESK_SPREAD_SIZE));
  }
  return spreads;
}

export function archiveDeskSlot(indexInSpread: number): ArchiveDeskSlot {
  return ((indexInSpread % ARCHIVE_DESK_SPREAD_SIZE) + 1) as ArchiveDeskSlot;
}

/** Work-column width maps to viewport 1680 / 1920 / 2400 with a 240px sidebar. */
export function archiveDeskMinGap(availW: number): number {
  if (availW >= 2160) return 48;
  if (availW >= 1680) return 40;
  if (availW >= 1440) return 32;
  if (availW >= 1200) return 32;
  return 24;
}

export function archiveDeskCenterBoost(availW: number): number {
  if (availW >= 2160) return 1.28;
  if (availW >= 1680) return 1.2 + (0.08 * (availW - 1680)) / 480;
  if (availW >= 1440) return 1.12 + (0.08 * (availW - 1440)) / 240;
  return 1;
}

function rotatedExtent(width: number, height: number, angle: number) {
  const rad = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

function cornersOf(box: ArchiveDeskPlacedSlot): Array<[number, number]> {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const rad = (box.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const pts: Array<[number, number]> = [];
  for (const [dx, dy] of [
    [-box.width / 2, -box.height / 2],
    [box.width / 2, -box.height / 2],
    [box.width / 2, box.height / 2],
    [-box.width / 2, box.height / 2],
  ] as const) {
    pts.push([cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]);
  }
  return pts;
}

function axesOf(pts: Array<[number, number]>): Array<[number, number]> {
  const axes: Array<[number, number]> = [];
  for (let i = 0; i < 4; i += 1) {
    const x1 = pts[i]![0];
    const y1 = pts[i]![1];
    const x2 = pts[(i + 1) % 4]![0];
    const y2 = pts[(i + 1) % 4]![1];
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const length = Math.hypot(nx, ny) || 1;
    axes.push([nx / length, ny / length]);
  }
  return axes;
}

function project(pts: Array<[number, number]>, axis: [number, number]): [number, number] {
  const dots = pts.map((point) => point[0] * axis[0] + point[1] * axis[1]);
  return [Math.min(...dots), Math.max(...dots)];
}

export function archiveDeskRotatedGap(a: ArchiveDeskPlacedSlot, b: ArchiveDeskPlacedSlot): number {
  const pa = cornersOf(a);
  const pb = cornersOf(b);
  let minOverlap = Infinity;
  let minSep = Infinity;
  let separated = false;
  for (const axis of [...axesOf(pa), ...axesOf(pb)]) {
    const [amin, amax] = project(pa, axis);
    const [bmin, bmax] = project(pb, axis);
    if (amax <= bmin) {
      separated = true;
      minSep = Math.min(minSep, bmin - amax);
    } else if (bmax <= amin) {
      separated = true;
      minSep = Math.min(minSep, amin - bmax);
    } else {
      minOverlap = Math.min(minOverlap, Math.min(amax, bmax) - Math.max(amin, bmin));
    }
  }
  return separated ? minSep : -minOverlap;
}

function aabbOf(box: ArchiveDeskPlacedSlot) {
  const extent = rotatedExtent(box.width, box.height, box.angle);
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  return {
    left: cx - extent.width / 2,
    right: cx + extent.width / 2,
    top: cy - extent.height / 2,
    bottom: cy + extent.height / 2,
  };
}

function aabbGap(a: ArchiveDeskPlacedSlot, b: ArchiveDeskPlacedSlot): number {
  const aa = aabbOf(a);
  const bb = aabbOf(b);
  const dx = Math.max(0, bb.left - aa.right, aa.left - bb.right);
  const dy = Math.max(0, bb.top - aa.bottom, aa.top - bb.bottom);
  if (dx === 0 && dy === 0) {
    return -Math.min(Math.min(aa.right, bb.right) - Math.max(aa.left, bb.left), Math.min(aa.bottom, bb.bottom) - Math.max(aa.top, bb.top));
  }
  if (dx === 0) return dy;
  if (dy === 0) return dx;
  return Math.hypot(dx, dy);
}

function layoutMinNeighborGap(placed: ArchiveDeskPlacedSlot[]): number {
  const neighbors: Array<[ArchiveDeskSlot, ArchiveDeskSlot]> = [
    [1, 2],
    [2, 3],
    [1, 4],
    [1, 5],
    [2, 5],
    [3, 6],
    [4, 5],
    [5, 6],
  ];
  const bySlot = new Map(placed.map((item) => [item.slot, item]));
  let min = Infinity;
  for (const [left, right] of neighbors) {
    const a = bySlot.get(left);
    const b = bySlot.get(right);
    if (!a || !b) continue;
    min = Math.min(min, aabbGap(a, b));
  }
  return min;
}

function translateLayout(placed: ArchiveDeskPlacedSlot[], dx: number, dy: number): ArchiveDeskPlacedSlot[] {
  if (dx === 0 && dy === 0) return placed;
  return placed.map((box) => ({ ...box, left: box.left + dx, top: box.top + dy }));
}

function fitIntoField(placed: ArchiveDeskPlacedSlot[], availW: number, availH: number, inset: number) {
  const bounds = layoutBounds(placed);
  const fieldLeft = inset;
  const fieldRight = availW - inset;
  const fieldTop = 8;
  const fieldBottom = availH - 8;
  let dx = 0;
  let dy = 0;
  if (bounds.left < fieldLeft) dx = fieldLeft - bounds.left;
  else if (bounds.right > fieldRight) dx = fieldRight - bounds.right;
  if (bounds.top < fieldTop) dy = fieldTop - bounds.top;
  else if (bounds.bottom > fieldBottom) dy = fieldBottom - bounds.bottom;
  return translateLayout(placed, dx, dy);
}

function scaleLayoutToFit(placed: ArchiveDeskPlacedSlot[], availW: number, availH: number, inset: number) {
  const fitted = fitIntoField(placed, availW, availH, inset);
  const bounds = layoutBounds(fitted);
  const fieldW = Math.max(availW - inset * 2, 1);
  const fieldH = Math.max(availH - 16, 1);
  const bw = Math.max(bounds.right - bounds.left, 1);
  const bh = Math.max(bounds.bottom - bounds.top, 1);
  const s = Math.min(1, fieldW / bw, fieldH / bh);
  if (s >= 0.999) return fitted;
  const cx = (bounds.left + bounds.right) / 2;
  const cy = (bounds.top + bounds.bottom) / 2;
  return fitted.map((box) => {
    const bcx = box.left + box.width / 2;
    const bcy = box.top + box.height / 2;
    const width = box.width * s;
    const height = box.height * s;
    return {
      ...box,
      width,
      height,
      left: cx + (bcx - cx) * s - width / 2,
      top: cy + (bcy - cy) * s - height / 2,
    };
  });
}

function pushNeighbors(placed: ArchiveDeskPlacedSlot[], needed: number): ArchiveDeskPlacedSlot[] {
  const next = placed.map((box) => ({ ...box }));
  const bySlot = new Map(next.map((item) => [item.slot, item]));
  const moves: Array<{ from: ArchiveDeskSlot; to: ArchiveDeskSlot; dir: "x" | "y"; sign: number }> = [
    { from: 2, to: 1, dir: "x", sign: -1 },
    { from: 2, to: 3, dir: "x", sign: 1 },
    { from: 5, to: 4, dir: "x", sign: -1 },
    { from: 5, to: 6, dir: "x", sign: 1 },
    { from: 2, to: 5, dir: "y", sign: 1 },
    { from: 1, to: 4, dir: "y", sign: 1 },
    { from: 3, to: 6, dir: "y", sign: 1 },
  ];
  for (const move of moves) {
    const a = bySlot.get(move.from);
    const b = bySlot.get(move.to);
    if (!a || !b) continue;
    const gap = aabbGap(a, b);
    if (gap >= needed) continue;
    const extra = needed - gap + 1;
    if (move.dir === "x") b.left += extra * move.sign;
    else b.top += extra * move.sign;
  }
  return next;
}

function applyCenterBoost(
  placed: ArchiveDeskPlacedSlot[],
  boost: number,
  needed: number,
  availW: number,
  availH: number,
  inset: number,
): ArchiveDeskPlacedSlot[] {
  let next = boostCenterSlots(placed, boost);
  for (let i = 0; i < 6; i += 1) {
    next = scaleLayoutToFit(pushNeighbors(next, needed), availW, availH, inset);
    if (layoutMinNeighborGap(next) >= needed && fitsField(next, availW, availH, inset)) break;
  }
  return next;
}

function boostCenterSlots(placed: ArchiveDeskPlacedSlot[], boost: number): ArchiveDeskPlacedSlot[] {
  if (boost <= 1) return placed;
  return placed.map((box) => {
    if (!ARCHIVE_DESK_CENTER_SLOTS.has(box.slot)) return box;
    const width = box.width * boost;
    const height = box.height * boost;
    return {
      ...box,
      left: box.left + box.width / 2 - width / 2,
      top: box.top + box.height / 2 - height / 2,
      width,
      height,
    };
  });
}

function placeAtScale(
  availW: number,
  availH: number,
  scale: number,
  horizontalSpread: number,
  edgePush = 1,
): ArchiveDeskPlacedSlot[] {
  const usedW = ARCHIVE_DESK_REF.width * scale;
  const usedH = ARCHIVE_DESK_REF.height * scale;
  const spread = usedW > 0 ? Math.min(availW / usedW, horizontalSpread) : 1;
  const posW = usedW * spread;
  const ox = (availW - posW) / 2;
  const oy = (availH - usedH) / 2;
  return ARCHIVE_DESK_SLOTS.map((slot) => {
    const width = slot.w * usedW;
    const height = slot.h * usedH;
    const cx = 0.5 + (slot.cx - 0.5) * edgePush;
    return {
      slot: slot.slot,
      left: ox + cx * posW - width / 2,
      top: oy + slot.cy * usedH - height / 2,
      width,
      height,
      angle: slot.angle,
    };
  });
}

function layoutBounds(placed: ArchiveDeskPlacedSlot[]) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const box of placed) {
    const extent = rotatedExtent(box.width, box.height, box.angle);
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    left = Math.min(left, cx - extent.width / 2);
    right = Math.max(right, cx + extent.width / 2);
    top = Math.min(top, cy - extent.height / 2);
    bottom = Math.max(bottom, cy + extent.height / 2);
  }
  return { left, top, right, bottom };
}

function horizontalSpreadFor(availW: number, scale: number, wide: boolean): number {
  if (!wide) return ARCHIVE_DESK_HORIZONTAL_SPREAD;
  const usedW = ARCHIVE_DESK_REF.width * scale;
  return Math.max(
    ARCHIVE_DESK_HORIZONTAL_SPREAD,
    (availW - ARCHIVE_DESK_WIDE_INSET * 2) / Math.max(usedW, 1),
  );
}

function fitsField(placed: ArchiveDeskPlacedSlot[], availW: number, availH: number, inset: number) {
  const bounds = layoutBounds(placed);
  return (
    bounds.left >= inset &&
    bounds.right <= availW - inset &&
    bounds.top >= 8 &&
    bounds.bottom <= availH - 8
  );
}

export function scaleArchiveDeskLayout(availW: number, availH: number): ArchiveDeskPlacedSlot[] {
  if (availW <= 0 || availH <= 0) return [];
  const wide = isArchiveDeskWide(availW, availH);
  let scale = Math.min(availW / ARCHIVE_DESK_REF.width, availH / ARCHIVE_DESK_REF.height);
  const edgePush = wide ? ARCHIVE_DESK_WIDE_EDGE_PUSH : 1;
  let placed = placeAtScale(availW, availH, scale, horizontalSpreadFor(availW, scale, wide), edgePush);
  const inset = wide ? ARCHIVE_DESK_WIDE_INSET : 8;
  if (!fitsField(placed, availW, availH, inset)) {
    scale *= wide ? 0.96 : ARCHIVE_DESK_HEIGHT_FIT;
    placed = placeAtScale(availW, availH, scale, horizontalSpreadFor(availW, scale, wide), edgePush);
  }

  const needed = archiveDeskMinGap(availW);
  let boost = archiveDeskCenterBoost(availW);
  const minBoost = availW >= 1440 ? 1.12 : 1;
  let boosted = applyCenterBoost(placed, boost, needed, availW, availH, inset);
  while (boost > minBoost + 0.001 && layoutMinNeighborGap(boosted) < needed) {
    boost = Math.max(minBoost, boost - 0.02);
    boosted = applyCenterBoost(placed, boost, needed, availW, availH, inset);
  }
  return boosted;
}
