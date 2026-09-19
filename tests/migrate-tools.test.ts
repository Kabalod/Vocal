import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { loadVocalEnv } from "../scripts/lib/load-env";
import { resolveSqliteFile } from "../scripts/lib/sqlite-path";
import { BackupRequiredError, createConfirmedSqliteBackup } from "../scripts/lib/sqlite-backup";
import { copyVocalDatabase, VOCAL_MODEL_INVENTORY } from "../scripts/lib/copy-database";
import { assignLegacyOwner } from "../scripts/lib/assign-legacy";
import { PortraitConflictError } from "../scripts/lib/portrait-conflict";
import { MediaTransferError, transferLocalMedia } from "../scripts/lib/media-transfer";
import { PRIVATE_MEDIA_PREFIX } from "../src/lib/media-access";
import { resolvePrismaSchema } from "../scripts/prisma-schema";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fileUrl(dbPath: string) {
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

async function openDb(url: string) {
  process.env.DATABASE_URL = url;
  await resetPrismaClient();
  migrateDeploy(url);
  return new PrismaClient({ datasources: { db: { url } } });
}

test("sqlite file: URLs resolve relative to the Prisma schema", () => {
  const schema = "prisma/schema.prisma";
  assert.equal(
    path.normalize(resolveSqliteFile("file:./dev.db", schema, repoRoot)),
    path.normalize(path.join(repoRoot, "prisma", "dev.db")),
  );
  assert.equal(
    path.normalize(resolveSqliteFile("file:../dev.db", schema, repoRoot)),
    path.normalize(path.join(repoRoot, "dev.db")),
  );
});

test("missing sqlite file stops backup instead of skipping", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-backup-missing-"));
  assert.throws(
    () =>
      createConfirmedSqliteBackup({
        databaseUrl: "file:./missing.db",
        schemaPath: "prisma/schema.prisma",
        cwd: dir,
        backupsRoot: path.join(dir, "backups"),
      }),
    BackupRequiredError,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("copy preserves ids, relations, extra models, and is idempotent", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-copy-"));
  const sourceUrl = fileUrl(path.join(dir, "source.db"));
  const destUrl = fileUrl(path.join(dir, "dest.db"));
  const source = await openDb(sourceUrl);
  const dest = await openDb(destUrl);
  t.after(async () => {
    await source.$disconnect();
    await dest.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  });

  const profile = await source.creatorProfile.create({
    data: { id: "local", ownerUserId: "local" },
  });
  const revision = await source.profileRevision.create({
    data: { profileId: profile.id, payloadJson: "{\"fields\":[]}" },
  });
  await source.creatorProfile.update({
    where: { id: profile.id },
    data: { currentRevisionId: revision.id },
  });
  await source.criterion.create({
    data: {
      id: "clarity",
      label: "Ясность",
      description: "test",
      weight: 20,
      enabled: true,
      sortOrder: 1,
    },
  });
  const reel = await source.reel.create({
    data: { id: "reel-1", title: "Мысль", ownerUserId: "local" },
  });
  await source.thoughtCreateKey.create({ data: { key: "idem-1", reelId: reel.id } });
  await source.reelContextSnapshot.create({
    data: {
      reelId: reel.id,
      profileRevisionId: revision.id,
      reelGoal: "goal",
      reelAudience: "aud",
      selectedKeysJson: "[]",
      assembledJson: "{}",
    },
  });
  const script = await source.scriptVersion.create({
    data: { reelId: reel.id, kind: "ready", body: "текст" },
  });
  const take = await source.take.create({
    data: {
      reelId: reel.id,
      number: 1,
      inputType: "text",
      bodyText: "hello",
      scriptVersionId: script.id,
      idempotencyKey: "take-1",
    },
  });
  await source.transcriptRevision.create({
    data: { takeId: take.id, kind: "original", source: "manual", text: "hello" },
  });
  const first = await copyVocalDatabase(source, dest);
  assert.equal(first.source.reel, 1);
  assert.equal(first.dest.reel, 1);
  assert.equal(first.dest.thoughtCreateKey, 1);
  assert.equal(first.dest.reelContextSnapshot, 1);
  assert.equal(first.dest.criterion, 1);
  const destReel = await dest.reel.findUnique({ where: { id: "reel-1" } });
  assert.equal(destReel?.title, "Мысль");
  const destTake = await dest.take.findUnique({ where: { id: take.id } });
  assert.equal(destTake?.scriptVersionId, script.id);
  const destProfile = await dest.creatorProfile.findUnique({ where: { id: "local" } });
  assert.equal(destProfile?.currentRevisionId, revision.id);

  await source.reel.update({ where: { id: reel.id }, data: { title: "Мысль 2" } });
  const second = await copyVocalDatabase(source, dest);
  assert.deepEqual(second.source, second.dest);
  assert.equal(await dest.reel.count(), 1);
  const updated = await dest.reel.findUnique({ where: { id: "reel-1" } });
  assert.equal(updated?.title, "Мысль 2");
  for (const name of VOCAL_MODEL_INVENTORY) {
    assert.equal(second.dest[name], second.source[name]);
  }
});

test("legacy portrait conflict reports and does not change rows", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-portrait-"));
  const url = fileUrl(path.join(dir, "test.db"));
  const prisma = await openDb(url);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  });
  const owner = "11111111-1111-1111-1111-111111111111";
  await prisma.creatorProfile.create({ data: { id: "local", ownerUserId: "local" } });
  await prisma.profileRevision.create({ data: { profileId: "local", payloadJson: "{}" } });
  await prisma.creatorProfile.create({ data: { id: owner, ownerUserId: owner } });
  await prisma.reel.create({ data: { title: "keep", ownerUserId: "local" } });
  await assert.rejects(() => assignLegacyOwner(prisma, owner), PortraitConflictError);
  assert.equal(await prisma.reel.count({ where: { ownerUserId: "local" } }), 1);
  assert.equal(await prisma.creatorProfile.count({ where: { id: "local" } }), 1);
});

