"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReviewDto } from "@/types/review";

export function ReviewPanel({ takeId }: { takeId: string }) {
  const [reviews, setReviews] = useState<ReviewDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/takes/${takeId}/review`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить разбор.");
    setReviews(data.reviews as ReviewDto[]);
  }, [takeId]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, [load]);

  const latest = reviews[0] ?? null;

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Сохранённые разборы</h3>
      </div>
      <p className="text-sm text-muted">
        Новые разборы здесь не создаются. Задайте вопрос в основном Диалоге. Старые записи не удаляются.
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
