"use client";

import type { ReactNode } from "react";
import { SegmentedTabs } from "@/components/vocal-ui/SegmentedTabs";
import { STUDIO_TABS, type StudioMobileTab } from "@/components/reel-studio";

export function ReelStudioFrame({
  header,
  tab,
  onTab,
  takes,
  script,
  dialog,
  hideTabs = false,
}: {
  header: ReactNode;
  tab: StudioMobileTab;
  onTab: (id: StudioMobileTab) => void;
  takes: ReactNode;
  script: ReactNode;
  dialog: ReactNode;
  hideTabs?: boolean;
}) {
  return (
    <div className="space-y-6">
      {header}

      {hideTabs ? null : (
        <div className="min-w-0 overflow-x-auto">
          <SegmentedTabs
            items={STUDIO_TABS}
            value={tab}
            onChange={(id) => onTab(id as StudioMobileTab)}
            aria-label="Разделы мысли"
          />
        </div>
      )}

      <div className="min-w-0">
        <section hidden={tab !== "takes"} aria-label="Дубли">
          {takes}
        </section>
        <section hidden={tab !== "dialog"} aria-label="Диалог с Vocal">
          {dialog}
        </section>
        <section hidden={tab !== "script"} aria-label="Сценарий">
          {script}
        </section>
      </div>
    </div>
  );
}
