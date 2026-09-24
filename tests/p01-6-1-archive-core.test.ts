import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { normalizeArchiveListSort } from "../src/lib/reel-archive-query";
import {
  applyArchiveCalendarRange,
  buildArchiveListApiQuery,
  clearArchiveCalendarRange,
  defaultArchiveListUrlState,
  parseArchiveListUrl,
  serializeArchiveListUrl,
} from "../src/lib/thought-archive-state";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("P01.6-1 newest/oldest stay stable and old sort params collapse to newest", () => {
  assert.equal(normalizeArchiveListSort("newest"), "newest");
  assert.equal(normalizeArchiveListSort("oldest"), "oldest");
  assert.equal(normalizeArchiveListSort("updated"), "newest");
  assert.equal(normalizeArchiveListSort("created"), "newest");
  assert.equal(normalizeArchiveListSort("title"), "newest");
  assert.equal(normalizeArchiveListSort("nope"), "newest");
  assert.equal(normalizeArchiveListSort(""), "newest");
  assert.equal(parseArchiveListUrl(new URLSearchParams("sort=title")).sort, "newest");
  assert.equal(parseArchiveListUrl(new URLSearchParams("sort=oldest")).sort, "oldest");

  const defaults = defaultArchiveListUrlState();
  assert.equal(defaults.sort, "newest");
  assert.equal(defaults.calendarOpen, false);
  assert.equal(serializeArchiveListUrl(defaults).get("sort"), null);
  assert.equal(serializeArchiveListUrl({ ...defaults, sort: "oldest" }).get("sort"), "oldest");
});

test("P01.6-1 date and sort keep status; calendar open stays out of the list query", () => {
  const base = {
    ...defaultArchiveListUrlState(),
    status: "completed" as const,
    sort: "oldest" as const,
    q: "альфа",
  };
  const ranged = applyArchiveCalendarRange(base, {
    from: "2026-09-15T00:00:00.000Z",
    to: "2026-09-16T00:00:00.000Z",
  });
  assert.equal(ranged.status, "completed");
  assert.equal(ranged.sort, "oldest");
  assert.equal(ranged.q, "альфа");
  assert.equal(ranged.calendarOpen, false);

  const cleared = clearArchiveCalendarRange({ ...ranged, calendarOpen: true });
  assert.equal(cleared.status, "completed");
  assert.equal(cleared.sort, "oldest");
  assert.equal(cleared.q, "альфа");

  const api = buildArchiveListApiQuery({ ...base, calendarOpen: true, previewId: "r1" });
  assert.equal(api.includes("calendar="), false);
  assert.equal(api.includes("preview="), false);
  assert.match(api, /sort=oldest/);
  assert.match(api, /status=completed/);
});

test("P01.6-1 UI drops counters and old sort labels; cards stay compact", () => {
  const list = readFileSync(path.join(root, "src/components/ReelList.tsx"), "utf8");
  const helper = readFileSync(path.join(root, "src/lib/thought-archive-state.ts"), "utf8");
  const reels = readFileSync(path.join(root, "src/lib/reels.ts"), "utf8");
  const serialize = readFileSync(path.join(root, "src/lib/serialize.ts"), "utf8");

  assert.match(list, /ARCHIVE_LIST_SORTS/);
  assert.match(helper, /label: "Новые"/);
  assert.match(helper, /label: "Старые"/);
  assert.equal(list.includes("По обновлению"), false);
  assert.equal(list.includes("По созданию"), false);
  assert.equal(list.includes("По названию"), false);
  assert.equal(list.includes("Всего мыслей"), false);
  assert.equal(list.includes("Найдено:"), false);
  assert.match(helper, /id: "newest"/);
  assert.match(helper, /id: "oldest"/);
  assert.match(reels, /createdAt: true/);
  assert.match(reels, /_count: \{ select: \{ takes: true, scripts: true \} \}/);
  assert.equal(reels.includes("scripts: {"), false);
  assert.equal(reels.includes("body: true"), false);
  assert.match(serialize, /preview: note/);
  assert.equal(serialize.includes("script.body"), false);
});

