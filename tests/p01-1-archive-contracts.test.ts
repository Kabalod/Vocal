import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import {
  ARCHIVE_DATE_FIELD_DEFAULT,
  archiveFilterFingerprint,
  bucketCalendarDays,
  calendarDayKey,
  monthRangeForOffset,
  parseArchiveRange,
  resolveArchiveDateField,
} from "../src/lib/reel-archive-query";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fileUrl(dbPath: string): string {
  return `file:${dbPath.replace(/\\/g, "/")}`;
}

function migrateDeploy(url: string) {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
    shell: true,
  });
}

test("P01.1 pure helpers: range, month bounds, day keys, fingerprint", () => {
  assert.equal(ARCHIVE_DATE_FIELD_DEFAULT, "createdAt");

  const day = parseArchiveRange({
    from: "2026-09-15T00:00:00.000+03:00",
    to: "2026-09-16T00:00:00.000+03:00",
  });
  assert.ok(day);
  assert.equal(day.dateField, "createdAt");
  assert.equal(day.from.toISOString(), "2026-09-14T21:00:00.000Z");
  assert.equal(day.to.toISOString(), "2026-09-15T21:00:00.000Z");

  assert.throws(() => parseArchiveRange({ from: "2026-09-15T00:00:00.000Z" }), /обе границы/i);
  assert.throws(
    () =>
      parseArchiveRange({
        from: "2026-09-16T00:00:00.000Z",
        to: "2026-09-15T00:00:00.000Z",
      }),
    /from < to/i,
  );
  assert.throws(
    () =>
      parseArchiveRange({
        from: "2026-09-15T00:00:00",
        to: "2026-09-16T00:00:00",
      }),
    (err: unknown) =>
      err instanceof Error &&
      (err as { code?: string }).code === "ARCHIVE_RANGE" &&
      /абсолютным ISO/i.test(err.message),
  );
  assert.throws(
    () => resolveArchiveDateField("wrong"),
    (err: unknown) => err instanceof Error && (err as { code?: string }).code === "ARCHIVE_DATE_FIELD",
  );
  assert.equal(resolveArchiveDateField(undefined), "createdAt");
  assert.equal(resolveArchiveDateField("updatedAt"), "updatedAt");

  const month = monthRangeForOffset("2026-09", 180);
  assert.equal(month.month, "2026-09");
  assert.equal(month.from.toISOString(), "2026-08-31T21:00:00.000Z");
  assert.equal(month.to.toISOString(), "2026-09-30T21:00:00.000Z");

  // Instant just before local midnight stays previous day; at local midnight jumps.
  const before = new Date("2026-09-14T20:59:59.000Z");
  const at = new Date("2026-09-14T21:00:00.000Z");
  assert.equal(calendarDayKey(before, 180), "2026-09-14");
  assert.equal(calendarDayKey(at, 180), "2026-09-15");

  assert.deepEqual(bucketCalendarDays([before, at, at], 180), [
    { date: "2026-09-14", count: 1 },
    { date: "2026-09-15", count: 2 },
  ]);

  const a = archiveFilterFingerprint({ status: "all", q: "x", from: "a", to: "b" });
  const b = archiveFilterFingerprint({ status: "all", q: "x", from: "a", to: "c" });
  assert.notEqual(a, b);
  assert.notEqual(
    archiveFilterFingerprint({ status: "all", sort: "created" }),
    archiveFilterFingerprint({ status: "all", sort: "updated" }),
  );
});

