/**
 * P01.2 — URL-backed archive list state (search / status / date / sort)
 * and helpers for pagination merge / empty kinds. Calendar UI is P01.3.
 */

import { isRecordingFilterId, type RecordingFilterId } from "@/components/reel-filters";
import { normalizeArchiveListSort, type ArchiveListSortId } from "@/lib/reel-archive-query";
import { REEL_LIST_PAGE, type ReelListItemDto } from "@/types/reel";

export const ARCHIVE_LIST_SORTS = [
  { id: "newest", label: "Новые" },
  { id: "oldest", label: "Старые" },
] as const;

export type ArchiveListSort = ArchiveListSortId;

export type ArchiveListUrlState = {
  q: string;
  status: RecordingFilterId;
  sort: ArchiveListSort;
  /** Absolute ISO with Z/offset; both required to apply a date filter. */
  from: string | null;
  to: string | null;
  dateField: "createdAt" | "updatedAt" | null;
  /** Mobile calendar sheet. Stored as `calendar=1`; ignored by list API. */
  calendarOpen?: boolean;
  /** Archive preview sheet. Stored as `preview=<id>`; ignored by list API. */
  previewId?: string | null;
};

export type ArchiveEmptyKind = "none" | "search" | "filter" | "date";

export function defaultArchiveListUrlState(): ArchiveListUrlState {
  return {
    q: "",
    status: "all",
    sort: "newest",
    from: null,
    to: null,
    dateField: null,
    calendarOpen: false,
    previewId: null,
  };
}

export function isArchiveListSort(value: string): value is ArchiveListSort {
  return ARCHIVE_LIST_SORTS.some((item) => item.id === value);
}

export function hasArchiveDateFilter(state: Pick<ArchiveListUrlState, "from" | "to">): boolean {
  return Boolean(state.from?.trim() && state.to?.trim());
}

export function parseArchiveListUrl(params: URLSearchParams): ArchiveListUrlState {
  const defaults = defaultArchiveListUrlState();
  const q = (params.get("q") ?? "").trim();
  const statusRaw = params.get("status") ?? defaults.status;
  const status = isRecordingFilterId(statusRaw) ? statusRaw : defaults.status;
  const sort = normalizeArchiveListSort(params.get("sort"));
  const from = params.get("from")?.trim() || null;
  const to = params.get("to")?.trim() || null;
  const dateFieldRaw = params.get("dateField");
  const dateField =
    dateFieldRaw === "createdAt" || dateFieldRaw === "updatedAt" ? dateFieldRaw : null;
  return {
    q,
    status,
    sort,
    from,
    to,
    dateField,
    calendarOpen: params.get("calendar") === "1",
    previewId: params.get("preview")?.trim() || null,
  };
}

/** Omits defaults so refresh/back URLs stay short. */
export function serializeArchiveListUrl(state: ArchiveListUrlState): URLSearchParams {
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q) params.set("q", q);
  if (state.status !== "all") params.set("status", state.status);
  if (state.sort !== "newest") params.set("sort", state.sort);
  if (state.from?.trim() && state.to?.trim()) {
    params.set("from", state.from.trim());
    params.set("to", state.to.trim());
    if (state.dateField === "updatedAt") params.set("dateField", "updatedAt");
  }
  if (state.calendarOpen) params.set("calendar", "1");
  const previewId = state.previewId?.trim();
  if (previewId) params.set("preview", previewId);
  return params;
}

export function archiveListHref(state: ArchiveListUrlState): string {
  const params = serializeArchiveListUrl(state);
  const qs = params.toString();
  return qs ? `/reels?${qs}` : "/reels";
}

export function buildArchiveListApiQuery(
  state: ArchiveListUrlState,
  opts?: { cursor?: string | null; limit?: number },
): string {
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q) params.set("q", q);
  params.set("status", state.status);
  params.set("sort", state.sort);
  params.set("limit", String(opts?.limit ?? REEL_LIST_PAGE));
  if (state.from?.trim() && state.to?.trim()) {
    params.set("from", state.from.trim());
    params.set("to", state.to.trim());
    if (state.dateField === "createdAt" || state.dateField === "updatedAt") {
      params.set("dateField", state.dateField);
    }
  }
  if (opts?.cursor) params.set("cursor", opts.cursor);
  return params.toString();
}

export function archiveListUrlEquals(a: ArchiveListUrlState, b: ArchiveListUrlState): boolean {
  return (
    a.q.trim() === b.q.trim() &&
    a.status === b.status &&
    a.sort === b.sort &&
    (a.from ?? "") === (b.from ?? "") &&
    (a.to ?? "") === (b.to ?? "") &&
    (a.dateField ?? null) === (b.dateField ?? null)
  );
}

export function openArchiveCalendar(state: ArchiveListUrlState): ArchiveListUrlState {
  return { ...state, calendarOpen: true };
}

export function closeArchiveCalendar(state: ArchiveListUrlState): ArchiveListUrlState {
  return { ...state, calendarOpen: false };
}

export function applyArchiveCalendarRange(
  state: ArchiveListUrlState,
  range: { from: string; to: string },
): ArchiveListUrlState {
  return {
    ...state,
    from: range.from,
    to: range.to,
    dateField: null,
    calendarOpen: false,
  };
}

export function clearArchiveCalendarRange(state: ArchiveListUrlState): ArchiveListUrlState {
  return { ...state, from: null, to: null, dateField: null, calendarOpen: false };
}

export const ARCHIVE_FOCUS_STORAGE_KEY = "vocal-archive-focus-v1";

export function rememberArchiveFocus(reelId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ARCHIVE_FOCUS_STORAGE_KEY, reelId);
  } catch {
    /* ignore quota */
  }
}

export function readArchiveFocus(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(ARCHIVE_FOCUS_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearArchiveFocus() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ARCHIVE_FOCUS_STORAGE_KEY);
  } catch {
    /* ignore quota */
  }
}

/** Restore once: keep the id until the card is on the page, then drop it. */
export function restoreArchiveFocusOnce(input: {
  storedId: string | null;
  presentIds: string[];
}): { scrolledTo: string | null; nextStoredId: string | null } {
  const storedId = input.storedId?.trim() || null;
  if (!storedId) return { scrolledTo: null, nextStoredId: null };
  if (!input.presentIds.includes(storedId)) {
    return { scrolledTo: null, nextStoredId: storedId };
  }
  return { scrolledTo: storedId, nextStoredId: null };
}

export function openArchivePreview(state: ArchiveListUrlState, reelId: string): ArchiveListUrlState {
  return { ...state, previewId: reelId, calendarOpen: false };
}

export function closeArchivePreview(state: ArchiveListUrlState): ArchiveListUrlState {
  return { ...state, previewId: null };
}

export function mergeReelListPages(
  prev: ReelListItemDto[],
  incoming: ReelListItemDto[],
  append: boolean,
): ReelListItemDto[] {
  if (!append) return incoming;
  const seen = new Set(prev.map((row) => row.id));
  return [...prev, ...incoming.filter((row) => !seen.has(row.id))];
}

export function resolveArchiveEmptyKind(input: {
  loading: boolean;
  error: string | null;
  reelCount: number;
  totalCount: number;
  state: ArchiveListUrlState;
}): ArchiveEmptyKind | null {
  if (input.loading || input.error || input.reelCount > 0) return null;
  if (input.state.q.trim()) return "search";
  if (hasArchiveDateFilter(input.state)) return "date";
  if (input.state.status !== "all") return "filter";
  if (input.totalCount === 0) return "none";
  return null;
}
