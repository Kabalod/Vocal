"use client";

import {
  timelineIndex,
  timelineNeighbor,
  timelineTickGapClass,
  timelineTickStates,
  timelineValueText,
  timelineVersions,
} from "@/components/script-timeline";

function tickClass(tick: { viewing: boolean; head: boolean; final: boolean }, dense: boolean): string {
  const height = dense ? "h-1.5" : "h-2";
  if (tick.viewing && tick.final) return `${height} flex-1 min-w-0 rounded-full bg-accent ring-1 ring-good`;
  if (tick.viewing) return `${height} flex-1 min-w-0 rounded-full bg-accent`;
  if (tick.final) return `${height} flex-1 min-w-0 rounded-full bg-good`;
  if (tick.head) return `${height} flex-1 min-w-0 rounded-full bg-muted`;
  return `${height} flex-1 min-w-0 rounded-full bg-line`;
}

export function ScriptVersionTimeline({
  versions,
  viewingId,
  headId,
  finalScriptId,
  onView,
}: {
  versions: { id: string; createdAt: string }[];
  viewingId: string | null;
  headId: string | null;
  finalScriptId: string | null;
  onView: (id: string) => void;
}) {
  const list = timelineVersions(versions);
  const index = timelineIndex(versions, viewingId);
  const prevId = timelineNeighbor(versions, viewingId, -1);
  const nextId = timelineNeighbor(versions, viewingId, 1);
  const current = list[index] ?? null;
  const max = Math.max(list.length - 1, 0);
  const ticks = timelineTickStates(versions, viewingId, headId, finalScriptId);
  const dense = list.length > 20;
  const valueText = timelineValueText({
    index,
    total: list.length,
    isHead: Boolean(current && current.id === headId),
    isFinal: Boolean(current && current.id === finalScriptId),
  });

  if (list.length === 0) {
    return <p className="text-sm text-muted">Версий пока нет. Сохраните первую вручную.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="vocal-btn text-sm"
          disabled={!prevId}
          onClick={() => prevId && onView(prevId)}
        >
          Назад
        </button>
        <button
          type="button"
          className="vocal-btn text-sm"
          disabled={!nextId}
          onClick={() => nextId && onView(nextId)}
        >
          Вперёд
        </button>
        <p className="text-sm text-muted">
          {index + 1} из {list.length}
          {current && current.id === headId ? " · активная" : ""}
          {current && current.id === finalScriptId ? " · финал" : ""}
        </p>
      </div>
      <label className="block space-y-2">
        <span className="sr-only">Лента версий</span>
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={index}
          disabled={list.length < 2}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={index}
          aria-valuetext={valueText}
          onChange={(event) => {
            const next = list[Number(event.target.value)];
            if (next) onView(next.id);
          }}
          className="w-full accent-[var(--vocal-accent)]"
        />
      </label>
      <div
        className={`flex min-w-0 overflow-hidden ${timelineTickGapClass(list.length)}`}
        data-timeline-ticks={list.length}
        aria-hidden="true"
      >
        {ticks.map((tick) => (
          <span key={tick.id} data-timeline-tick={tick.id} className={tickClass(tick, dense)} />
        ))}
      </div>
    </div>
  );
}