test("media transfer updates links only after verified upload; failure restores nothing", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-media-"));
  const url = fileUrl(path.join(dir, "test.db"));
  const mediaPath = path.join(dir, "clip.bin");
  writeFileSync(mediaPath, "abc123");
  const prisma = await openDb(url);
  t.after(async () => {
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  });
  const reel = await prisma.reel.create({ data: { title: "media", ownerUserId: "local" } });
  const take = await prisma.take.create({
    data: {
      reelId: reel.id,
      number: 1,
      inputType: "video",
      storedPath: mediaPath,
      mimeType: "application/octet-stream",
    },
  });
  await assert.rejects(
    () =>
      transferLocalMedia(prisma, {
        legacyOwner: "11111111-1111-1111-1111-111111111111",
        upload: async () => {
          throw new MediaTransferError("boom");
        },
      }),
    MediaTransferError,
  );
  const failed = await prisma.take.findUnique({ where: { id: take.id } });
  assert.equal(failed?.storedPath, mediaPath);

  const ok = await transferLocalMedia(prisma, {
    legacyOwner: "11111111-1111-1111-1111-111111111111",
    upload: async ({ bytes }) => ({ bytes }),
  });
  assert.equal(ok.transferred.length, 1);
  const stored = await prisma.take.findUnique({ where: { id: take.id } });
  assert.ok(stored?.storedPath?.startsWith(PRIVATE_MEDIA_PREFIX));

  const again = await transferLocalMedia(prisma, {
    legacyOwner: "11111111-1111-1111-1111-111111111111",
    upload: async () => {
      throw new Error("should not upload again");
    },
  });
  assert.equal(again.transferred.length, 0);
  assert.equal(again.skippedPrivate.length, 1);
});

test(".env.local is visible to the Prisma picker when shell env is empty", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-env-"));
  writeFileSync(path.join(dir, ".env.local"), "DATABASE_URL=postgresql://localhost:5432/vocal\n");
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    loadVocalEnv(dir);
    assert.equal(process.env.DATABASE_URL, "postgresql://localhost:5432/vocal");
    assert.equal(resolvePrismaSchema(process.env), "prisma/schema.postgres.prisma");
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shell DATABASE_URL wins over .env.local", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-env-shell-"));
  writeFileSync(path.join(dir, ".env.local"), "DATABASE_URL=postgresql://localhost:5432/vocal\n");
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "file:./dev.db";
  try {
    loadVocalEnv(dir);
    assert.equal(process.env.DATABASE_URL, "file:./dev.db");
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
