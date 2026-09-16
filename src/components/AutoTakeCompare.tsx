"use client";

import { useCallback, useEffect, useState } from "react";
import { ShellEmpty, ShellError, ShellLoading } from "@/components/shell-status";
import type { CompareDto } from "@/types/compare";

export function AutoTakeCompare({ reelId, reloadToken = 0 }: { reelId: string; reloadToken?: number }) {
  const [items, setItems] = useState<CompareDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/reels/${reelId}/compare`, { cache: "no-store" });
    const data = (await res.json()) as { comparisons?: CompareDto[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить сравнение.");
    setItems(data.comparisons ?? []);
  }, [reelId]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, [load, reloadToken]);

  if (error) return <ShellError message={error} onRetry={() => void load()} />;
  if (!items) return <ShellLoading label="Загрузка сравнения…" />;
  if (items.length === 0) {
    return (
      <ShellEmpty
        title="Сравнение появится само"
        description="Когда у двух дублей будет расшифровка, Vocal сравнит их без выбора пары."
      />
    );
  }

  return (
    <section className="space-y-3" aria-label="Сравнение дублей">
      <h2 className="font-[family-name:var(--font-display)] text-xl">Сравнение</h2>
      <p className="text-sm text-muted">Vocal сравнивает дубли сам. Это не выбор лучшего и не итоговый дубль.</p>
      {items.map((item) => (
        <article key={item.id} className="vocal-card space-y-2 p-4">
          <p className="text-sm text-muted">{item.status === "error" ? "Сравнение не удалось сохранить полностью." : "Автоматическое сравнение"}</p>
          {item.semantic ? (
            <>
              <p className="text-sm">{item.semantic.thoughtPreserved ? "Мысль сохранилась." : "Мысль могла сместиться."}</p>
              {item.semantic.notes ? <p className="text-sm">{item.semantic.notes}</p> : null}
            </>
          ) : (
            <p className="text-sm text-muted">Текстовая разница сохранена. Модель не выбирает победителя.</p>
          )}
        </article>
      ))}
    </section>
  );
}
