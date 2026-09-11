"use client";

import type { ReactNode } from "react";
import { SegmentedTabs } from "@/components/vocal-ui/SegmentedTabs";
import {
  STUDIO_MATERIAL_TABS,
  STUDIO_MOBILE_TABS,
  type StudioMobileTab,
} from "@/components/reel-studio";

export function ReelStudioFrame({
  header,
  tab,
  onTab,
  takes,
  script,
  dialog,
}: {
  header: ReactNode;
  tab: StudioMobileTab;
  onTab: (id: StudioMobileTab) => void;
  takes: ReactNode;
  script: ReactNode;
  dialog: ReactNode;
}) {
  const material = tab === "takes" ? "takes" : "script";

  return (
    <div className="space-y-6">
      {header}

      <div className="shell:hidden">
        <SegmentedTabs
          items={STUDIO_MOBILE_TABS}
          value={tab}
          onChange={(id) => onTab(id as StudioMobileTab)}
          aria-label="Разделы мысли"
        />
      </div>

      <div className="shell:grid shell:grid-cols-[minmax(0,1.27fr)_minmax(0,1fr)] shell:items-start shell:gap-6">
        <section className={`${tab === "dialog" ? "hidden" : ""} min-w-0 space-y-4 shell:block`} aria-label="Материал">
          <div className="hidden shell:block">
            <SegmentedTabs
              items={STUDIO_MATERIAL_TABS}
              value={material}
              onChange={(id) => onTab(id as StudioMobileTab)}
              aria-label="Дубли или сценарий"
            />
          </div>
          <div hidden={material !== "takes"}>{takes}</div>
          <div hidden={material !== "script"}>{script}</div>
        </section>
        <section className={`${tab !== "dialog" ? "hidden" : ""} min-w-0 shell:block`} aria-label="Диалог с Vocal">
          {dialog}
        </section>
      </div>
    </div>
  );
}
