import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  ARCHIVE_CARD_ASSET_COUNT,
  ARCHIVE_CARD_ASSETS,
  ARCHIVE_DESK_BG,
  archiveCardAsset,
  archiveCardAssetIndex,
} from "../src/lib/archive-visual-assets";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function publicPath(urlPath: string) {
  return join(root, "public", urlPath.replace(/^\//, ""));
}

test("P01.6-0 assigns the same local card asset for the same reel id", () => {
  const first = archiveCardAssetIndex("reel_abc");
  const second = archiveCardAssetIndex("reel_abc");
  assert.equal(first, second);
  assert.equal(archiveCardAsset("reel_abc"), ARCHIVE_CARD_ASSETS[first]);
  assert.notEqual(archiveCardAssetIndex("reel_abc"), archiveCardAssetIndex("reel_xyz"));
});

test("P01.6-0 ships 8-12 local card assets plus a desk background", () => {
  assert.ok(ARCHIVE_CARD_ASSET_COUNT >= 8 && ARCHIVE_CARD_ASSET_COUNT <= 12);
  assert.equal(ARCHIVE_CARD_ASSETS.length, ARCHIVE_CARD_ASSET_COUNT);

  for (const asset of ARCHIVE_CARD_ASSETS) {
    assert.equal(asset.webp.startsWith("https://"), false);
    assert.equal(asset.fallback.startsWith("https://"), false);
    assert.ok(existsSync(publicPath(asset.webp)), asset.webp);
    assert.ok(existsSync(publicPath(asset.fallback)), asset.fallback);
    assert.ok(statSync(publicPath(asset.webp)).size > 4_000, `${asset.webp} too small`);
  }

  assert.ok(existsSync(publicPath(ARCHIVE_DESK_BG.webp)));
  assert.ok(existsSync(publicPath(ARCHIVE_DESK_BG.fallback)));
  assert.ok(statSync(publicPath(ARCHIVE_DESK_BG.webp)).size > 8_000);
});

test("P01.6-0 applies assets to cards and the desktop work area only", () => {
  const helper = readFileSync(join(root, "src/lib/archive-visual-assets.ts"), "utf8");
  const card = readFileSync(join(root, "src/components/ArchivePolaroidCard.tsx"), "utf8");
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");

  assert.match(helper, /FNV|2166136261|reelId/);
  assert.match(card, /archiveCardBackgroundImage\(reel\.id\)/);
  assert.match(card, /--archive-card-image/);
  assert.match(list, /archive-desk-surface/);
  assert.match(list, /className="archive-desk-surface min-w-0 space-y-4"/);
  assert.equal(list.includes("archive-desk-surface") && list.includes("<aside"), true);
  assert.match(css, /--archive-card-image/);
  assert.match(css, /\.archive-desk-surface/);
  assert.match(css, /@media \(min-width: 1200px\)/);
  assert.match(css, /linear-gradient\(180deg, rgba\(11, 7, 20/);
  assert.equal(css.includes("cdn."), false);
  assert.equal(helper.includes("http://"), false);
});
