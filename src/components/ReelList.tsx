"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NewThoughtSheet } from "@/components/NewThoughtSheet";
import { ArchiveCalendar } from "@/components/ArchiveCalendar";
import { ArchiveCalendarSheet } from "@/components/ArchiveCalendarSheet";
import { ArchiveMobileRow } from "@/components/ArchiveMobileRow";
import { CalendarDays, Mic, X } from "lucide-react";
import { ArchiveDensityToggle } from "@/components/ArchiveDensityToggle";
import { ArchiveDesktopSlot } from "@/components/ArchiveDesktopChrome";
import { ArchiveListView } from "@/components/ArchiveListView";
import { ArchivePolaroidCard } from "@/components/ArchivePolaroidCard";
import { ArchiveSortMenu } from "@/components/ArchiveSortMenu";
import { ArchiveStatusFilters } from "@/components/ArchiveStatusFilters";
import { ArchiveThoughtPreview } from "@/components/ArchiveThoughtPreview";
import { useShellDesktop } from "@/components/use-shell-desktop";
import { ShellError, ShellLoading } from "@/components/shell-status";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { EmptyState } from "@/components/vocal-ui/EmptyState";
import { Field } from "@/components/vocal-ui/Field";
import { GenerationGuard } from "@/lib/generation-guard";
import { resolveClientTimeZone } from "@/lib/archive-calendar";
import { libraryDateFilter, libraryDateLabel, thoughtsCountLabel } from "@/lib/library-date";
import {
  ARCHIVE_LIST_SORTS,
  applyArchiveCalendarRange,
  archiveListHref,
  archiveListUrlEquals,
  buildArchiveListApiQuery,
  clearArchiveCalendarRange,
  defaultArchiveListUrlState,
  mergeReelListPages,
  openArchiveCalendar,
  openArchivePreview,
  parseArchiveListUrl,
  readArchiveFocus,
  rememberArchiveFocus,
  restoreArchiveFocusOnce,
  clearArchiveFocus,
  resolveArchiveEmptyKind,
  type ArchiveListUrlState,
} from "@/lib/thought-archive-state";
import { ArchiveDeskSpread } from "@/components/ArchiveDeskSpread";
import { chunkArchiveDeskSpreads } from "@/lib/archive-desk-layout";
import {
  DEFAULT_ARCHIVE_DENSITY,
  readArchiveDensity,
  writeArchiveDensity,
  type ArchiveDensity,
} from "@/lib/archive-density";
import { resetThoughtListQuery } from "@/lib/thought-preview";
import { hasArchiveDateFilter } from "@/lib/thought-archive-state";
import { type ReelListItemDto, type ReelListResult } from "@/types/reel";

function NewThoughtButton({
  className = "",
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <ActionButton variant="primary" className={`archive-toolbar-cta ${className}`} onClick={onClick}>
      + Новая мысль
    </ActionButton>
  );
}

