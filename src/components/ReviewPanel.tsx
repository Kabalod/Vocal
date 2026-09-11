"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReviewDto } from "@/types/review";

export function ReviewPanel({ takeId }: { takeId: string }) {
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/takes/${takeId}/review`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить разбор.");
    setReviews(data.reviews as ReviewDto[]);
  }, [takeId]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, [load]);

  async function runReview() {
    setRunning(true);
    setError(null);
    try {
      const previous = reviews.find((row) => row.status === "done");
      const res = await fetch(`/api/takes/${takeId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previousReviewId: previous?.id ?? null }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 422) throw new Error(data.error ?? "Не удалось запустить разбор.");
      await load();
      if (data.review?.status === "error") {
        setError(data.review.errorMessage ?? "Модель не вернула корректный разбор.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setRunning(false);
    }
  }

  const latest = reviews[0] ?? null;

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Разбор дубля</h3>
        <button
          type="button"
          onClick={() => void runReview()}
          disabled={running}
          className="rounded-full bg-accent px-4 py-2 text-sm text-on-accent disabled:opacity-50"
        >
          {running ? "Разбираем…" : "Разобрать выбранный текст"}
        </button>
      </div>
      <p className="text-sm text-muted">
        Вызов модели явный. Баллы не нужны. Мысль автора и предложение модели разделены. Цитата, которой нет в тексте,
        помечается; повтор из‑за этого сам не запускается. Новый разбор не переписывает старый.
      </p>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {!latest ? <p className="text-sm text-muted">Разборов ещё нет.</p> : null}
      {latest?.status === "error" ? (
        <p className="text-sm text-bad">{latest.errorMessage ?? "Разбор не сохранился как успешный."}</p>
      ) : null}
      {latest?.result ? (
        <div className="space-y-3 text-sm">
          <p>
            <span className="text-muted">Мысль автора (из текста): </span>
            {latest.result.authorThought || "недостаточно материала"}
          </p>
          <p>
            <span className="text-muted">Предложение модели: </span>
            {latest.result.modelSuggestion || "нет"}
          </p>
          {latest.result.insufficientMaterial ? <p className="text-muted">Недостаточно материала.</p> : null}
          <div>
            <p className="text-muted">Цитаты</p>
            {latest.result.quotes.length === 0 ? (
              <p>Нет.</p>
            ) : (
              <ul className="list-disc pl-5">
                {latest.result.quotes.map((quote, index) => (
                  <li key={`${quote.text}-${index}`}>
                    «{quote.text}» {quote.found ? "" : "— не найдена в тексте"} {quote.note ? `(${quote.note})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p>
            <span className="text-muted">Сохранить: </span>
            {latest.result.keep.join("; ") || "—"}
          </p>
          <p>
            <span className="text-muted">Не хватает: </span>
            {latest.result.missing.join("; ") || "—"}
          </p>
        </div>
      ) : null}
      {reviews.length > 1 ? (
        <p className="text-xs text-muted">Всего сохранено разборов: {reviews.length}. Старые не меняются.</p>
      ) : null}
    </section>
  );
}
