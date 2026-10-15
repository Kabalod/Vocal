"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { DeleteThoughtConfirm } from "@/components/DeleteActions";
import { STUDIO_TABS, type StudioMobileTab } from "@/components/reel-studio";
import { ActionSheet } from "@/components/vocal-ui/ActionSheet";
import { IconButton } from "@/components/vocal-ui/IconButton";
import { IosNavBar } from "@/components/vocal-ui/IosNavBar";
import { SegmentedTabs } from "@/components/vocal-ui/SegmentedTabs";
import { StatusBadge } from "@/components/vocal-ui/StatusBadge";
import { thoughtUserStatus } from "@/lib/thought-preview";
import type { ReelStatus } from "@/types/reel";

/**
 * Thought screen on touch widths (P4, iOS): a navigation bar with "‹ Мысли" whose title appears when the large title scrolls away,
 * the large title and status, full-width segmented tabs, then the tab. The dialogue tab is a fixed-height column (the composer is
 * docked at the bottom, above the keyboard through `--kb`); the other tabs scroll with the page.
 */
export function ReelStudioFrame({
  reelId,
  title,
  status,
  tab,
  onTab,
  takes,
  script,
  dialog,
  hideTabs = false,
}: {
  reelId: string;
  title: string;
  status: ReelStatus;
  tab: StudioMobileTab;
  onTab: (id: StudioMobileTab) => void;
  takes: ReactNode;
  script: ReactNode;
  dialog: ReactNode;
  hideTabs?: boolean;
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [largeTitleGone, setLargeTitleGone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fixed = tab === "dialog" && !hideTabs;

  useEffect(() => {
    const node = titleRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setLargeTitleGone(!entry.isIntersecting), { rootMargin: "-48px 0px 0px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fixed, hideTabs]);

  return (
    <div
      data-thought-touch
      data-thought-fixed={fixed || undefined}
      className={`-mx-4 -mt-6 -mb-24 flex flex-col ${fixed ? "h-[calc(100dvh-var(--bottom-chrome))] overflow-hidden" : "min-h-[calc(100dvh-var(--bottom-chrome))]"}`}
    >
      <IosNavBar
        title={title}
        backLabel="Мысли"
        onBack={() => router.push("/reels")}
        titleVisible={fixed || hideTabs ? true : largeTitleGone}
        trailing={
          <IconButton label="Действия с мыслью" onClick={() => setMenuOpen(true)}>
            <MoreHorizontal aria-hidden="true" />
          </IconButton>
        }
      />

      {fixed || hideTabs ? null : (
        <div className="space-y-2 px-4 pb-3 pt-2">
          <h1 ref={titleRef} className="min-w-0 break-words font-[family-name:var(--font-display)] text-[28px] leading-tight">
            {title}
          </h1>
          <StatusBadge status={thoughtUserStatus(status)} />
        </div>
      )}

      {hideTabs ? null : (
        <div className="min-w-0 overflow-x-hidden px-4 pb-2" data-thought-tabs>
          <SegmentedTabs
            items={STUDIO_TABS}
            value={tab}
            onChange={(id) => onTab(id as StudioMobileTab)}
            aria-label="Разделы мысли"
          />
        </div>
      )}

      <div className={`min-w-0 ${fixed ? "min-h-0 flex-1" : "flex-1 px-4 pb-[calc(var(--tabbar-h)+1rem)] pt-4"}`}>
        {tab === "takes" ? (
          <section aria-label="Дубли">{takes}</section>
        ) : tab === "dialog" ? (
          <section aria-label="Диалог с Vocal" className="h-full">
            {dialog}
          </section>
        ) : (
          <section aria-label="Сценарий">{script}</section>
        )}
      </div>

      <ActionSheet
        open={menuOpen}
        title={title}
        actions={[{ id: "delete", label: "Удалить мысль", destructive: true }]}
        onClose={() => setMenuOpen(false)}
        onSelect={() => {
          setMenuOpen(false);
          setConfirmOpen(true);
        }}
      />
      <DeleteThoughtConfirm reelId={reelId} title={title} open={confirmOpen} onClose={() => setConfirmOpen(false)} />
    </div>
  );
}
