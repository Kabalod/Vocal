import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { GenerationGuard } from "../src/lib/generation-guard";
import {
  archiveListHref,
  archiveListUrlEquals,
  buildArchiveListApiQuery,
  defaultArchiveListUrlState,
  hasArchiveDateFilter,
  mergeReelListPages,
  parseArchiveListUrl,
  resolveArchiveEmptyKind,
  serializeArchiveListUrl,
} from "../src/lib/thought-archive-state";
import type { ReelListItemDto } from "../src/types/reel";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function item(id: string): ReelListItemDto {
  return {
    id,
    title: id,
    preview: "",
    status: "idea",
    statusGroup: "open",
    hasScript: false,
    takeCount: 0,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
  };
}

test("P01.2 URL state round-trip keeps search, status, date and sort", () => {
  const state = {
    q: "альфа",
    status: "in_progress" as const,
    sort: "created" as const,
    from: "2026-09-15T00:00:00.000+03:00",
    to: "2026-09-16T00:00:00.000+03:00",
    dateField: "createdAt" as const,
  };
  const params = serializeArchiveListUrl(state);
  assert.equal(params.get("q"), "альфа");
  assert.equal(params.get("status"), "in_progress");
  assert.equal(params.get("sort"), "created");
  assert.equal(params.get("from"), state.from);
  assert.equal(params.get("to"), state.to);
  // createdAt is server default — omitted from URL
  assert.equal(params.get("dateField"), null);

  const parsed = parseArchiveListUrl(params);
  assert.equal(parsed.q, "альфа");
  assert.equal(parsed.status, "in_progress");
  assert.equal(parsed.sort, "created");
  assert.equal(parsed.from, state.from);
  assert.equal(parsed.to, state.to);
  assert.equal(parsed.dateField, null);
  assert.equal(archiveListHref(defaultArchiveListUrlState()), "/reels");
  assert.ok(archiveListHref(state).startsWith("/reels?"));
  assert.ok(hasArchiveDateFilter(state));
  assert.equal(hasArchiveDateFilter(defaultArchiveListUrlState()), false);

  const withUpdated = serializeArchiveListUrl({ ...state, dateField: "updatedAt" });
  assert.equal(withUpdated.get("dateField"), "updatedAt");
  assert.equal(parseArchiveListUrl(withUpdated).dateField, "updatedAt");

  assert.equal(
    archiveListUrlEquals(state, { ...state, q: "альфа" }),
    true,
  );
  assert.equal(archiveListUrlEquals(state, { ...state, status: "all" }), false);
});

test("P01.2 API query clears cursor on new filters and includes date bounds", () => {
  const base = {
    ...defaultArchiveListUrlState(),
    q: "x",
    status: "idea" as const,
    from: "2026-09-15T00:00:00.000Z",
    to: "2026-09-16T00:00:00.000Z",
  };
  const first = buildArchiveListApiQuery(base);
  assert.match(first, /status=idea/);
  assert.match(first, /q=x/);
  assert.match(first, /from=/);
  assert.match(first, /to=/);
  assert.equal(first.includes("cursor="), false);

  const next = buildArchiveListApiQuery(base, { cursor: "abc" });
  assert.match(next, /cursor=abc/);
});

test("P01.2 merge dedupes pages; empty kinds distinguish archive vs filters", () => {
  const merged = mergeReelListPages([item("a"), item("b")], [item("b"), item("c")], true);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    mergeReelListPages([item("a")], [item("z")], false).map((row) => row.id),
    ["z"],
  );

  const state = defaultArchiveListUrlState();
  assert.equal(
    resolveArchiveEmptyKind({ loading: false, error: null, reelCount: 0, totalCount: 0, state }),
    "none",
  );
  assert.equal(
    resolveArchiveEmptyKind({
      loading: false,
      error: null,
      reelCount: 0,
      totalCount: 3,
      state: { ...state, q: "zzz" },
    }),
    "search",
  );
  assert.equal(
    resolveArchiveEmptyKind({
      loading: false,
      error: null,
      reelCount: 0,
      totalCount: 3,
      state: { ...state, status: "completed" },
    }),
    "filter",
  );
  assert.equal(
    resolveArchiveEmptyKind({
      loading: false,
      error: null,
      reelCount: 0,
      totalCount: 3,
      state: {
        ...state,
        from: "2026-09-15T00:00:00.000Z",
        to: "2026-09-16T00:00:00.000Z",
      },
    }),
    "date",
  );
  assert.equal(
    resolveArchiveEmptyKind({ loading: true, error: null, reelCount: 0, totalCount: 0, state }),
    null,
  );
});

test("P01.2 generation guard ignores stale first-page results after filter change", () => {
  const guard = new GenerationGuard();
  const first = guard.begin();
  const second = guard.begin();
  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
});

test("P01.2 ReelList wires URL state, abort, observer, split errors and fallback", () => {
  const list = readFileSync(join(root, "src/components/ReelList.tsx"), "utf8");
  const page = readFileSync(join(root, "src/app/reels/page.tsx"), "utf8");
  assert.match(list, /useSearchParams/);
  assert.match(list, /router\.replace/);
  assert.match(list, /AbortController/);
  assert.match(list, /IntersectionObserver/);
  assert.match(list, /Загрузить ещё/);
  assert.match(list, /Повторить загрузку/);
  assert.match(list, /Конец списка/);
  assert.match(list, /listError/);
  assert.match(list, /moreError/);
  assert.match(list, /mergeReelListPages/);
  assert.match(list, /buildArchiveListApiQuery/);
  assert.match(list, /fetch\(`\/api\/reels\?\$\{queryString\}`/);
  assert.match(list, /Нет мыслей в выбранных датах/);
  assert.equal(list.includes("polaroid"), false);
  assert.equal(list.includes("calendar"), false);
  assert.equal(list.includes("bottom sheet"), false);
  assert.match(page, /Suspense/);
});
