"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatClock, formatDate } from "@/lib/format";
import type { JobStatus, Recommendation } from "@/types/analysis";

interface HistoryItem {
  id: string;
  originalName: string;
  durationSec: number | null;
  status: JobStatus;
  createdAt: string;
  overallScore: number | null;
  summary: string | null;
  topRecommendations: Recommendation[];
}

const FILTERS: Array<{ id: "all" | JobStatus; label: string }> = [
  { id: "all", label: "Все" },
  { id: "done", label: "Готово" },
  { id: "error", label: "Ошибки" },
  { id: "analyzing", label: "В работе" },
];

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить историю.");
        if (!cancelled) setItems(data.jobs);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "analyzing") {
      return items.filter((j) =>
        ["queued", "converting", "transcribing", "analyzing"].includes(j.status),
      );
    }
    return items.filter((j) => j.status === filter);
  }, [items, filter]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl">История</h1>
        <p className="mt-2 text-muted">Короткий итог по каждому ролику.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              filter === f.id ? "bg-accent text-on-accent" : "bg-bg-elev text-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error ? <p className="text-bad">{error}</p> : null}
      {visible.length === 0 ? (
        <p className="text-muted">Пока пусто. Загрузите первое видео на главной.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((job) => (
            <li key={job.id}>
              <Link
                href={`/jobs/${job.id}`}
                className="block rounded-2xl border border-line bg-bg-elev p-4 hover:border-accent/40"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{job.originalName}</p>
                  <p className="text-sm text-muted">{formatDate(job.createdAt)}</p>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {formatClock(job.durationSec)} · {statusLabel(job.status)}
                  {job.overallScore != null ? ` · ${job.overallScore.toFixed(1)}/10` : ""}
                </p>
                {job.topRecommendations[0] ? (
                  <p className="mt-2 text-sm text-text/85">
                    {job.topRecommendations.map((r) => r.title).join(" · ")}
                  </p>
                ) : job.summary ? (
                  <p className="mt-2 line-clamp-2 text-sm text-text/85">{job.summary}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function statusLabel(status: JobStatus): string {
  switch (status) {
    case "done":
      return "готово";
    case "error":
      return "ошибка";
    case "converting":
      return "конвертация";
    case "transcribing":
      return "распознавание";
    case "analyzing":
      return "анализ";
    default:
      return "в очереди";
  }
}
