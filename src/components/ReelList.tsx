"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReelCard } from "@/components/ReelCard";
import { GenerationGuard } from "@/lib/generation-guard";
import { REEL_STATUS_LABELS, type ReelDto, type ReelStatus } from "@/types/reel";

const FILTERS: Array<{ id: "open" | "all" | ReelStatus; label: string }> = [
  { id: "open", label: "Открытые" },
  { id: "all", label: "Все" },
  { id: "idea", label: REEL_STATUS_LABELS.idea },
  { id: "in_progress", label: REEL_STATUS_LABELS.in_progress },
  { id: "ready_to_record", label: REEL_STATUS_LABELS.ready_to_record },
  { id: "completed", label: REEL_STATUS_LABELS.completed },
  { id: "archived", label: REEL_STATUS_LABELS.archived },
];

const SORTS: Array<{ id: "updated" | "created" | "title"; label: string }> = [
  { id: "updated", label: "По обновлению" },
  { id: "created", label: "По созданию" },
  { id: "title", label: "По названию" },
];

export function ReelList() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<(typeof FILTERS)[number]["id"]>("open");
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onCreate} className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
        <p className="text-sm text-muted">Новая идея — без видео и без ключа Groq.</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название"
          className="w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none focus:border-accent/50"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Заметка (необязательно)"
          rows={3}
          className="w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none focus:border-accent/50"
        />
        <button
          type="submit"
          disabled={creating || !title.trim()}
          className="rounded-full bg-accent px-4 py-2 text-sm text-[#1a140c] disabled:opacity-50"
        >
          {creating ? "Создаём…" : "Создать карточку"}
        </button>
      </form>

      <div className="flex flex-col gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию и заметке"
          className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 outline-none focus:border-accent/50"
        />
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatus(item.id)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                status === item.id ? "bg-accent text-[#1a140c]" : "bg-bg-elev text-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {SORTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSort(item.id)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                sort === item.id ? "bg-accent text-[#1a140c]" : "bg-bg-elev text-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-bad">{error}</p> : null}
      {loading ? <p className="text-muted">Загрузка…</p> : null}
      {!loading && reels.length === 0 ? (
        <p className="text-muted">Пока пусто. Создайте первую идею выше.</p>
      ) : (
        <ul className="space-y-3">
          {reels.map((reel) => (
            <li key={reel.id}>
              <ReelCard reel={reel} />
            </li>
          ))}
        </ul>
      )}
      {truncated ? (
        <p className="text-sm text-muted">Показаны первые карточки. Уточните поиск или фильтр.</p>
      ) : null}
    </div>
  );
}