export function ReelList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = useShellDesktop();
  const urlKey = searchParams.toString();
  const urlState = useMemo(() => parseArchiveListUrl(new URLSearchParams(urlKey)), [urlKey]);

  const [draftQ, setDraftQ] = useState(urlState.q);
  const [reels, setReels] = useState<ReelListItemDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [density, setDensity] = useState<ArchiveDensity>(DEFAULT_ARCHIVE_DENSITY);
  const calendarOpen = Boolean(urlState.calendarOpen);
  const previewId = urlState.previewId?.trim() || null;
  const [dateLabel, setDateLabel] = useState("");
  const [matchCount, setMatchCount] = useState(0);

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

  useEffect(() => {
    setDensity(readArchiveDensity());
  }, []);

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

  const { q: listQ, status: listStatus, sort: listSort, from: listFrom, to: listTo, dateField: listDateField } =
    urlState;
  const listQueryString = useMemo(
    () =>
      buildArchiveListApiQuery({
        q: listQ,
        status: listStatus,
        sort: listSort,
        from: listFrom,
        to: listTo,
        dateField: listDateField,
      }),
    [listQ, listStatus, listSort, listFrom, listTo, listDateField],
  );

  const pushUrl = useCallback(
    (next: ArchiveListUrlState) => {
      const href = archiveListHref(next);
      if (href === archiveListHref(urlStateRef.current)) return;
      router.push(href, { scroll: false });
    },
    [router],
  );

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
    setMatchCount(data.matchCount ?? data.totalCount);
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
    setTotalCount(0);

    const queryString = listQueryString;
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
      setTotalCount(0);
    } finally {
      if (req.isCurrent() && epoch === listEpoch.current) setLoading(false);
    }
  }, [applyPage, listQueryString]);

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
    replaceUrl(clearArchiveCalendarRange(urlStateRef.current));
  }

  const closeCalendar = useCallback(() => {
    if (!urlStateRef.current.calendarOpen) return;
    router.back();
  }, [router]);

  const closePreview = useCallback(() => {
    if (!urlStateRef.current.previewId) return;
    router.back();
  }, [router]);

  function openPreview(reelId: string) {
    pushUrl(openArchivePreview(urlStateRef.current, reelId));
  }

  useEffect(() => {
    if (loading || listError || reels.length === 0) return;
    const restore = restoreArchiveFocusOnce({
      storedId: readArchiveFocus(),
      presentIds: reels.map((reel) => reel.id),
    });
    if (!restore.scrolledTo) return;
    const node = document.querySelector<HTMLElement>(`[data-archive-reel="${restore.scrolledTo}"]`);
    if (!node) return;
    node.scrollIntoView({ block: "nearest" });
    clearArchiveFocus();
  }, [loading, listError, reels]);

  useEffect(() => {
    const timeZone = resolveClientTimeZone();
    setDateLabel(libraryDateLabel(libraryDateFilter(urlState.from, urlState.to, timeZone), urlState.from, urlState.to, timeZone));
  }, [urlState.from, urlState.to]);

  const resetAction = (
    <ActionButton variant="secondary" onClick={resetSearchAndFilters}>
      Сбросить фильтры
    </ActionButton>
  );

  const endReached = !loading && !listError && !hasMore && reels.length > 0;

  function changeDensity(next: ArchiveDensity) {
    setDensity(next);
    writeArchiveDensity(next);
  }

  const searchField = (
    <div className="relative min-w-0 flex-1">
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
  );

  const sortControl = (
    <div className="archive-toolbar-segment flex gap-0.5" role="group" aria-label="Сортировка">
      {ARCHIVE_LIST_SORTS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => applyFilters({ sort: item.id })}
          aria-pressed={urlState.sort === item.id}
          className={`min-h-11 rounded-[var(--vocal-radius-control)] px-3 text-sm ${
            urlState.sort === item.id ? "bg-bg text-text" : "text-muted hover:text-text"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  const paging = (
    <div className="space-y-4">
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
  );

  const filtersActive = Boolean(urlState.q) || urlState.status !== "all" || hasArchiveDateFilter(urlState);
  const dateChip = dateLabel && hasArchiveDateFilter(urlState) ? (
    <div className="flex flex-wrap items-center gap-3" role="status" data-archive-active-date>
      <span className="archive-date-chip">
        {dateLabel}
        <button type="button" aria-label="Сбросить фильтр по дате" onClick={clearDateFilter}>
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>
      {!loading && !listError ? (
        <span className="text-sm text-muted">
          {matchCount} {thoughtsCountLabel(matchCount)}
        </span>
      ) : null}
    </div>
  ) : null;

  const emptyStates = (
    <>
      {!loading && emptyKind === "none" ? (
        <div className="vocal-card archive-first-run" data-archive-first-run>
          <button
            type="button"
            className="archive-first-run-mic"
            aria-label="Записать первую мысль"
            onClick={() => setCreateOpen(true)}
          >
            <Mic className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <h2 className="font-[family-name:var(--font-display)] text-xl">Запишите первую мысль</h2>
          <p className="text-sm text-muted">Расскажите голосом или напишите текст.</p>
        </div>
      ) : null}
      {!loading && (emptyKind === "search" || emptyKind === "filter" || emptyKind === "date") ? (
        <EmptyState
          title="Ничего не найдено"
          description="Попробуйте другое название или смените фильтры."
          action={resetAction}
        />
      ) : null}
    </>
  );


  return (
    <div className="pb-[env(safe-area-inset-bottom)]">
      {isDesktop ? (
        <>
          <ArchiveDesktopSlot slot="statuses">
            <ArchiveStatusFilters value={urlState.status} onChange={(id) => applyFilters({ status: id })} />
          </ArchiveDesktopSlot>
          <ArchiveDesktopSlot slot="date">
            <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted" id="archive-date-label">
              Дата
            </p>
            <div className="px-1" aria-labelledby="archive-date-label" role="group">
              <ArchiveCalendar
                state={urlState}
                onApplyRange={({ from, to }) => applyFilters({ from, to, dateField: null })}
                onClearDate={clearDateFilter}
              />
            </div>
          </ArchiveDesktopSlot>
        </>
      ) : null}

      {previewId ? (
        <ArchiveThoughtPreview
          open
          reelId={previewId}
          onClose={closePreview}
          onLeaveToStudio={() => rememberArchiveFocus(previewId)}
        />
      ) : null}

      {/* outside the spaced column: a fixed overlay must not inherit the column margins */}
      {!isDesktop && calendarOpen ? (
        <ArchiveCalendarSheet
          open
          state={urlState}
          onClose={closeCalendar}
          onApplyRange={(range) => replaceUrl(applyArchiveCalendarRange(urlStateRef.current, range))}
          onClearDate={clearDateFilter}
        />
      ) : null}
      {!isDesktop ? (
        <div className="space-y-4 px-4 pb-[calc(var(--tabbar-h,3rem)+1.25rem)] pt-[max(0.75rem,env(safe-area-inset-top))]" data-archive-touch>
          <header className="space-y-3" data-archive-mobile-header>
            <div className="flex min-h-11 items-center justify-between gap-3">
              <h1 className="font-[family-name:var(--font-display)] text-[30px] font-medium leading-tight">Мысли</h1>
              <button
                type="button"
                className="archive-mobile-date !w-auto"
                aria-haspopup="dialog"
                aria-expanded={calendarOpen}
                aria-label="Открыть календарь"
                onClick={() => pushUrl(openArchiveCalendar(urlStateRef.current))}
              >
                <CalendarDays className="h-[18px] w-[18px] text-accent-soft" strokeWidth={1.75} aria-hidden="true" />
                <span className="text-sm font-medium">{dateLabel && hasArchiveDateFilter(urlState) ? dateLabel : "Дата"}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              {searchField}
              <ArchiveSortMenu value={urlState.sort} onChange={(id) => applyFilters({ sort: id })} />
            </div>
          </header>
          <ArchiveStatusFilters variant="chips" value={urlState.status} onChange={(id) => applyFilters({ status: id })} />
          {dateChip}
          {listError ? <ShellError message={listError} onRetry={() => void loadFirst()} /> : null}
          {loading ? <ShellLoading label="Загрузка мыслей…" /> : null}
          {emptyStates}
          {!loading && !listError && reels.length > 0 ? (
            <div className="space-y-4">
              {!filtersActive ? (
                <section aria-labelledby="archive-lane-title" className="space-y-1">
                  <h2 id="archive-lane-title" className="archive-section-title">
                    На столе сейчас
                  </h2>
                  <ul className="archive-lane" data-archive-lane>
                    {reels.slice(0, 6).map((reel) => (
                      <li key={reel.id}>
                        <ArchivePolaroidCard
                          reel={reel}
                          variant="mobile"
                          onOpenPreview={() => openPreview(reel.id)}
                          onLeaveToStudio={() => rememberArchiveFocus(reel.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <section aria-labelledby="archive-rows-title">
                <h2 id="archive-rows-title" className="archive-section-title">
                  {filtersActive ? "Найдено" : "Все мысли"}
                </h2>
                <ul className="archive-rows">
                  {reels.map((reel) => (
                    <ArchiveMobileRow
                      key={reel.id}
                      reel={reel}
                      onOpenPreview={() => openPreview(reel.id)}
                      onLeaveToStudio={() => rememberArchiveFocus(reel.id)}
                    />
                  ))}
                </ul>
              </section>
              {paging}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="min-w-0">
          <div className="archive-workspace-toolbar">
            <h1 className="archive-toolbar-title">Мысли</h1>
            <div className="min-w-0 flex-1">{searchField}</div>
            {sortControl}
            <NewThoughtButton onClick={() => setCreateOpen(true)} />
            <ArchiveDensityToggle value={density} onChange={changeDensity} />
          </div>
          <div className="space-y-4">
            {dateChip ? <div className="px-6 pt-4">{dateChip}</div> : null}
            {listError ? <ShellError message={listError} onRetry={() => void loadFirst()} /> : null}
            {loading ? <ShellLoading label="Загрузка мыслей…" /> : null}
            <div className="px-6">{emptyStates}</div>
            {!loading && !listError && reels.length > 0 ? (
              <div className={density === "large" ? "archive-desk-spreads" : "space-y-4"}>
                {density === "list" ? (
                  <ArchiveListView reels={reels} onOpenPreview={openPreview} onLeaveToStudio={rememberArchiveFocus} />
                ) : density === "compact" ? (
                  <ul className="archive-polaroid-grid archive-polaroid-grid-compact list-none p-0 px-6">
                    {reels.map((reel) => (
                      <li key={reel.id} className="min-w-0">
                        <ArchivePolaroidCard
                          reel={reel}
                          variant="desktop"
                          onOpenPreview={() => openPreview(reel.id)}
                          onLeaveToStudio={() => rememberArchiveFocus(reel.id)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  chunkArchiveDeskSpreads(reels).map((spread, spreadIndex) => (
                    <ArchiveDeskSpread
                      key={spread.map((reel) => reel.id).join("-")}
                      reels={spread}
                      spreadIndex={spreadIndex}
                      onOpenPreview={openPreview}
                      onLeaveToStudio={rememberArchiveFocus}
                    />
                  ))
                )}
                <div className="px-6 pb-8">{paging}</div>
              </div>
            ) : null}
          </div>
        </div>
      )}
      <NewThoughtSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
