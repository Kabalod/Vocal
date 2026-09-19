"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArchivePolaroidCard } from "@/components/ArchivePolaroidCard";
import { archiveDeskSlot, scaleArchiveDeskLayout } from "@/lib/archive-desk-layout";
import type { ReelListItemDto } from "@/types/reel";

export function ArchiveDeskSpread({
  reels,
  spreadIndex,
  onOpenPreview,
  onLeaveToStudio,
}: {
  reels: ReelListItemDto[];
  spreadIndex: number;
  onOpenPreview: (id: string) => void;
  onLeaveToStudio: (id: string) => void;
}) {
  const hostRef = useRef<HTMLUListElement>(null);
  const [screen, setScreen] = useState({ w: 0, h: 0, fieldH: 0, toolbarH: 0 });

  useLayoutEffect(() => {
    const work = document.querySelector<HTMLElement>("[data-archive-work]");
    const toolbar = document.querySelector<HTMLElement>(".archive-workspace-toolbar");
    const host = hostRef.current;
    if (!work || !host) return;

    const update = () => {
      const toolbarH = toolbar?.offsetHeight ?? 0;
      host.parentElement?.style.setProperty("--archive-toolbar-h", `${toolbarH}px`);
      work.style.setProperty("--archive-desk-size", `${work.clientWidth}px ${work.clientHeight}px`);
      setScreen({
        w: host.clientWidth,
        h: work.clientHeight,
        fieldH: Math.max(work.clientHeight - toolbarH, 1),
        toolbarH,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(work);
    observer.observe(host);
    if (toolbar) observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  const placed = scaleArchiveDeskLayout(screen.w, screen.fieldH);

  return (
    <ul
      ref={hostRef}
      className="archive-desk-spread list-none p-0"
      data-archive-spread={spreadIndex + 1}
      style={{ height: screen.h || "100vh" }}
    >
      {reels.map((reel, indexInSpread) => {
        const slot = archiveDeskSlot(indexInSpread);
        const box = placed.find((item) => item.slot === slot);
        if (!box) return null;
        return (
          <li
            key={reel.id}
            data-slot={slot}
            className="archive-desk-slot"
            style={{
              left: box.left,
              top: screen.toolbarH + box.top,
              width: box.width,
              height: box.height,
              transform: `rotate(${box.angle}deg)`,
            }}
          >
            <ArchivePolaroidCard
              reel={reel}
              variant="desktop"
              onOpenPreview={() => onOpenPreview(reel.id)}
              onLeaveToStudio={() => onLeaveToStudio(reel.id)}
            />
          </li>
        );
      })}
    </ul>
  );
}
