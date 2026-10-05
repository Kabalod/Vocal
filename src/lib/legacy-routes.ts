export function legacyHistoryHref(): "/reels" {
  return "/reels";
}

export function legacySettingsHref(): "/reels" {
  return "/reels";
}

export function jobDeepLinkHref(reelId: string | null | undefined): string {
  return reelId ? `/reels/${reelId}?tab=takes` : "/reels";
}

export function legacyUserRedirect(pathname: string): string | null {
  if (pathname === "/history" || pathname.startsWith("/history/")) return legacyHistoryHref();
  if (pathname === "/settings" || pathname.startsWith("/settings/")) return legacySettingsHref();
  return null;
}

export function isLegacyRedirectLoop(from: string, to: string): boolean {
  return from === to || (from.startsWith("/reels") && to.startsWith("/history"));
}
