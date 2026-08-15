"use client";

import { useEffect, useState } from "react";
import { PipelineProgress } from "@/components/PipelineProgress";
import { RecommendationList } from "@/components/RecommendationList";
import { ScoreCard } from "@/components/ScoreCard";
import { ExerciseCard, StrengthsList, VideoBriefCard } from "@/components/AnalysisExtras";
import { TranscriptView } from "@/components/TranscriptView";
import { formatClock } from "@/lib/format";
import type { JobWithAnalysis } from "@/types/analysis";

export function JobView({ id }: { id: string }) {
  const [job, setJob] = useState<JobWithAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [pollKey, setPollKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить задачу.");
        if (cancelled) return;
        setJob(data.job);
        setError(null);
        if (data.job.status !== "done" && data.job.status !== "error") {
          timer = setTimeout(tick, 1500);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Ошибка сети.");
        timer = setTimeout(tick, 2500);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, pollKey]);

  async function retry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/jobs/${id}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось перезапустить.");
      setJob((prev) =>
        prev ? { ...prev, ...data.job, analysis: null, status: "queued" } : prev,
      );
      setError(null);
      setPollKey((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка повтора.");
    } finally {
      setRetrying(false);
    }
  }

  if (!job && error) {
    return <p className="text-bad">{error}</p>;
  }
  if (!job) {
    return <p className="text-muted">Открываем разбор…</p>;
  }

  const analysis = job.analysis;
  const pending = job.status !== "done" && job.status !== "error";

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-muted">{job.originalName}</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-4xl">
          {job.status === "done" ? "Разбор видео" : "Обработка"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Длительность {formatClock(job.durationSec)} · тренер разговорных Instagram-видео.
          Жесты, взгляд, громкость и вирусность не оцениваются.
        </p>
      </div>

      {pending || job.status === "error" ? (
        <PipelineProgress status={job.status} errorMessage={job.errorMessage} />
      ) : null}

      {job.status === "error" ? (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-[#1a140c] disabled:opacity-60"
        >
          {retrying ? "Запускаем…" : "Повторить"}
        </button>
      ) : null}

      {error && job ? <p className="text-sm text-bad">{error}</p> : null}

      {analysis ? (
        <>
          <p className="max-w-3xl text-lg leading-relaxed text-text/90">{analysis.summary}</p>
          <VideoBriefCard video={analysis.video} />
          <ScoreCard
            overall={analysis.overallScore}
            categories={analysis.categoryScores ?? []}
            evaluations={analysis.evaluations ?? []}
          />
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Длительность", formatClock(analysis.metrics.durationSec)],
              ["Слов", String(analysis.metrics.wordCount)],
              ["Паразиты / 100 слов", String(analysis.metrics.fillerPer100Words)],
              ["Темп (факт)", `${analysis.metrics.wordsPerMinute} сл/мин`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-line bg-bg-elev p-4">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-1 font-medium">{value}</p>
              </div>
            ))}
          </section>
          <p className="text-xs text-muted">
            Темп и паузы — служебные факты по таймкодам, в оценку Instagram-методики не входят.
          </p>
          <StrengthsList items={analysis.strengths ?? []} />
          <RecommendationList items={analysis.recommendations} />
          <ExerciseCard exercise={analysis.exercise ?? null} />
          <TranscriptView
            segments={analysis.transcript.segments}
            recommendations={analysis.recommendations}
          />
        </>
      ) : null}
    </div>
  );
}
