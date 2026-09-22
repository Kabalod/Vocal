export function isAuthShellPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/auth/")
  );
}

export function isPublicPagePath(pathname: string) {
  return isAuthShellPath(pathname);
}
