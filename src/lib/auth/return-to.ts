const FALLBACK = "/reels";

export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) {
    return FALLBACK;
  }
  return raw;
}

export function authHref(path: "/login" | "/signup", next?: string): string {
  const target = safeReturnTo(next);
  if (target === FALLBACK && path === "/login") return path;
  return `${path}?next=${encodeURIComponent(target)}`;
}
