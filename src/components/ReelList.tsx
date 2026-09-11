"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReelCard } from "@/components/ReelCard";
import { RECORDING_FILTERS, isRecordingFilterId, type RecordingFilterId } from "@/components/reel-filters";
import { ShellError, ShellLoading } from "@/components/shell-status";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { EmptyState } from "@/components/vocal-ui/EmptyState";
import { FilterControl } from "@/components/vocal-ui/FilterControl";
import { StatusBadge } from "@/components/vocal-ui/StatusBadge";
import { GenerationGuard } from "@/lib/generation-guard";
import { formatDate } from "@/lib/format";
import {
  REEL_LIST_PAGE,
  REEL_STATUS_GROUP_LABELS,
  reelStatusGroup,
  type ReelDto,
  type ReelListItemDto,
  type ReelListResult,
} from "@/types/reel";

const SORTS: Array<{ id: "updated" | "created" | "title"; label: string }> = [
  { id: "updated", label: "По обновлению" },
  { id: "created", label: "По созданию" },
  { id: "title", label: "По названию" },
];

function badgeStatus(group: ReturnType<typeof reelStatusGroup>): "open" | "in_progress" | "completed" {
  if (group === "completed") return "completed";
  if (group === "in_progress") return "in_progress";
  return "open";
}

function NewThoughtButton({ className = "", disabled = false }: { className?: string; disabled?: boolean }) {
  return (
    <ActionButton
      variant="primary"
      className={className}
      disabled={disabled}
      title="Способы создания мысли появятся на следующем этапе"
      onClick={() => undefined}
    >
      Новая мысль
    </ActionButton>
  );
}

