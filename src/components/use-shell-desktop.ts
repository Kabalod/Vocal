"use client";

import { useEffect, useState } from "react";
import { SHELL_DESKTOP_MEDIA } from "@/components/shell-layout";

/** False until measured, so desktop-only widgets (calendar facets) do not mount on phones. */
export function useShellDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(SHELL_DESKTOP_MEDIA);
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return desktop;
}
