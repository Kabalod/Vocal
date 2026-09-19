"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  SHELL_DESKTOP_MEDIA,
  readStoredShellCollapsed,
  subscribeShellCollapsed,
  writeStoredShellCollapsed,
} from "@/components/shell-layout";
import { getSheetFocusableElements, trapSheetTab } from "@/components/shell-sheet";
import { ArchiveDesktopHostProvider } from "@/components/ArchiveDesktopChrome";
import { isShellNavActive, SHELL_NAV, shellBack, shellHeaderTitle } from "@/components/shell-nav";

function IconRecordings() {
  return (
    <svg aria-hidden className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg aria-hidden className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="3" />
      <path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" />
    </svg>
  );
}

const ICONS = {
  "/reels": IconRecordings,
  "/profile": IconProfile,
} as const;

const RECORDINGS_NAV = SHELL_NAV.find((item) => item.href === "/reels")!;
const PROFILE_NAV = SHELL_NAV.find((item) => item.href === "/profile")!;

function NavItem({
  href,
  label,
  collapsed,
  onNavigate,
}: {
  href: "/reels" | "/profile";
  label: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "";
  const Icon = ICONS[href];
  const active = isShellNavActive(pathname, href);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-11 min-w-11 items-center gap-3 rounded-[var(--vocal-radius-control)] px-3 text-sm ${
        active ? "bg-bg text-text" : "text-muted hover:bg-field hover:text-text"
      } ${collapsed ? "justify-center px-2" : ""}`}
    >
      {active ? (
        <span aria-hidden className="absolute left-1 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
      ) : null}
      <Icon />
      {collapsed ? <span className="sr-only">{label}</span> : label}
    </Link>
  );
}

export function VocalAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const archiveDesktop = pathname === "/reels";
  const [dateHost, setDateHost] = useState<HTMLElement | null>(null);
  const [statusHost, setStatusHost] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sheetPanelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const back = shellBack(pathname);
  const title = shellHeaderTitle(pathname);

  function closeSheet() {
    setSheetOpen(false);
  }

  useLayoutEffect(() => {
    setCollapsed(readStoredShellCollapsed());
  }, []);

  useEffect(() => {
    return subscribeShellCollapsed(() => setCollapsed(readStoredShellCollapsed()));
  }, []);

  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia(SHELL_DESKTOP_MEDIA);
    const onChange = () => {
      if (media.matches) setSheetOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    const panel = sheetPanelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panel ? getSheetFocusableElements(panel)[0] : null;
    (first ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSheet();
        return;
      }
      if (panel) trapSheetTab(event, panel, document.activeElement);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus();
    };
  }, [sheetOpen]);

  return (
    <ArchiveDesktopHostProvider value={{ dateHost, statusHost }}>
    <div className="flex min-h-screen max-w-full overflow-x-hidden bg-bg text-text">
      <aside
        data-shell-collapsed={collapsed ? "true" : "false"}
        className={`hidden border-r border-line bg-surface shell:sticky shell:top-0 shell:flex shell:h-screen shell:shrink-0 shell:flex-col shell:overflow-y-auto ${
          collapsed ? "w-16" : archiveDesktop ? "w-60" : "w-[200px]"
        }`}
      >
        <div className={`flex min-h-11 items-center gap-2 px-3 py-5 ${collapsed ? "justify-center" : ""}`}>
          <Link href="/reels" className="inline-flex min-h-11 items-center font-[family-name:var(--font-display)] text-xl tracking-tight">
            {collapsed ? "V" : "Vocal"}
          </Link>
        </div>
        <div ref={setDateHost} className="empty:hidden px-2 pb-3" />
        <nav className="px-2" aria-label="Разделы">
          <NavItem href={RECORDINGS_NAV.href} label={RECORDINGS_NAV.label} collapsed={collapsed} />
        </nav>
        <div ref={setStatusHost} className="empty:hidden px-2 pt-4" />
        <div className="mt-auto space-y-2 p-2">
          <nav aria-label="Профиль">
            <NavItem href={PROFILE_NAV.href} label={PROFILE_NAV.label} collapsed={collapsed} />
          </nav>
          <button
            type="button"
            className="vocal-btn w-full text-muted"
            onClick={() => {
              const next = !collapsed;
              writeStoredShellCollapsed(next);
              setCollapsed(next);
            }}
            aria-pressed={collapsed}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          >
            {collapsed ? "»" : "Свернуть"}
          </button>
        </div>
      </aside>

      <div className={`flex min-w-0 flex-1 flex-col ${archiveDesktop ? "shell:h-screen shell:overflow-y-auto" : ""}`}>
        <header className={`flex min-h-11 items-center gap-3 border-b border-line px-4 py-3 shell:px-6 ${archiveDesktop ? "shell:hidden" : ""}`}>
          <button
            ref={menuButtonRef}
            type="button"
            className="vocal-btn min-h-11 shell:!hidden"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            aria-controls="vocal-mobile-sheet"
          >
            Меню
          </button>
          {back ? (
            <Link
              href={back.href}
              aria-label={`Назад: ${back.label}`}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center text-sm text-muted hover:text-text"
            >
              ← {back.label}
            </Link>
          ) : null}
          <p className="min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-lg">{title}</p>
        </header>

        <main
          className={`mx-auto min-w-0 w-full flex-1 px-4 py-6 pb-24 shell:px-6 shell:pb-16 ${
            pathname === "/reels" ? "max-w-none" : pathname.startsWith("/reels/") ? "max-w-6xl" : "max-w-5xl"
          }`}
        >
          {children}
        </main>
        <nav
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 border-t border-line bg-surface shell:!hidden"
          aria-label="Главные разделы"
        >
          <Link
            href={RECORDINGS_NAV.href}
            aria-current={isShellNavActive(pathname, RECORDINGS_NAV.href) ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 px-2 text-xs ${
              isShellNavActive(pathname, RECORDINGS_NAV.href) ? "text-text" : "text-muted"
            }`}
          >
            <IconRecordings />
            {RECORDINGS_NAV.label}
          </Link>
          <Link
            href={PROFILE_NAV.href}
            aria-current={isShellNavActive(pathname, PROFILE_NAV.href) ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 px-2 text-xs ${
              isShellNavActive(pathname, PROFILE_NAV.href) ? "text-text" : "text-muted"
            }`}
          >
            <IconProfile />
            {PROFILE_NAV.label}
          </Link>
        </nav>
      </div>

      {sheetOpen ? (
        <div className="fixed inset-0 z-50 shell:!hidden">
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={closeSheet} />
          <div
            ref={sheetPanelRef}
            id="vocal-mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="relative flex h-full w-[min(18rem,calc(100vw-1.5rem))] max-w-full flex-col rounded-r-[var(--vocal-radius-modal)] bg-surface"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              <p id={titleId} className="font-[family-name:var(--font-display)] text-xl">
                Vocal
              </p>
              <button type="button" className="vocal-btn shrink-0" onClick={closeSheet}>
                Закрыть
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-2" aria-label="Разделы">
              <NavItem
                href={RECORDINGS_NAV.href}
                label={RECORDINGS_NAV.label}
                collapsed={false}
                onNavigate={closeSheet}
              />
              <NavItem
                href={PROFILE_NAV.href}
                label={PROFILE_NAV.label}
                collapsed={false}
                onNavigate={closeSheet}
              />
            </nav>
            <p className="px-4 py-3 text-sm text-muted">Дубли, сценарий и вопросы — внутри записи.</p>
          </div>
        </div>
      ) : null}
    </div>
    </ArchiveDesktopHostProvider>
  );
}
