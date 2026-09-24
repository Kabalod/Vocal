import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { REEL_LIST_PREVIEW_MAX } from "../src/types/reel";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("thought list groups statuses, paginates, and keeps compact DTO", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-thoughts-"));
  const dbPath = path.join(dir, "test.db");
  closeSync(openSync(dbPath, "a"));
  const { prisma, url } = await withPostgresTestDb(t);
      t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  });

  const { GET: listGet } = await import("../src/app/api/reels/route");

  const longNote = "заметка ".repeat(80);
  await prisma.reel.createMany({
    data: [
      { title: "Идея одна", initialNote: longNote, status: "idea" },
      { title: "Черновик", initialNote: "", status: "draft" },
      { title: "Работа", initialNote: "в процессе", status: "in_progress" },
      { title: "Готов", initialNote: "к записи", status: "ready_to_record" },
      { title: "Готово", initialNote: "успех", status: "completed" },
      { title: "Архив мысль", initialNote: "скрыта", status: "archived" },
    ],
  });

  const allBody = await (await listGet(new Request("http://vocal.local/api/reels?status=all"))).json();
  assert.equal(allBody.totalCount, 5);
  assert.equal(allBody.matchCount, 5);
  assert.equal(
    allBody.reels.some((row: { title: string }) => row.title === "Архив мысль"),
    false,
  );
  const sample = allBody.reels[0] as Record<string, unknown>;
  assert.equal("takes" in sample, false);
  assert.equal("initialNote" in sample, false);
  assert.ok(typeof sample.preview === "string");
  assert.ok(String(sample.preview).length <= REEL_LIST_PREVIEW_MAX);

  const ideaBody = await (await listGet(new Request("http://vocal.local/api/reels?status=idea"))).json();
  assert.equal(ideaBody.matchCount, 2);
  assert.deepEqual(
    ideaBody.reels.map((row: { title: string }) => row.title).sort(),
    ["Идея одна", "Черновик"],
  );
  assert.ok(ideaBody.reels.every((row: { statusGroup: string }) => row.statusGroup === "open"));

  const workBody = await (await listGet(new Request("http://vocal.local/api/reels?status=in_progress"))).json();
  assert.equal(workBody.matchCount, 2);
  assert.deepEqual(
    workBody.reels.map((row: { title: string }) => row.title).sort(),
    ["Готов", "Работа"],
  );
  assert.ok(workBody.reels.every((row: { statusGroup: string }) => row.statusGroup === "in_progress"));

  const doneBody = await (await listGet(new Request("http://vocal.local/api/reels?status=completed"))).json();
  assert.equal(doneBody.matchCount, 1);
  assert.equal(doneBody.reels[0].statusGroup, "completed");

  const emptySearch = await (
    await listGet(new Request("http://vocal.local/api/reels?status=all&q=неттакоймыслиzzz"))
  ).json();
  assert.equal(emptySearch.reels.length, 0);
  assert.equal(emptySearch.matchCount, 0);
  assert.equal(emptySearch.totalCount, 5);

  const firstPage = await (
    await listGet(new Request("http://vocal.local/api/reels?status=all&limit=2&sort=title"))
  ).json();
  assert.equal(firstPage.reels.length, 2);
  assert.equal(firstPage.hasMore, true);
  assert.ok(firstPage.nextCursor);
  const secondPage = await (
    await listGet(
      new Request(
        `http://vocal.local/api/reels?status=all&limit=2&sort=title&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
      ),
    )
  ).json();
  const ids = [...firstPage.reels, ...secondPage.reels].map((row: { id: string }) => row.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(secondPage.totalCount, 5);

  const withScript = await prisma.reel.create({
    data: {
      title: "Со сценарием",
      initialNote: "заметка не должна утечь как сценарий",
      status: "idea",
    },
  });
  await prisma.scriptVersion.create({
    data: {
      reelId: withScript.id,
      kind: "manual",
      body: "полный текст готового сценария который нельзя отдавать в списке",
    },
  });
  await prisma.reel.update({
    where: { id: withScript.id },
    data: { selectedScriptId: (await prisma.scriptVersion.findFirst({ where: { reelId: withScript.id } }))!.id },
  });
  const listed = await (await listGet(new Request("http://vocal.local/api/reels?status=all&q=Со сценарием"))).json();
  assert.equal(listed.reels.length, 1);
  const item = listed.reels[0] as Record<string, unknown>;
  assert.equal(item.hasScript, true);
  assert.equal("body" in item, false);
  assert.equal("versions" in item, false);
  assert.equal("scripts" in item, false);
  assert.equal(JSON.stringify(item).includes("полный текст готового сценария"), false);
});