test("P01.1 list date filters, calendar facets, cursor fingerprint, no duplicates", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-p01-1-"));
  const dbPath = path.join(dir, "test.db");
  closeSync(openSync(dbPath, "a"));
  const url = fileUrl(dbPath);
  process.env.DATABASE_URL = url;
  await resetPrismaClient();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows */
    }
  });
  migrateDeploy(url);

  const { GET: listGet } = await import("../src/app/api/reels/route");
  const { GET: calendarGet } = await import("../src/app/api/reels/calendar/route");

  const tz = 180;
  // Local 15 Sep 2026 12:00 MSK
  const dayA = new Date("2026-09-15T09:00:00.000Z");
  // Local 16 Sep 2026 01:00 MSK — still 16th
  const dayB = new Date("2026-09-15T22:00:00.000Z");
  // Exactly local midnight 17 Sep
  const dayC = new Date("2026-09-16T21:00:00.000Z");
  // Empty day: 18 Sep — no rows

  await prisma.reel.create({
    data: {
      id: "r-a",
      title: "Утро пятницы",
      initialNote: "поиск альфа",
      status: "idea",
      createdAt: dayA,
      updatedAt: dayC,
    },
  });
  await prisma.reel.create({
    data: {
      id: "r-b",
      title: "Ночь субботы",
      initialNote: "бета",
      status: "draft",
      createdAt: dayB,
      updatedAt: dayB,
    },
  });
  await prisma.reel.create({
    data: {
      id: "r-c",
      title: "Воскресенье работа",
      initialNote: "альфа работа",
      status: "in_progress",
      createdAt: dayC,
      updatedAt: dayC,
    },
  });
  await prisma.reel.create({
    data: {
      id: "r-arch",
      title: "Архив скрыт",
      initialNote: "альфа",
      status: "archived",
      createdAt: dayA,
      updatedAt: dayA,
    },
  });

  const from15 = encodeURIComponent("2026-09-15T00:00:00.000+03:00");
  const to16 = encodeURIComponent("2026-09-16T00:00:00.000+03:00");
  const dayList = await (
    await listGet(
      new Request(`http://vocal.local/api/reels?status=all&from=${from15}&to=${to16}&sort=created`),
    )
  ).json();
  assert.equal(dayList.matchCount, 1);
  assert.equal(dayList.reels.length, 1);
  assert.equal(dayList.reels[0].title, "Утро пятницы");
  assert.equal(dayList.range.dateField, "createdAt");

  const emptyDay = await (
    await listGet(
      new Request(
        `http://vocal.local/api/reels?status=all&from=${encodeURIComponent("2026-09-18T00:00:00.000+03:00")}&to=${encodeURIComponent("2026-09-19T00:00:00.000+03:00")}`,
      ),
    )
  ).json();
  assert.equal(emptyDay.matchCount, 0);
  assert.equal(emptyDay.reels.length, 0);
  assert.equal(emptyDay.totalCount, 3);

  const andFilters = await (
    await listGet(
      new Request(
        `http://vocal.local/api/reels?status=idea&q=альфа&from=${from15}&to=${encodeURIComponent("2026-09-17T00:00:00.000+03:00")}`,
      ),
    )
  ).json();
  // status idea includes draft; q альфа matches r-a only among idea/draft in range (r-b is draft but note бета)
  assert.equal(andFilters.matchCount, 1);
  assert.equal(andFilters.reels[0].id, "r-a");

  const monthFrom = encodeURIComponent("2026-09-01T00:00:00.000+03:00");
  const monthTo = encodeURIComponent("2026-10-01T00:00:00.000+03:00");
  const page1 = await (
    await listGet(
      new Request(
        `http://vocal.local/api/reels?status=all&sort=created&limit=1&from=${monthFrom}&to=${monthTo}`,
      ),
    )
  ).json();
  assert.equal(page1.reels.length, 1);
  assert.equal(page1.hasMore, true);
  assert.ok(page1.nextCursor);
  const page2 = await (
    await listGet(
      new Request(
        `http://vocal.local/api/reels?status=all&sort=created&limit=1&from=${monthFrom}&to=${monthTo}&cursor=${encodeURIComponent(page1.nextCursor)}`,
      ),
    )
  ).json();
  const ids = [page1.reels[0].id, page2.reels[0].id];
  assert.equal(new Set(ids).size, 2);

  const badCursorStatus = await listGet(
    new Request(
      `http://vocal.local/api/reels?status=completed&sort=created&from=${monthFrom}&to=${monthTo}&cursor=${encodeURIComponent(page1.nextCursor)}`,
    ),
  );
  assert.equal(badCursorStatus.status, 400);
  assert.equal((await badCursorStatus.json()).code, "LIST_CURSOR");

  // Legacy cursor without fingerprint cannot be checked against status/q — always LIST_CURSOR.
  const legacyNoFp = Buffer.from(
    JSON.stringify({ sort: "updated", k: dayA.toISOString(), id: "r-a" }),
    "utf8",
  ).toString("base64url");
  const legacyWithOtherStatus = await listGet(
    new Request(`http://vocal.local/api/reels?status=all&cursor=${encodeURIComponent(legacyNoFp)}`),
  );
  assert.equal(legacyWithOtherStatus.status, 400);
  assert.equal((await legacyWithOtherStatus.json()).code, "LIST_CURSOR");

  const legacyWithOtherQ = await listGet(
    new Request(
      `http://vocal.local/api/reels?status=all&q=${encodeURIComponent("альфа")}&cursor=${encodeURIComponent(legacyNoFp)}`,
    ),
  );
  assert.equal(legacyWithOtherQ.status, 400);
  assert.equal((await legacyWithOtherQ.json()).code, "LIST_CURSOR");

  const badDateField = await listGet(
    new Request("http://vocal.local/api/reels?status=all&dateField=wrong"),
  );
  assert.equal(badDateField.status, 400);
  assert.equal((await badDateField.json()).code, "ARCHIVE_DATE_FIELD");

  const ambiguousRange = await listGet(
    new Request(
      "http://vocal.local/api/reels?status=all&from=2026-09-15T00:00:00&to=2026-09-16T00:00:00",
    ),
  );
  assert.equal(ambiguousRange.status, 400);
  assert.equal((await ambiguousRange.json()).code, "ARCHIVE_RANGE");

  // Half-open [from, to): instant exactly at `to` is excluded (local midnight boundary).
  const midnightFrom = encodeURIComponent("2026-09-16T00:00:00.000+03:00");
  const midnightTo = encodeURIComponent("2026-09-17T00:00:00.000+03:00");
  // dayB is 2026-09-15T22:00:00.000Z = 16 Sep 01:00 MSK → inside [16th, 17th)
  // dayC is 2026-09-16T21:00:00.000Z = 17 Sep 00:00 MSK → excluded as `to`
  const midnightWindow = await (
    await listGet(
      new Request(
        `http://vocal.local/api/reels?status=all&sort=created&from=${midnightFrom}&to=${midnightTo}`,
      ),
    )
  ).json();
  assert.equal(midnightWindow.matchCount, 1);
  assert.equal(midnightWindow.reels[0].id, "r-b");

  const badRange = await listGet(
    new Request("http://vocal.local/api/reels?status=all&from=2026-09-15T00:00:00.000Z"),
  );
  assert.equal(badRange.status, 400);
  assert.equal((await badRange.json()).code, "ARCHIVE_RANGE");

  const facets = await (
    await calendarGet(
      new Request(`http://vocal.local/api/reels/calendar?month=2026-09&tzOffsetMinutes=${tz}&status=all`),
    )
  ).json();
  assert.equal(facets.dateField, "createdAt");
  assert.equal(facets.dateFieldDefault, "createdAt");
  assert.equal(facets.month, "2026-09");
  assert.equal(facets.matchCount, 3);
  assert.deepEqual(
    facets.days.map((d: { date: string; count: number }) => d),
    [
      { date: "2026-09-15", count: 1 },
      { date: "2026-09-16", count: 1 },
      { date: "2026-09-17", count: 1 },
    ],
  );
  assert.ok(facets.dataBounds.earliest);
  assert.ok(facets.dataBounds.latest);

  const facetsSearch = await (
    await calendarGet(
      new Request(
        `http://vocal.local/api/reels/calendar?month=2026-09&tzOffsetMinutes=${tz}&status=all&q=${encodeURIComponent("альфа")}`,
      ),
    )
  ).json();
  // r-a and r-c (archived excluded); r-c has альфа in note
  assert.equal(facetsSearch.matchCount, 2);
  assert.equal(
    facetsSearch.days.some((d: { date: string }) => d.date === "2026-09-18"),
    false,
  );

  // Facets must not return card payloads
  assert.equal("reels" in facets, false);
  assert.ok(!JSON.stringify(facets).includes("Утро пятницы"));
});
