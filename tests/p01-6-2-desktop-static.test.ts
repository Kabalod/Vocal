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
  ARCHIVE_DESK_HEIGHT_FIT,
  ARCHIVE_DESK_REF,
  ARCHIVE_DESK_SLOTS,
  ARCHIVE_DESK_SPREAD_SIZE,
  archiveDeskMinGap,
  archiveDeskSlot,
  chunkArchiveDeskSpreads,
  isArchiveDeskWide,
  scaleArchiveDeskLayout,
} from "../src/lib/archive-desk-layout";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("P01.6-2 density stays local and defaults to large", (t) => {
  assert.equal(ARCHIVE_DENSITY_KEY, "vocal-archive-density-v1");
  assert.equal(isArchiveDensity("large"), true);
  assert.equal(isArchiveDensity("compact"), true);
  assert.equal(isArchiveDensity("list"), true);
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
  assert.equal(ARCHIVE_DESK_REF.width, 1280);
  assert.equal(ARCHIVE_DESK_REF.height, 828);
  assert.equal(ARCHIVE_DESK_SLOTS.length, 6);
  const ref = scaleArchiveDeskLayout(ARCHIVE_DESK_REF.width, ARCHIVE_DESK_REF.height);
  const wide = scaleArchiveDeskLayout(ARCHIVE_DESK_REF.width * 1.25, ARCHIVE_DESK_REF.height * 1.25);
  assert.equal(ref.length, 6);
  assert.ok(Math.abs(wide[0].width / ref[0].width - 1.25) < 0.001);
  assert.equal(wide[2].angle, ARCHIVE_DESK_SLOTS[2].angle);
  assert.equal(ARCHIVE_DESK_SLOTS[0].w / ARCHIVE_DESK_SLOTS[0].h, 0.3156 / 0.5278);
  assert.equal(ARCHIVE_DESK_HEIGHT_FIT, 0.94);
  assert.equal(archiveDeskMinGap(1040), 24);
  assert.equal(archiveDeskMinGap(1200), 32);
  const tight = scaleArchiveDeskLayout(1040, 688);
  const aspect = ARCHIVE_DESK_SLOTS[0].w / ARCHIVE_DESK_SLOTS[0].h;
  const placedAspect = tight[0].width / tight[0].height;
  assert.ok(Math.abs(placedAspect / (aspect * (ARCHIVE_DESK_REF.width / ARCHIVE_DESK_REF.height)) - 1) < 0.001);
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  const spread = readFileSync(join(root, "src/components/ArchiveDeskSpread.tsx"), "utf8");
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  assert.match(spread, /--archive-desk-size/);
  assert.match(list, /chunkArchiveDeskSpreads/);
  assert.match(list, /ArchiveDeskSpread/);
  assert.match(spread, /scaleArchiveDeskLayout/);
  assert.match(spread, /data-slot=\{slot\}/);
  assert.equal(list.includes("Math.random"), false);
  assert.equal(spread.includes("Math.random"), false);
  assert.equal(css.includes("Math.random"), false);
  assert.match(css, /\.archive-workspace-desk[\s\S]*--archive-desk-size/);
  assert.equal(/\n\s*filter:\s*blur/.test(css), false);
  assert.match(css, /\.archive-desk-slot \.archive-polaroid[\s\S]*#d7d8de/);
  assert.match(css, /\.archive-desk-slot \.archive-polaroid[\s\S]*-2px 4px 6px/);
  assert.match(css, /\.archive-desk-spread \.archive-polaroid-frame[\s\S]*inset 0 0 0 1px/);
  assert.match(css, /\.archive-desk-spread \.archive-polaroid:hover[\s\S]*translateY\(-5px\)/);
  assert.match(css, /\.archive-desk-spread \.archive-polaroid-title[\s\S]*max-width:\s*14ch/);
  assert.match(css, /\.archive-polaroid-frame \{[\s\S]*aspect-ratio:\s*3 \/ 4/);
  assert.match(css, /\.archive-polaroid-grid-compact[\s\S]*repeat\(4/);
  assert.equal(isArchiveDeskWide(1040, 688), false);
  assert.equal(isArchiveDeskWide(1200, 800), false);
  assert.equal(isArchiveDeskWide(1680, 970), true);
  const at1280 = scaleArchiveDeskLayout(1040, 688);
  const at1440 = scaleArchiveDeskLayout(1200, 800);
  const at1080p = scaleArchiveDeskLayout(1680, 970);
  const right1280 = at1280[2].left + at1280[2].width;
  const right1080p = at1080p[2].left + at1080p[2].width;
  assert.ok(right1080p > 1680 * 0.88);
  assert.ok(at1080p[0].width > at1280[0].width);
  assert.ok(at1080p[0].width / at1080p[0].height - at1280[0].width / at1280[0].height < 0.001);
  assert.equal(at1440[2].angle, ARCHIVE_DESK_SLOTS[2].angle);
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
  assert.match(shell, /data-archive-work/);
  assert.match(shell, /archive-workspace-desk/);
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
