"use client";

import { useEffect } from "react";

/** A keyboard is open when the visual viewport lost more than this much of the layout viewport (address-bar jitter is smaller). */
export const KEYBOARD_OPEN_THRESHOLD = 80;

/** Height taken by the on-screen keyboard: what is missing between the layout viewport and the visual one (below its offset). */
export function keyboardInset(innerHeight: number, viewportHeight: number, viewportOffsetTop: number): number {
  return Math.max(0, Math.round(innerHeight - viewportHeight - viewportOffsetTop));
}

/**
 * Publishes the keyboard height as `--kb` on <html> (and `data-kb-open` when a keyboard is open), so a composer docked to the bottom
 * can sit above it and the tab bar can step aside. No visualViewport (desktop, old browsers): `--kb` stays 0.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const update = () => {
      const inset = viewport ? keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop) : 0;
      root.style.setProperty("--kb", `${inset}px`);
      if (inset > KEYBOARD_OPEN_THRESHOLD) root.setAttribute("data-kb-open", "");
      else root.removeAttribute("data-kb-open");
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      root.style.removeProperty("--kb");
      root.removeAttribute("data-kb-open");
    };
  }, []);
}
