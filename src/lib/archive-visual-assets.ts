export const ARCHIVE_CARD_ASSET_COUNT = 10;

export const ARCHIVE_CARD_ASSETS = Array.from({ length: ARCHIVE_CARD_ASSET_COUNT }, (_, index) => {
  const id = String(index + 1).padStart(2, "0");
  return {
    id,
    webp: `/archive/cards/${id}.webp`,
    fallback: `/archive/cards/${id}.svg`,
  } as const;
});

export const ARCHIVE_DESK_BG = {
  webp: "/archive/desk/desk.webp",
  fallback: "/archive/desk/desk.svg",
} as const;

export function archiveCardAssetIndex(reelId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < reelId.length; i += 1) {
    hash ^= reelId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % ARCHIVE_CARD_ASSET_COUNT;
}

export function archiveCardAsset(reelId: string) {
  return ARCHIVE_CARD_ASSETS[archiveCardAssetIndex(reelId)]!;
}

export function archiveCardBackgroundImage(reelId: string) {
  const asset = archiveCardAsset(reelId);
  return `url("${asset.webp}"), url("${asset.fallback}")`;
}

export function archiveDeskBackgroundImage() {
  return `url("${ARCHIVE_DESK_BG.webp}"), url("${ARCHIVE_DESK_BG.fallback}")`;
}
