"use client";

import { createContext, useContext, type ReactNode, type RefCallback } from "react";
import { createPortal } from "react-dom";

export type ArchiveDesktopHosts = {
  dateHost: HTMLElement | null;
  statusHost: HTMLElement | null;
};

const ArchiveDesktopHostContext = createContext<ArchiveDesktopHosts>({
  dateHost: null,
  statusHost: null,
});

export function ArchiveDesktopHostProvider({
  value,
  children,
}: {
  value: ArchiveDesktopHosts;
  children: ReactNode;
}) {
  return <ArchiveDesktopHostContext.Provider value={value}>{children}</ArchiveDesktopHostContext.Provider>;
}

export function ArchiveDesktopSlot({
  slot,
  children,
}: {
  slot: "date" | "statuses";
  children: ReactNode;
}) {
  const { dateHost, statusHost } = useContext(ArchiveDesktopHostContext);
  const host = slot === "date" ? dateHost : statusHost;
  if (!host) return null;
  return createPortal(children, host);
}

export function bindHost(setter: (node: HTMLElement | null) => void): RefCallback<HTMLElement> {
  return (node) => setter(node);
}
