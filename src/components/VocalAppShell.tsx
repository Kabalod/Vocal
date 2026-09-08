"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
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

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname() ?? "";
  return (
    <ul className="space-y-1">
      {SHELL_NAV.map((item) => {
        const Icon = ICONS[item.href];
        const active = isShellNavActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-[16px] px-3 py-2 text-sm ${
                active ? "bg-accent-dim text-text" : "text-muted hover:bg-surface-raised hover:text-text"
              } ${collapsed ? "justify-center px-2" : ""}`}
            >
              <Icon />
              {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function VocalAppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const titleId = useId();
  const back = shellBack(pathname);
  const title = shellHeaderTitle(pathname);

  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSheetOpen(false);
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  return (
    <div className="flex min-h-screen max-w-full overflow-x-hidden bg-bg text-text">
      <aside
        className={`hidden border-r border-line bg-bg-elev md:flex md:flex-col ${collapsed ? "w-[72px]" : "w-56"}`}
      >
        <div className={`flex items-center gap-2 px-3 py-5 ${collapsed ? "justify-center" : ""}`}>
          <Link href="/reels" className="font-[family-name:var(--font-display)] text-xl tracking-tight">
            {collapsed ? "V" : "Vocal"}
          </Link>
        </div>
        <nav className="flex-1 px-2" aria-label="Разделы">
          <NavLinks collapsed={collapsed} />
        </nav>
        <div className="p-2">
          <button
            type="button"
            className="vocal-btn w-full text-muted"
            onClick={() => setCollapsed((value) => !value)}
            aria-pressed={collapsed}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          >
            {collapsed ? "»" : "Свернуть"}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3 md:px-6">
          <button
            type="button"
            className="vocal-btn md:hidden"
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            aria-controls="vocal-mobile-sheet"
          >
            Меню
          </button>
          {back ? (
            <Link href={back.href} className="shrink-0 text-sm text-muted hover:text-text">
              ← {back.label}
            </Link>
          ) : null}
          <p className="min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-lg">{title}</p>
        </header>

        <main
          className={`mx-auto min-w-0 w-full flex-1 px-4 py-6 md:px-8 md:pb-16 ${
            pathname === "/reels" ? "max-w-6xl" : "max-w-5xl"
          }`}
        >
          {children}
        </main>
      </div>

      {sheetOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Закрыть меню"
            onClick={() => setSheetOpen(false)}
          />
          <div
            id="vocal-mobile-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative flex h-full w-[min(18rem,calc(100vw-1.5rem))] max-w-full flex-col bg-bg-elev"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              <p id={titleId} className="font-[family-name:var(--font-display)] text-xl">
                Vocal
              </p>
              <button type="button" className="vocal-btn shrink-0" onClick={() => setSheetOpen(false)}>
                Закрыть
              </button>
            </div>
            <nav className="flex-1 px-2" aria-label="Разделы">
              <NavLinks collapsed={false} onNavigate={() => setSheetOpen(false)} />
            </nav>
            <p className="px-4 py-3 text-sm text-muted">Дубли, сценарий и вопросы — внутри записи.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
