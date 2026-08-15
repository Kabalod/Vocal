"use client";

import type { ReactNode } from "react";
import { findFillerRanges } from "@/lib/metrics";
import { formatClock } from "@/lib/format";
import type { Recommendation, TranscriptSegment } from "@/types/analysis";

function highlight(text: string) {
  const ranges = findFillerRanges(text).sort((a, b) => a.start - b.start);
  if (ranges.length === 0) return text;

  const merged: typeof ranges = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  merged.forEach((r, i) => {
    if (r.start > cursor) {
      nodes.push(text.slice(cursor, r.start));
    }
    nodes.push(
      <mark key={`${r.start}-${i}`} className="rounded bg-bad/20 px-0.5 text-bad">
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function TranscriptView({
  segments,
  recommendations,
}: {
  segments: TranscriptSegment[];
  recommendations: Recommendation[];
}) {
  const recStarts = new Set(
    recommendations
      .map((r) => (r.startSec != null ? Math.round(r.startSec) : null))
      .filter((n): n is number => n != null),
  );

  return (
    <section className="space-y-3">
      <h2 className="font-[family-name:var(--font-display)] text-2xl">Расшифровка</h2>
      <div className="space-y-2 rounded-3xl border border-line bg-bg-elev p-4">
        {segments.map((seg, i) => {
          const key = Math.round(seg.start);
          const linked = recStarts.has(key);
          return (
            <button
              key={`${seg.start}-${i}`}
              type="button"
              className={`block w-full rounded-xl px-3 py-2 text-left hover:bg-accent-dim ${
                linked ? "ring-1 ring-accent/40" : ""
              }`}
              onClick={() => {
                const el = document.getElementById(`rec-${key}`);
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              <span className="mr-3 font-mono text-xs text-accent">
                {formatClock(seg.start)}
              </span>
              <span className="text-sm leading-relaxed">{highlight(seg.text)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
