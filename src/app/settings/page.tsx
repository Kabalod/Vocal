"use client";

import { useEffect, useMemo, useState } from "react";
import type { CriterionDto } from "@/types/analysis";

export default function SettingsPage() {
  const [criteria, setCriteria] = useState<CriterionDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/criteria", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить критерии.");
    setCriteria(data.criteria);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, []);

  function patch(id: string, next: Partial<CriterionDto>) {
    setCriteria((list) => list.map((c) => (c.id === id ? { ...c, ...next } : c)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/criteria", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: criteria.map((c) => ({
            id: c.id,
            enabled: c.enabled,
            weight: c.weight,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не сохранилось.");
      setCriteria(data.criteria);
      setMessage("Сохранено. Новые загрузки возьмут эти веса.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/criteria", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось сбросить.");
      setCriteria(data.criteria);
      setMessage("Вернули значения по умолчанию Instagram-методики.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setSaving(false);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; weight: number; order: number; items: CriterionDto[] }>();
    for (const item of criteria) {
      const current = map.get(item.categoryId) ?? {
        label: item.categoryLabel,
        weight: item.categoryWeight,
        order: item.categoryOrder,
        items: [],
      };
      current.items.push(item);
      map.set(item.categoryId, current);
    }
    return [...map.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id, value]) => ({ id, ...value }));
  }, [criteria]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl">Критерии</h1>
          <p className="mt-2 max-w-xl text-muted">
            Методика разговорного блога. Выключение убирает критерий из промпта и из
            среднего. Вес влияет только внутри категории. Итог считает backend.
            Помощник всё равно даст текстовые советы на следующий дубль — исходник не режется.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void reset()}
            disabled={saving}
            className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:text-text"
          >
            Сбросить
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-[#1a140c] disabled:opacity-60"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {message ? <p className="text-sm text-good">{message}</p> : null}

      {groups.map((group) => (
        <CriterionGroup
          key={group.id}
          title={`${group.label} · вес категории ${group.weight}`}
          items={group.items}
          onPatch={patch}
        />
      ))}
    </div>
  );
}

function CriterionGroup({
  title,
  items,
  onPatch,
}: {
  title: string;
  items: CriterionDto[];
  onPatch: (id: string, next: Partial<CriterionDto>) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm uppercase tracking-[0.18em] text-muted">{title}</h2>
      <ul className="space-y-2">
        {items.map((c) => (
          <li
            key={c.id}
            className="flex flex-col gap-3 rounded-2xl border border-line bg-bg-elev p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={c.enabled}
                onChange={(e) => onPatch(c.id, { enabled: e.target.checked })}
                className="mt-1 accent-[#e2a356]"
              />
              <span>
                <span className="block font-medium">{c.label}</span>
                <span className="text-sm text-muted">{c.description}</span>
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm text-muted sm:min-w-56">
              Вес {c.weight}
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={c.weight}
                onChange={(e) => onPatch(c.id, { weight: Number(e.target.value) })}
                className="w-32 accent-[#e2a356]"
              />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
