"use client";

import { useEffect, useRef } from "react";
import { ArchiveCalendar } from "@/components/ArchiveCalendar";
import { VocalModal } from "@/components/vocal-ui/VocalModal";
import type { ArchiveListUrlState } from "@/lib/thought-archive-state";

export function ArchiveCalendarSheet({
  open,
  state,
  onClose,
  onApplyRange,
  onClearDate,
}: {
  open: boolean;
  state: Pick<ArchiveListUrlState, "q" | "status" | "from" | "to" | "dateField">;
  onClose: () => void;
  onApplyRange: (range: { from: string; to: string }) => void;
  onClearDate: () => void;
}) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ vocalArchiveCalendar: true }, "");
    pushedRef.current = true;
    function onPop() {
      pushedRef.current = false;
      onClose();
    }
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushedRef.current && window.history.state?.vocalArchiveCalendar) {
        pushedRef.current = false;
        window.history.back();
      }
    };
  }, [open, onClose]);

  return (
    <VocalModal open={open} title="Календарь" onClose={onClose} placement="sheet">
      {open ? (
        <ArchiveCalendar
          state={state}
          onApplyRange={(range) => {
            onApplyRange(range);
            onClose();
          }}
          onClearDate={() => {
            onClearDate();
            onClose();
          }}
        />
      ) : null}
    </VocalModal>
  );
}
