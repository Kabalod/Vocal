import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ARCHIVE_DESK_CENTER_SLOTS,
  archiveDeskCenterBoost,
  archiveDeskMinGap,
  archiveDeskRotatedGap,
  scaleArchiveDeskLayout,
} from "../src/lib/archive-desk-layout";
import { groupArchiveListByMonth, mergeReelListPages } from "../src/lib/thought-archive-state";
import { isArchiveDensity, readArchiveDensity, writeArchiveDensity } from "../src/lib/archive-density";
import type { ReelListItemDto } from "../src/types/reel";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function reel(id: string, title: string, createdAt: string): ReelListItemDto {
  return {
    id,
    title,
    status: "idea",
    statusGroup: "open",
    preview: "",
    takeCount: 0,
    hasScript: false,
    createdAt,
    updatedAt: createdAt,
  };
}

test("P01.6-2 center cards grow on wide desks without overlapping neighbors", () => {
  assert.ok(Math.abs(archiveDeskCenterBoost(1440) - 1.12) < 0.001);
  assert.ok(Math.abs(archiveDeskCenterBoost(1680) - 1.2) < 0.001);
  assert.ok(Math.abs(archiveDeskCenterBoost(2160) - 1.28) < 0.001);
  assert.equal(archiveDeskMinGap(1440), 32);
  assert.equal(archiveDeskMinGap(1680), 40);
  assert.equal(archiveDeskMinGap(2160), 48);

  const wide = scaleArchiveDeskLayout(2160, 1000);
  const slot1 = wide.find((item) => item.slot === 1)!;
  const slot2 = wide.find((item) => item.slot === 2)!;
  assert.ok(ARCHIVE_DESK_CENTER_SLOTS.has(2));
  assert.ok(slot2.width / slot1.width > (0.263 / 0.3156) * 1.1);
  assert.ok(archiveDeskRotatedGap(slot1, slot2) > 0);
});

test("P01.6-2 polaroid hit targets are siblings and list months do not repeat", () => {
  const card = readFileSync(join(root, "src/components/ArchivePolaroidCard.tsx"), "utf8");
  const listView = readFileSync(join(root, "src/components/ArchiveListView.tsx"), "utf8");
  const reelList = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  assert.match(card, /archive-polaroid-preview/);
  assert.match(card, /archive-polaroid-footer/);
  assert.match(card, /openArchivePreview|onOpenPreview/);
  assert.match(card, /studioThoughtHref\(reel\.id, "dialog"\)/);
  assert.equal(card.includes("<button") && card.includes("<Link"), true);
  assert.doesNotMatch(card, /archive-polaroid-preview[\s\S]*<button/);
  assert.doesNotMatch(card, /archive-polaroid-footer[\s\S]*<button/);
  assert.match(card, /pointer-events: none|PolaroidStatus/);
  assert.match(listView, /groupArchiveListByMonth/);
  assert.match(listView, /archive-list-main/);
  assert.match(listView, /archive-list-dialog/);
  assert.match(listView, /studioThoughtHref\(reel\.id, "dialog"\)/);
  assert.match(reelList, /density === "list"/);
  assert.match(reelList, /ArchiveListView/);
  assert.equal(reelList.includes("writeArchiveDensity(next)"), true);

  const groups = groupArchiveListByMonth([
    reel("a", "A", "2026-09-02T10:00:00.000Z"),
    reel("b", "B", "2026-09-01T10:00:00.000Z"),
    reel("c", "C", "2026-08-20T10:00:00.000Z"),
  ]);
  assert.equal(groups.length, 2);
  assert.match(groups[0]!.label, /Сентябрь 2026/i);
  assert.equal(groups[0]!.items.length, 2);
  assert.match(groups[1]!.label, /Август 2026/i);

  const merged = mergeReelListPages(
    [reel("a", "A", "2026-09-02T10:00:00.000Z")],
    [reel("d", "D", "2026-09-01T09:00:00.000Z"), reel("c", "C", "2026-08-20T10:00:00.000Z")],
    true,
  );
  const mergedGroups = groupArchiveListByMonth(merged);
  assert.equal(mergedGroups.length, 2);
  assert.equal(mergedGroups[0]!.items.map((item) => item.id).join(""), "ad");
});

test("P01.6-2 view mode persists and mobile chrome stays compact", (t) => {
  const memory = new Map<string, string>([["vocal-archive-density-v1", "compact"]]);
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: store },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: store,
  });
  t.after(() => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "localStorage");
  });
  assert.equal(readArchiveDensity(), "compact");
  writeArchiveDensity("list");
  assert.equal(readArchiveDensity(), "list");
  assert.equal(isArchiveDensity("list"), true);

  const shell = readFileSync(join(root, "src/components/VocalAppShell.tsx"), "utf8");
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  const filters = readFileSync(join(root, "src/components/ArchiveStatusFilters.tsx"), "utf8");
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  const sort = readFileSync(join(root, "src/components/ArchiveSortMenu.tsx"), "utf8");
  assert.match(shell, /aria-label="Открыть меню"/);
  assert.match(shell, /sheetStatusHost/);
  assert.match(shell, /overflow-x-hidden/);
  assert.match(list, /ArchiveSortMenu/);
  assert.match(list, /archive-mobile-date/);
  assert.match(list, /variant="icons"/);
  assert.match(list, /variant="sheet"/);
  assert.equal(list.includes("FilterControl"), false);
  assert.match(filters, /variant === "icons"/);
  assert.match(sort, /Новые сначала/);
  assert.match(sort, /Escape/);
  assert.match(css, /archive-polaroid-grid-mobile[\s\S]*repeat\(3/);
  assert.match(css, /\.archive-workspace-toolbar[\s\S]*backdrop-filter:\s*blur/);
  assert.match(css, /\.archive-polaroid-title[\s\S]*font-family:\s*var\(--font-display\)/);
  assert.match(css, /\.archive-toolbar-title[\s\S]*font-family:\s*var\(--font-sans\)/);
  assert.match(
    list,
    /function changeDensity\(next: ArchiveDensity\) \{\s*setDensity\(next\);\s*writeArchiveDensity\(next\);\s*\}/,
  );
});
