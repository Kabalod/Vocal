import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

test("P01.6-0 ships 8-12 local WebP assets and keeps SVG only offline", () => {
  assert.ok(ARCHIVE_CARD_ASSET_COUNT >= 8 && ARCHIVE_CARD_ASSET_COUNT <= 12);
  assert.equal(ARCHIVE_CARD_ASSETS.length, ARCHIVE_CARD_ASSET_COUNT);

  for (const asset of ARCHIVE_CARD_ASSETS) {
    assert.match(asset.src, /^\/archive\/cards\/\d\d\.webp$/);
    assert.equal(asset.src.startsWith("https://"), false);
    assert.ok(existsSync(publicPath(asset.src)), asset.src);
    assert.ok(statSync(publicPath(asset.src)).size > 4_000, `${asset.src} too small`);
    assert.ok(existsSync(join(root, "scripts", "p01-6-0-assets", "cards", `${asset.id}.svg`)));
  }

  assert.match(ARCHIVE_DESK_BG.src, /^\/archive\/desk\/desk\.webp$/);
  assert.ok(existsSync(publicPath(ARCHIVE_DESK_BG.src)));
  assert.ok(existsSync(join(root, "scripts", "p01-6-0-assets", "desk", "desk.svg")));
  assert.ok(statSync(publicPath(ARCHIVE_DESK_BG.src)).size > 8_000);

  const publicArchive = join(root, "public", "archive");
  const publicFiles = readdirSync(publicArchive, { recursive: true }).map(String);
  assert.equal(publicFiles.some((file) => file.endsWith(".svg")), false);
});

test("P01.6-0 applies WebP to cards and the desktop work area only", () => {
  const helper = readFileSync(join(root, "src/lib/archive-visual-assets.ts"), "utf8");
  const card = readFileSync(join(root, "src/components/ArchivePolaroidCard.tsx"), "utf8");
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  const pkg = readFileSync(join(root, "package.json"), "utf8");

  assert.match(helper, /2166136261/);
  assert.match(card, /archiveCardBackgroundImage\(reel\.id\)/);
  assert.match(card, /--archive-card-image/);
  assert.match(list, /className="archive-desk-surface min-w-0 space-y-4"/);
  assert.match(css, /url\("\/archive\/desk\/desk\.webp"\)/);
  assert.equal(css.includes(".svg"), false);
  assert.equal(helper.includes(".svg"), false);
  assert.equal(pkg.includes("generate-p01-6-0"), false);
  assert.equal(pkg.includes("python"), false);
  assert.equal(helper.includes("http://"), false);
});
