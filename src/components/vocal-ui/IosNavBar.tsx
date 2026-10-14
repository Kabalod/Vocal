"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";

/** Whether the large title has scrolled away: the compact title of the bar becomes visible past the threshold. */
export function isNavTitleVisible(scrollTop: number, threshold = 24): boolean {
  return scrollTop > threshold;
}

/**
 * iOS navigation bar: 44 px content under the top safe area, "‹ Назад" on the left, the title appears when the page scrolls.
 * `scrollContainer`: the scrolling element (the window when omitted). `titleVisible` forces the state (for the catalog and tests).
 */
export function IosNavBar({
  title,
  backLabel = "Назад",
  onBack,
  trailing,
  scrollContainer,
  threshold = 24,
  titleVisible,
}: {
  title: string;
  backLabel?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  scrollContainer?: RefObject<HTMLElement | null>;
  threshold?: number;
  titleVisible?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (titleVisible !== undefined) return;
    const target: HTMLElement | Window = scrollContainer?.current ?? window;
    const read = () => setScrolled(isNavTitleVisible(target instanceof Window ? target.scrollY : target.scrollTop, threshold));
    read();
    target.addEventListener("scroll", read, { passive: true });
    return () => target.removeEventListener("scroll", read);
  }, [scrollContainer, threshold, titleVisible]);
  const visible = titleVisible ?? scrolled;
  return (
    <header
      data-title-visible={visible}
      className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur"
    >
      <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center px-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="relative inline-flex h-11 items-center gap-0.5 justify-self-start px-2 text-base text-accent-soft"
          >
            <span aria-hidden="true" className="text-2xl leading-none">
              ‹
            </span>
            {backLabel}
          </button>
        ) : (
          <span />
        )}
        <p
          className={`max-w-[60vw] truncate text-center text-[15px] font-semibold transition-opacity duration-150 ${visible ? "opacity-100" : "opacity-0"}`}
          aria-hidden={visible ? undefined : true}
        >
          {title}
        </p>
        <div className="justify-self-end">{trailing}</div>
      </div>
    </header>
  );
}
