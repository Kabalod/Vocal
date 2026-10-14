"use client";

import Link from "next/link";
import { ChevronLeft, Copy, FileText, MessageCircle, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { DeleteThoughtConfirm } from "@/components/DeleteActions";
import { STUDIO_TABS, type StudioMobileTab } from "@/components/reel-studio";
import { formatThoughtStamp } from "@/components/thought-desktop";
import { ActionSheet } from "@/components/vocal-ui/ActionSheet";
import { IconButton } from "@/components/vocal-ui/IconButton";
import { IconStatusDone, IconStatusOpen, IconStatusProgress } from "@/components/vocal-ui/icons";
import { VOCAL_USER_STATUSES, type VocalUserStatusId } from "@/components/vocal-ui/kit";
import { SegmentedTabs } from "@/components/vocal-ui/SegmentedTabs";
import { thoughtUserStatus } from "@/lib/thought-preview";
import type { ReelStatus } from "@/types/reel";

const TAB_ICONS: Record<StudioMobileTab, React.ReactNode> = {
  takes: <Copy className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />,
  dialog: <MessageCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />,
  script: <FileText className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />,
};

const TAB_HINTS: Record<StudioMobileTab, string> = {
  takes: "Дубли",
  dialog: "Диалог",
  script: "Сценарий",
};

const STATUS_ICON: Record<VocalUserStatusId, () => React.ReactNode> = {
  open: () => <IconStatusOpen />,
  in_progress: () => <IconStatusProgress />,
  completed: () => <IconStatusDone />,
};

/**
 * Desktop toolbar of the thought (≥ shell breakpoint): 52 px, blur and a hairline, "‹ Все мысли" on the left, the three icon tabs
 * in the centre, "…" on the right. The menu holds the actions that no longer sit next to the status or in the dialogue.
 */
export function ThoughtDesktopToolbar({
  reelId,
  title,
  tab,
  onTab,
  hideTabs = false,
  thoughtCompleted = false,
  onRecord,
}: {
  reelId: string;
  title: string;
  tab: StudioMobileTab;
  onTab: (id: StudioMobileTab) => void;
  hideTabs?: boolean;
  thoughtCompleted?: boolean;
  onRecord: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const items = STUDIO_TABS.map((item) => ({
    id: item.id,
    label: item.label,
    hint: TAB_HINTS[item.id],
    icon: TAB_ICONS[item.id],
  }));
  return (
    <>
      <div
        data-thought-toolbar
        className="sticky top-0 z-20 grid h-[52px] grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-[rgba(19,19,21,0.72)] px-8 backdrop-blur-xl"
      >
        <Link
          href="/reels"
          className="inline-flex h-[52px] items-center gap-1 justify-self-start text-[13px] text-muted hover:text-text"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          Все мысли
        </Link>
        <div>
          {hideTabs ? null : (
            <SegmentedTabs variant="icon" items={items} value={tab} onChange={(id) => onTab(id as StudioMobileTab)} aria-label="Разделы мысли" />
          )}
        </div>
        <div className="justify-self-end">
          <IconButton label="Меню мысли" onClick={() => setMenuOpen(true)} aria-haspopup="dialog">
            <MoreHorizontal className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <ActionSheet
        open={menuOpen}
        title="Мысль"
        actions={[
          { id: "record", label: "Записать дубль", disabled: thoughtCompleted },
          { id: "delete", label: "Удалить мысль", destructive: true },
        ]}
        onSelect={(id) => {
          if (id === "record") onRecord();
          if (id === "delete") setConfirmOpen(true);
        }}
        onClose={() => setMenuOpen(false)}
      />
      <DeleteThoughtConfirm reelId={reelId} title={title} open={confirmOpen} onClose={() => setConfirmOpen(false)} />
    </>
  );
}

/** Date (small), the title in Literata 500 and the status as a token: not a control, the status changes by events only. */
export function ThoughtDesktopTitle({
  title,
  status,
  createdAt,
}: {
  title: string;
  status: ReelStatus;
  createdAt?: string | null;
}) {
  const id = thoughtUserStatus(status);
  const label = VOCAL_USER_STATUSES.find((item) => item.id === id)?.label ?? id;
  const stamp = formatThoughtStamp(createdAt);
  return (
    <header className="mb-6 mt-8 flex items-end gap-3">
      <div className="min-w-0">
        {stamp ? <p className="mb-1.5 text-xs text-muted">{stamp}</p> : null}
        <h1 className="min-w-0 break-words font-[family-name:var(--font-display)] text-[30px] font-medium leading-[1.2] tracking-[-0.01em]">
          {title}
        </h1>
      </div>
      <span
        data-thought-status={id}
        className="mb-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line px-2 py-[3px] text-[11px] text-text-soft"
      >
        {STATUS_ICON[id]()}
        {label}
      </span>
    </header>
  );
}
