"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NewThoughtSheet } from "@/components/NewThoughtSheet";
import { ReelCard } from "@/components/ReelCard";
import { RECORDING_FILTERS, isRecordingFilterId } from "@/components/reel-filters";
import { ShellError, ShellLoading } from "@/components/shell-status";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { EmptyState } from "@/components/vocal-ui/EmptyState";
import { Field } from "@/components/vocal-ui/Field";
import { FilterControl } from "@/components/vocal-ui/FilterControl";
import { GenerationGuard } from "@/lib/generation-guard";
import {
  ARCHIVE_LIST_SORTS,
  archiveListHref,
  archiveListUrlEquals,
  buildArchiveListApiQuery,
  defaultArchiveListUrlState,
  hasArchiveDateFilter,
  mergeReelListPages,
  parseArchiveListUrl,
  resolveArchiveEmptyKind,
  type ArchiveListUrlState,
} from "@/lib/thought-archive-state";
import { resetThoughtListQuery } from "@/lib/thought-preview";
import { type ReelListItemDto, type ReelListResult } from "@/types/reel";

function NewThoughtButton({
  className = "",
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <ActionButton variant="primary" className={className} onClick={onClick}>
      Новая мысль
    </ActionButton>
  );
}

export function ReelList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const urlState = useMemo(() => parseArchiveListUrl(new URLSearchParams(urlKey)), [urlKey]);

  const [draftQ, setDraftQ] = useState(urlState.q);
  const [reels, setReels] = useState<ReelListItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const loadGen = useRef(new GenerationGuard());
  const listEpoch = useRef(0);
  const firstAbort = useRef<AbortController | null>(null);
  const moreInflight = useRef(false);
  const nextCursorRef = useRef<string | null>(null);
  const urlStateRef = useRef(urlState);
  const draftQRef = useRef(draftQ);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  nextCursorRef.current = nextCursor;
  urlStateRef.current = urlState;
  draftQRef.current = draftQ;

  useEffect(() => {
    setDraftQ(urlState.q);
  }, [urlState.q]);

  const replaceUrl = useCallback(
    (next: ArchiveListUrlState) => {
      const href = archiveListHref(next);
      if (href === archiveListHref(urlStateRef.current)) return;
      router.replace(href, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = draftQ.trim();
      if (nextQ === urlStateRef.current.q) return;
      replaceUrl({ ...urlStateRef.current, q: nextQ });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draftQ, replaceUrl]);

  const applyFilters = useCallback(
    (patch: Partial<ArchiveListUrlState>) => {
      const next: ArchiveListUrlState = {
        ...urlStateRef.current,
        q: draftQRef.current.trim(),
        ...patch,
      };
      if (patch.q !== undefined) next.q = patch.q.trim();
      replaceUrl(next);
    },
    [replaceUrl],
  );

  const applyPage = useCallback((data: ReelListResult, append: boolean) => {
    setNextCursor(data.nextCursor);
    setHasMore(data.hasMore);
    setTotalCount(data.totalCount);
    setMatchCount(data.matchCount);
    setReels((prev) => mergeReelListPages(prev, data.reels, append));
  }, []);

  const loadFirst = useCallback(async () => {
    firstAbort.current?.abort();
    const ac = new AbortController();
    firstAbort.current = ac;
    const req = loadGen.current.begin();
    const epoch = ++listEpoch.current;
    moreInflight.current = false;
    setLoading(true);
    setLoadingMore(false);
    setListError(null);
    setMoreError(null);
    setReels([]);
    setNextCursor(null);
    setHasMore(false);
    setMatchCount(0);

    const queryString = buildArchiveListApiQuery(urlState);
    try {
      const res = await fetch(`/api/reels?${queryString}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      const data = (await res.json()) as ReelListResult & { error?: string };
      if (!req.isCurrent() || epoch !== listEpoch.current) return;
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить мысли.");
      applyPage(data, false);
    } catch (err) {
      if (ac.signal.aborted) return;
      if (!req.isCurrent() || epoch !== listEpoch.current) return;
      setListError(err instanceof Error ? err.message : "Ошибка.");
      setReels([]);
      setNextCursor(null);
      setHasMore(false);
      setMatchCount(0);
    } finally {
      if (req.isCurrent() && epoch === listEpoch.current) setLoading(false);
    }
  }, [applyPage, urlState]);

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!cursor || moreInflight.current || loading || listError) return;
    const epoch = listEpoch.current;
    const stateSnapshot = urlStateRef.current;
    moreInflight.current = true;
    setLoadingMore(true);
    setMoreError(null);
    const queryString = buildArchiveListApiQuery(stateSnapshot, { cursor });
    try {
      const res = await fetch(`/api/reels?${queryString}`, { cache: "no-store" });
      const data = (await res.json()) as ReelListResult & { error?: string };
      if (epoch !== listEpoch.current) return;
      if (!archiveListUrlEquals(stateSnapshot, urlStateRef.current)) return;
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить ещё.");
      applyPage(data, true);
    } catch (err) {
      if (epoch !== listEpoch.current) return;
      if (!archiveListUrlEquals(stateSnapshot, urlStateRef.current)) return;
      setMoreError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      if (epoch === listEpoch.current) {
        moreInflight.current = false;
        setLoadingMore(false);
      }
    }
  }, [applyPage, listError, loading]);

  useEffect(() => {
    void loadFirst();
    return () => {
      firstAbort.current?.abort();
    };
  }, [loadFirst]);

  useEffect(() => {
    if (!hasMore || loading || listError || moreError || loadingMore) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root: null, rootMargin: "240px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, listError, loadMore, loading, loadingMore, moreError, nextCursor, reels.length]);

  const emptyKind = resolveArchiveEmptyKind({
    loading,
    error: listError,
    reelCount: reels.length,
    totalCount,
    state: urlState,
  });

  function resetSearchAndFilters() {
    const next = resetThoughtListQuery();
    setDraftQ(next.q);
    replaceUrl({ ...defaultArchiveListUrlState(), ...next });
  }

  function clearDateFilter() {
    applyFilters({ from: null, to: null, dateField: null });
  }

  const resetAction = (
    <ActionButton variant="secondary" onClick={resetSearchAndFilters}>
      Сбросить поиск и фильтры
    </ActionButton>
  );

  const endReached = !loading && !listError && !hasMore && reels.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-display)] text-4xl">Мысли</h1>
        </div>
        <NewThoughtButton onClick={() => setCreateOpen(true)} />
      </div>

      <div className="grid gap-6 shell:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)] shell:items-start">
        <aside className="flex flex-col gap-3" aria-label="Поиск и фильтры">
          <div className="relative">
            <Field
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              placeholder="Найти мысль"
              aria-label="Найти мысль"
              className="pr-12"
            />
            {draftQ ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 min-h-11 -translate-y-1/2 px-2 text-sm text-muted hover:text-text"
                aria-label="Очистить поиск"
                onClick={() => {
                  setDraftQ("");
                  applyFilters({ q: "" });
                }}
              >
                Очистить
              </button>
            ) : null}
          </div>
          <FilterControl
            items={RECORDING_FILTERS}
            value={urlState.status}
            aria-label="Фильтры мыслей"
            className="grid grid-cols-2 gap-2 shell:flex shell:flex-wrap"
            onChange={(id) => {
              if (isRecordingFilterId(id)) applyFilters({ status: id });
            }}
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Сортировка">
            {ARCHIVE_LIST_SORTS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyFilters({ sort: item.id })}
                aria-pressed={urlState.sort === item.id}
                className={`min-h-11 rounded-full px-3 text-sm ${
                  urlState.sort === item.id
                    ? "border border-accent bg-bg text-text"
                    : "border border-line bg-surface text-muted hover:text-text"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {hasArchiveDateFilter(urlState) ? (
            <button
              type="button"
              className="min-h-11 self-start text-sm text-muted underline-offset-2 hover:text-text hover:underline"
              onClick={clearDateFilter}
            >
              Сбросить дату
            </button>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-4">
          {!listError && !loading && reels.length > 0 ? (
            <p className="text-sm text-muted">
              Всего мыслей: {totalCount}. Найдено: {matchCount}.
            </p>
          ) : null}

          {listError ? <ShellError message={listError} onRetry={() => void loadFirst()} /> : null}
          {loading ? <ShellLoading label="Загрузка мыслей…" /> : null}

          {!loading && emptyKind === "none" ? (
            <EmptyState
              title="Пока нет мыслей"
              description="Создайте первую мысль — профиль для этого не нужен."
              action={<NewThoughtButton onClick={() => setCreateOpen(true)} />}
            />
          ) : null}
          {!loading && emptyKind === "search" ? (
            <EmptyState
              title="Ничего не найдено"
              description="Попробуйте другое название или сбросьте поиск и фильтры."
              action={resetAction}
            />
          ) : null}
          {!loading && emptyKind === "filter" ? (
            <EmptyState
              title="Нет мыслей в этом статусе"
              description="Смените фильтр или откройте список «Все»."
              action={resetAction}
            />
          ) : null}
          {!loading && emptyKind === "date" ? (
            <EmptyState
              title="Нет мыслей в выбранных датах"
              description="Сбросьте дату или выберите другой день или месяц."
              action={
                <ActionButton variant="secondary" onClick={clearDateFilter}>
                  Сбросить дату
                </ActionButton>
              }
            />
          ) : null}

          {!loading && !listError && reels.length > 0 ? (
            <div className="space-y-4">
              <ul className="grid grid-cols-1 gap-4">
                {reels.map((reel) => (
                  <li key={reel.id} className="min-w-0">
                    <ReelCard reel={reel} />
                  </li>
                ))}
              </ul>

              {loadingMore ? (
                <p className="text-sm text-muted" role="status" aria-live="polite">
                  Загрузка ещё…
                </p>
              ) : null}

              {moreError ? (
                <div className="space-y-2" role="alert">
                  <p className="text-sm text-bad">{moreError}</p>
                  <ActionButton variant="secondary" onClick={() => void loadMore()}>
                    Повторить загрузку
                  </ActionButton>
                </div>
              ) : null}

              {hasMore && !moreError ? (
                <>
                  <div ref={sentinelRef} aria-hidden="true" className="h-1 w-full" />
                  <ActionButton
                    variant="secondary"
                    loading={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    Загрузить ещё
                  </ActionButton>
                </>
              ) : null}

              {endReached ? (
                <p className="text-sm text-muted" role="status">
                  Конец списка
                </p>
              ) : null}
            </div>
          ) : null}
          <NewThoughtSheet open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
      </div>
    </div>
  );
}
