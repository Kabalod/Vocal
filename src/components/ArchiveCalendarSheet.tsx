"use client";

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
  return (
    <VocalModal open={open} title="Календарь" onClose={onClose} placement="sheet">
      {open ? (
        <ArchiveCalendar
          state={state}
          onApplyRange={onApplyRange}
          onClearDate={onClearDate}
        />
      ) : null}
    </VocalModal>
  );
}
