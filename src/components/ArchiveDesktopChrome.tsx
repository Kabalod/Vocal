"use client";

import { createContext, useContext, type ReactNode, type RefCallback } from "react";
import { createPortal } from "react-dom";

export type ArchiveDesktopHosts = {
  dateHost: HTMLElement | null;
  statusHost: HTMLElement | null;
  sheetStatusHost: HTMLElement | null;
};

const ArchiveDesktopHostContext = createContext<ArchiveDesktopHosts>({
  dateHost: null,
  statusHost: null,
  sheetStatusHost: null,
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
  slot: "date" | "statuses" | "sheet-statuses";
  children: ReactNode;
}) {
  const { dateHost, statusHost, sheetStatusHost } = useContext(ArchiveDesktopHostContext);
  const host = slot === "date" ? dateHost : slot === "statuses" ? statusHost : sheetStatusHost;
  if (!host) return null;
  return createPortal(children, host);
}

export function bindHost(setter: (node: HTMLElement | null) => void): RefCallback<HTMLElement> {
  return (node) => setter(node);
}
