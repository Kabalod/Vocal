export const SHELL_NAV = [
  { href: "/reels", label: "Записи" },
  { href: "/profile", label: "Профиль" },
] as const;

export function isShellNavActive(pathname: string, href: string): boolean {
  if (href === "/reels") return pathname === "/reels" || pathname.startsWith("/reels/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function shellBack(pathname: string): { href: string; label: string } | null {
  if (pathname.startsWith("/reels/") && pathname !== "/reels") {
    return null;
  }
  if (pathname.startsWith("/jobs/")) {
    return { href: "/history", label: "История" };
  }
  if (pathname === "/" || pathname === "/history" || pathname === "/settings") {
    return { href: "/reels", label: "Записи" };
  }
  return null;
}

export function shellHeaderTitle(pathname: string): string {
  if (pathname.startsWith("/reels/")) return "Запись";
  if (pathname === "/reels") return "Записи";
  if (pathname === "/profile") return "Профиль";
  if (pathname === "/") return "Загрузка";
  if (pathname === "/history") return "История";
  if (pathname === "/settings") return "Критерии";
  if (pathname.startsWith("/jobs/")) return "Задача";
  return "Vocal";
}
