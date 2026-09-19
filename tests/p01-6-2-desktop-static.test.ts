import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ARCHIVE_DENSITY_KEY,
  isArchiveDensity,
  readArchiveDensity,
  writeArchiveDensity,
} from "../src/lib/archive-density";
import {
  ARCHIVE_DESK_SPREAD_SIZE,
  archiveDeskSlot,
  chunkArchiveDeskSpreads,
} from "../src/lib/archive-desk-layout";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("P01.6-2 density stays local and defaults to large", (t) => {
  assert.equal(ARCHIVE_DENSITY_KEY, "vocal-archive-density-v1");
  assert.equal(isArchiveDensity("large"), true);
  assert.equal(isArchiveDensity("compact"), true);
  assert.equal(isArchiveDensity("huge"), false);
  const memory = new Map<string, string>();
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
  assert.equal(readArchiveDensity(), "large");
  writeArchiveDensity("compact");
  assert.equal(memory.get(ARCHIVE_DENSITY_KEY), "compact");
  assert.equal(readArchiveDensity(), "compact");
});

test("P01.6-2 large desktop splits thoughts into deterministic six-card desk spreads", () => {
  assert.equal(ARCHIVE_DESK_SPREAD_SIZE, 6);
  assert.deepEqual(chunkArchiveDeskSpreads([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), [
    [1, 2, 3, 4, 5, 6],
    [7, 8, 9, 10, 11, 12],
    [13],
  ]);
  assert.equal(archiveDeskSlot(0), 1);
  assert.equal(archiveDeskSlot(5), 6);
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  assert.match(list, /chunkArchiveDeskSpreads/);
  assert.match(list, /data-slot=\{slot\}/);
  assert.match(list, /archive-desk-spread/);
  assert.equal(list.includes("Math.random"), false);
  assert.equal(css.includes("Math.random"), false);
  assert.match(css, /\.archive-desk-slot-1[\s\S]*--archive-slot-tilt:\s*-2deg/);
  assert.match(css, /\.archive-desk-slot-2[\s\S]*--archive-slot-tilt:\s*1deg/);
  assert.match(css, /\.archive-desk-slot-3[\s\S]*--archive-slot-tilt:\s*2deg/);
  assert.match(css, /\.archive-desk-slot-4[\s\S]*--archive-slot-tilt:\s*-3deg/);
  assert.match(css, /\.archive-desk-slot-5[\s\S]*--archive-slot-tilt:\s*1deg/);
  assert.match(css, /\.archive-desk-slot-6[\s\S]*--archive-slot-tilt:\s*2deg/);
  assert.match(css, /\.archive-polaroid-grid-compact[\s\S]*repeat\(4/);
});

test("P01.6-2 desktop composition moves calendar/status left and toolbar into the work area", () => {
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  const shell = readFileSync(join(root, "src/components/VocalAppShell.tsx"), "utf8");
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  const card = readFileSync(join(root, "src/components/ArchivePolaroidCard.tsx"), "utf8");

  assert.match(list, /ArchiveDesktopSlot slot="date"/);
  assert.match(list, /ArchiveDesktopSlot slot="statuses"/);
  assert.match(list, /archive-workspace-toolbar/);
  assert.match(list, /ArchiveDensityToggle/);
  assert.match(list, /vocal-archive-density-v1|writeArchiveDensity/);
  assert.match(list, /\+ Новая мысль/);
  assert.match(list, /closeCalendar/);
  assert.match(list, /onToggle/);
  assert.equal(list.includes("shell:grid-cols-[minmax(14rem,17rem)"), false);
  assert.match(shell, /shell:sticky/);
  assert.match(shell, /shell:h-screen/);
  assert.match(shell, /shell:overflow-y-auto/);
  assert.match(shell, /setDateHost/);
  assert.match(shell, /setStatusHost/);
  assert.match(css, /\.archive-desk-spread[\s\S]*position:\s*relative/);
  assert.match(css, /\.archive-polaroid-grid-compact[\s\S]*repeat\(4/);
  assert.match(css, /\.archive-polaroid-title[\s\S]*text-align:\s*center/);
  assert.match(css, /\.archive-polaroid-info[\s\S]*min-height:\s*2\.75rem/);
  assert.match(css, /\.archive-polaroid-info-mark[\s\S]*height:\s*1\.875rem/);
  assert.match(css, /\.archive-workspace-toolbar[\s\S]*position:\s*sticky/);
  assert.match(card, /onOpenPreview/);
  assert.match(card, /studioThoughtHref/);
  assert.match(card, /archive-polaroid-status/);
  assert.match(card, /archive-polaroid-info-mark/);
  const filters = readFileSync(join(root, "src/components/ArchiveStatusFilters.tsx"), "utf8");
  assert.match(filters, /h-5 w-5 shrink-0/);
});
