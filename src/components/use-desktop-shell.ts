"use client";

import { useSyncExternalStore } from "react";
import { SHELL_DESKTOP_MEDIA } from "@/components/shell-layout";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(SHELL_DESKTOP_MEDIA);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True from the desktop shell breakpoint (the sidebar layout). The server and the first paint are "not desktop". */
export function useDesktopShell(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(SHELL_DESKTOP_MEDIA).matches,
    () => false,
  );
}
