"use client";

import { timelineIndex, timelineNeighbor, timelineVersions } from "@/components/script-timeline";

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
          onChange={(event) => {
            const next = list[Number(event.target.value)];
            if (next) onView(next.id);
          }}
          className="w-full accent-[var(--vocal-accent)]"
        />
      </label>
      {list.length <= 24 ? (
        <div className="flex justify-between gap-1" aria-hidden>
          {list.map((version, i) => (
            <button
              key={version.id}
              type="button"
              title={new Date(version.createdAt).toLocaleString("ru")}
              onClick={() => onView(version.id)}
              className={`h-2 flex-1 rounded-full ${i === index ? "bg-accent" : "bg-line"}`}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">Деления на ленте для каждой версии, число не ограничено.</p>
      )}
    </div>
  );
}
