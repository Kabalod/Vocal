"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReelCard } from "@/components/ReelCard";
import { MORE_RECORDING_FILTERS, RECORDING_FILTERS, type RecordingFilterId } from "@/components/reel-filters";
import { ShellEmpty, ShellError, ShellLoading } from "@/components/shell-status";
import { GenerationGuard } from "@/lib/generation-guard";
import type { ReelDto } from "@/types/reel";

const SORTS: Array<{ id: "updated" | "created" | "title"; label: string }> = [
  { id: "updated", label: "По обновлению" },
  { id: "created", label: "По созданию" },
  { id: "title", label: "По названию" },
];

function FilterChip({
  id,
  label,
  selected,
  onSelect,
}: {
  id: RecordingFilterId;
  label: string;
  selected: boolean;
  onSelect: (id: RecordingFilterId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      className={`rounded-full px-3 py-1.5 text-sm ${
        selected ? "bg-accent text-[#1a140c]" : "bg-bg-elev text-muted hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}

export function ReelList() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<RecordingFilterId>("open");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("updated");
  const [reels, setReels] = useState<ReelDto[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    params.set("status", status);
    params.set("sort", sort);
    return params.toString();
  }, [debouncedQ, status, sort]);

  const loadGen = useRef(new GenerationGuard());

  const load = useCallback(async () => {
    const req = loadGen.current.begin();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reels?${queryString}`, { cache: "no-store" });
      const data = await res.json();
      if (!req.isCurrent()) return;
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить карточки.");
      setReels(data.reels);
      setTruncated(Boolean(data.truncated));
    } catch (err) {
      if (!req.isCurrent()) return;
      setError(err instanceof Error ? err.message : "Ошибка.");
      setReels([]);
    } finally {
      if (req.isCurrent()) setLoading(false);
    }
  }, [queryString]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/reels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, initialNote: note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось создать карточку.");
      setTitle("");
      setNote("");
      await loadRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onCreate} className="vocal-card space-y-3 p-4">
        <p className="text-sm text-muted">Новая запись — без видео и без ключа Groq. ИИ не вызывается.</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название"
          className="vocal-input"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Заметка (необязательно)"
          rows={3}
          className="vocal-input"
        />
        <button type="submit" disabled={creating || !title.trim()} className="vocal-btn vocal-btn-primary">
          {creating ? "Создаём…" : "Создать запись"}
        </button>
      </form>

      <div className="flex flex-col gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию и заметке"
          className="vocal-input"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтры записей">
          {RECORDING_FILTERS.map((item) => (
            <FilterChip
              key={item.id}
              id={item.id}
              label={item.label}
              selected={status === item.id}
              onSelect={setStatus}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Дополнительные статусы">
          {MORE_RECORDING_FILTERS.map((item) => (
            <FilterChip
              key={item.id}
              id={item.id}
              label={item.label}
              selected={status === item.id}
              onSelect={setStatus}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Сортировка">
          {SORTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSort(item.id)}
              aria-pressed={sort === item.id}
              className={`rounded-full px-3 py-1.5 text-sm ${
                sort === item.id ? "bg-accent text-[#1a140c]" : "bg-bg-elev text-muted hover:text-text"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <ShellError message={error} onRetry={() => void load()} /> : null}
      {loading ? <ShellLoading label="Загрузка записей…" /> : null}
      {!loading && reels.length === 0 && !error ? (
        <ShellEmpty title="Пока нет записей" description="Создайте первую карточку выше. Поиск и фильтры не вызывают ИИ." />
      ) : null}
      {!loading && reels.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reels.map((reel) => (
            <li key={reel.id}>
              <ReelCard reel={reel} />
            </li>
          ))}
        </ul>
      ) : null}
      {truncated ? (
        <p className="text-sm text-muted">Показаны первые карточки. Уточните поиск или фильтр.</p>
      ) : null}
    </div>
  );
}