export function ReelList() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState<RecordingFilterId>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("updated");
  const [reels, setReels] = useState<ReelListItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReelDto | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    params.set("status", status);
    params.set("sort", sort);
    params.set("limit", String(REEL_LIST_PAGE));
    return params.toString();
  }, [debouncedQ, status, sort]);

  const loadGen = useRef(new GenerationGuard());
  const detailGen = useRef(new GenerationGuard());
  const listEpoch = useRef(0);

  const applyPage = useCallback((data: ReelListResult, append: boolean) => {
    setNextCursor(data.nextCursor);
    setHasMore(data.hasMore);
    setTotalCount(data.totalCount);
    setMatchCount(data.matchCount);
    setReels((prev) => {
      const incoming = data.reels;
      if (!append) return incoming;
      const seen = new Set(prev.map((row) => row.id));
      return [...prev, ...incoming.filter((row) => !seen.has(row.id))];
    });
  }, []);

  const load = useCallback(async () => {
    const req = loadGen.current.begin();
    const epoch = ++listEpoch.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reels?${queryString}`, { cache: "no-store" });
      const data = (await res.json()) as ReelListResult & { error?: string };
      if (!req.isCurrent() || epoch !== listEpoch.current) return;
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить мысли.");
      applyPage(data, false);
    } catch (err) {
      if (!req.isCurrent() || epoch !== listEpoch.current) return;
      setError(err instanceof Error ? err.message : "Ошибка.");
      setReels([]);
      setNextCursor(null);
      setHasMore(false);
      setMatchCount(0);
    } finally {
      if (req.isCurrent() && epoch === listEpoch.current) setLoading(false);
    }
  }, [applyPage, queryString]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const epoch = listEpoch.current;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await fetch(`/api/reels?${queryString}&cursor=${encodeURIComponent(nextCursor)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as ReelListResult & { error?: string };
      if (epoch !== listEpoch.current) return;
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить ещё.");
      applyPage(data, true);
    } catch (err) {
      if (epoch !== listEpoch.current) return;
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      if (epoch === listEpoch.current) setLoadingMore(false);
    }
  }, [applyPage, loadingMore, nextCursor, queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    if (!reels.some((row) => row.id === selectedId)) {
      setSelectedId(null);
      return;
    }
    const req = detailGen.current.begin();
    setDetailLoading(true);
    setDetailError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/reels/${selectedId}`, { cache: "no-store" });
        const data = (await res.json()) as { reel?: ReelDto; error?: string };
        if (!req.isCurrent()) return;
        if (!res.ok || !data.reel) throw new Error(data.error ?? "Не удалось открыть превью.");
        setDetail(data.reel);
      } catch (err) {
        if (!req.isCurrent()) return;
        setDetail(null);
        setDetailError(err instanceof Error ? err.message : "Ошибка.");
      } finally {
        if (req.isCurrent()) setDetailLoading(false);
      }
    })();
  }, [reels, selectedId]);

  const hasThoughts = totalCount > 0;
  const emptyKind =
    !loading && !error && reels.length === 0
      ? debouncedQ
        ? "search"
        : status !== "all"
          ? "filter"
          : totalCount === 0
            ? "none"
            : null
      : null;

  const previewGroup = detail ? reelStatusGroup(detail.status) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-display)] text-4xl">Мысли</h1>
          <p className="mt-2 text-muted">Поиск и фильтры не вызывают ИИ.</p>
        </div>
        <div className={hasThoughts ? "" : "invisible"} aria-hidden={!hasThoughts}>
          <NewThoughtButton disabled={!hasThoughts} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти мысль"
            aria-label="Найти мысль"
            className="vocal-input pr-12"
          />
          {q ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 min-h-11 -translate-y-1/2 px-2 text-sm text-muted hover:text-text"
              aria-label="Очистить поиск"
              onClick={() => setQ("")}
            >
              Очистить
            </button>
          ) : null}
        </div>
        <FilterControl
          items={RECORDING_FILTERS}
          value={status}
          aria-label="Фильтры мыслей"
          className="grid grid-cols-2 gap-2 shell:flex shell:flex-wrap"
          onChange={(id) => {
            if (isRecordingFilterId(id)) {
              setStatus(id);
              setLoading(true);
            }
          }}
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Сортировка">
          {SORTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSort(item.id);
                setLoading(true);
              }}
              aria-pressed={sort === item.id}
              className={`min-h-11 rounded-full px-3 text-sm ${
                sort === item.id ? "border border-accent bg-bg text-text" : "border border-line bg-surface text-muted hover:text-text"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {hasThoughts && !error ? (
        <p className="text-sm text-muted">
          Всего мыслей: {totalCount}. Найдено: {matchCount}.
        </p>
      ) : null}

      {error ? <ShellError message={error} onRetry={() => void load()} /> : null}
      {loading ? <ShellLoading label="Загрузка мыслей…" /> : null}

      {!loading && emptyKind === "none" ? (
        <EmptyState
          title="Пока нет мыслей"
          description="Когда появятся мысли, они будут здесь. Поиск и фильтры не вызывают ИИ."
          action={<NewThoughtButton />}
        />
      ) : null}
      {!loading && emptyKind === "search" ? (
        <EmptyState title="Ничего не найдено" description="Попробуйте другое название или сбросьте поиск." />
      ) : null}
      {!loading && emptyKind === "filter" ? (
        <EmptyState title="Нет мыслей в этом статусе" description="Смените фильтр или откройте список «Все»." />
      ) : null}

      {!loading && reels.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 shell:grid-cols-[minmax(0,58%)_minmax(0,42%)] shell:items-start">
          <div className="space-y-4">
            <ul className="grid grid-cols-1 gap-4">
              {reels.map((reel) => (
                <li key={reel.id}>
                  <ReelCard reel={reel} selected={selectedId === reel.id} onSelect={setSelectedId} />
                </li>
              ))}
            </ul>
            {hasMore ? (
              <ActionButton variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>
                Загрузить ещё
              </ActionButton>
            ) : null}
          </div>
          <aside className="hidden shell:block">
            <div className="vocal-card sticky top-4 space-y-4 p-5">
              {!selectedId ? (
                <p className="text-sm text-muted">Выберите мысль, чтобы увидеть превью. Открытие не закрывает список.</p>
              ) : null}
              {selectedId && detailLoading ? <p className="text-sm text-muted">Загрузка превью…</p> : null}
              {selectedId && detailError ? <p className="text-sm text-bad">{detailError}</p> : null}
              {selectedId && detail && previewGroup ? (
                <>
                  <p className="font-[family-name:var(--font-display)] text-2xl leading-snug">{detail.title}</p>
                  <StatusBadge status={badgeStatus(previewGroup)} label={REEL_STATUS_GROUP_LABELS[previewGroup]} />
                  <p className="text-sm text-muted">Обновлено {formatDate(detail.updatedAt)}</p>
                  {detail.initialNote ? (
                    <p className="line-clamp-6 text-sm text-text/85">{detail.initialNote}</p>
                  ) : (
                    <p className="text-sm text-muted">Нет заметки.</p>
                  )}
                  <p className="text-sm text-muted">
                    дублей: {detail.takeCount}
                    {detail.hasScript ? " · есть сценарий" : ""}
                  </p>
                  <Link href={`/reels/${detail.id}`} className="vocal-btn vocal-btn-primary inline-flex min-h-11 items-center">
                    Открыть мысль
                  </Link>
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