test("P01.6-1 list order and old sort query stay safe", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
      t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { GET: listGet } = await import("../src/app/api/reels/route");
  const { listReels } = await import("../src/lib/reels");

  const same = new Date("2026-09-18T12:00:00.000Z");
  await prisma.reel.create({
    data: {
      ownerUserId: "local",
      id: "r-b",
      title: "B",
      status: "idea",
      createdAt: same,
      updatedAt: new Date("2026-09-19T12:00:00.000Z"),
    },
  });
  await prisma.reel.create({
    data: {
      ownerUserId: "local",
      id: "r-a",
      title: "A",
      status: "idea",
      createdAt: same,
      updatedAt: new Date("2026-09-20T12:00:00.000Z"),
    },
  });
  await prisma.reel.create({
    data: {
      ownerUserId: "local",
      id: "r-c",
      title: "C",
      status: "idea",
      createdAt: new Date("2026-09-17T12:00:00.000Z"),
      updatedAt: new Date("2026-09-21T12:00:00.000Z"),
    },
  });
  await prisma.scriptVersion.create({
    data: { reelId: "r-a", kind: "manual", body: "полный сценарий не для плитки" },
  });

  const newest = await listReels({ status: "all", sort: "newest" });
  assert.deepEqual(
    newest.reels.map((row) => row.id),
    ["r-b", "r-a", "r-c"],
  );
  const oldest = await listReels({ status: "all", sort: "oldest" });
  assert.deepEqual(
    oldest.reels.map((row) => row.id),
    ["r-c", "r-a", "r-b"],
  );
  assert.equal(
    newest.reels.some((row) => JSON.stringify(row).includes("полный сценарий")),
    false,
  );

  const legacy = await listGet(new Request("http://vocal.local/api/reels?status=all&sort=title"));
  assert.equal(legacy.status, 200);
  const legacyBody = (await legacy.json()) as { reels: Array<{ id: string }> };
  assert.deepEqual(
    legacyBody.reels.map((row) => row.id),
    ["r-b", "r-a", "r-c"],
  );
});

test("P01.6-1 cursor pages with limit=2 keep newest/oldest complete and unique", async (t) => {
  const { prisma } = await withPostgresTestDb(t);
    await resetPrismaClient();
    t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
  });

  const { GET: listGet } = await import("../src/app/api/reels/route");
  const same = new Date("2026-09-18T12:00:00.000Z");
  for (const id of ["r-a", "r-b", "r-c", "r-d", "r-e"]) {
    await prisma.reel.create({
      data: {
        ownerUserId: "local",
        id,
        title: id,
        status: "idea",
        createdAt: same,
        updatedAt: same,
      },
    });
  }

  async function collectPages(sort: "newest" | "oldest") {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 8; page += 1) {
      const params = new URLSearchParams({ status: "all", sort, limit: "2" });
      if (cursor) params.set("cursor", cursor);
      const res = await listGet(new Request(`http://vocal.local/api/reels?${params}`));
      assert.equal(res.status, 200, `${sort} page ${page} status`);
      const body = (await res.json()) as {
        reels: Array<{ id: string }>;
        hasMore: boolean;
        nextCursor: string | null;
      };
      ids.push(...body.reels.map((row) => row.id));
      if (!body.hasMore) {
        assert.equal(body.nextCursor, null);
        return ids;
      }
      assert.equal(body.reels.length, 2);
      assert.ok(body.nextCursor);
      cursor = body.nextCursor;
    }
    throw new Error(`${sort} pagination did not finish`);
  }

  const newestIds = await collectPages("newest");
  const oldestIds = await collectPages("oldest");
  assert.deepEqual(newestIds, ["r-e", "r-d", "r-c", "r-b", "r-a"]);
  assert.deepEqual(oldestIds, ["r-a", "r-b", "r-c", "r-d", "r-e"]);
  assert.equal(new Set(newestIds).size, 5);
  assert.equal(new Set(oldestIds).size, 5);
  assert.deepEqual([...newestIds].reverse(), oldestIds);
});
