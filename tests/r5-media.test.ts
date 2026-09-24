import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { resetPrismaClient } from "../src/lib/db";
import { withPostgresTestDb } from "./helpers/postgres-test-db";
import { clientThoughtMediaError } from "../src/lib/media-session";
import { classifyPipelineError } from "../src/lib/pipeline";
import { P13_P16_TO_R_PHASE, scriptlessTakeProcessAllowed } from "../src/lib/product-contracts";
import {
  canProcessSavedTake,
  takeProcessRequiresScript,
} from "../src/lib/recording-session";
import { TAKE_UPLOAD_STALE_MS, takeUploadClaimable } from "../src/lib/takes";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("R5 classifies take limits, stale pending reclaim, and scriptless process", () => {
  assert.equal(P13_P16_TO_R_PHASE.P15, "R5+R8");
  assert.equal(takeProcessRequiresScript(), false);
  assert.equal(scriptlessTakeProcessAllowed(), true);
  assert.equal(canProcessSavedTake({ mediaStatus: "ready", hasFile: true }), true);
  assert.equal(canProcessSavedTake({ mediaStatus: "pending", hasFile: false }), false);

  const now = new Date("2026-09-16T12:00:00.000Z");
  assert.equal(
    takeUploadClaimable({ mediaStatus: "pending", storedPath: null, createdAt: now }, now),
    true,
  );
  assert.equal(
    takeUploadClaimable(
      { mediaStatus: "pending", storedPath: "/tmp/x", createdAt: now },
      now,
    ),
    false,
  );
  assert.equal(
    takeUploadClaimable(
      {
        mediaStatus: "pending",
        storedPath: "/tmp/x",
        createdAt: new Date(now.getTime() - TAKE_UPLOAD_STALE_MS),
      },
      now,
    ),
    true,
  );
  assert.equal(
    takeUploadClaimable({ mediaStatus: "failed", storedPath: null, createdAt: now }, now),
    true,
  );

  assert.match(clientThoughtMediaError(new File(["x"], "note.txt"), "video", 80) ?? "", /формат/);
  const huge = { name: "clip.mp4", size: 81 * 1024 * 1024 } as File;
  assert.match(clientThoughtMediaError(huge, "video", 80) ?? "", /80 МБ/);

  const timeout = classifyPipelineError(new Error("Таймаут ffmpeg (90000 мс)"), "convert");
  assert.match(timeout.code, /^MEDIA_TIMEOUT\|/);
  assert.match(timeout.message, /Повторить/);
  const long = classifyPipelineError(
    Object.assign(new Error("Видео длиннее 3 минут"), { code: "TOO_LONG" }),
    "convert",
  );
  assert.match(long.code, /^TOO_LONG\|/);

  const uploads = readFileSync(path.join(repoRoot, "src/app/api/uploads/route.ts"), "utf8");
  const dropzone = readFileSync(path.join(repoRoot, "src/components/TakeUploadDropzone.tsx"), "utf8");
  const rec = readFileSync(path.join(repoRoot, "src/components/RecordingView.tsx"), "utf8");
  assert.equal(uploads.includes("SCRIPT_REQUIRED"), false);
  assert.match(uploads, /canProcessSavedTake/);
  assert.match(dropzone, /clientThoughtMediaError/);
  assert.equal(dropzone.includes("scriptVersionId) form.set"), true);
  assert.match(rec, /clientThoughtMediaError/);
  assert.match(rec, /Запись без готового сценария/);
});

test("stale pending take upload is reclaimed on retry", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "vocal-r5-stale-"));
  const storage = path.join(dir, "storage");
  const { prisma } = await withPostgresTestDb(t);
    process.env.VOCAL_STORAGE_ROOT = storage;
  process.env.VOCAL_SKIP_JOB_ENQUEUE = "1";
    t.after(async () => {
    delete process.env.VOCAL_SKIP_JOB_ENQUEUE;
    await prisma.$disconnect();
    await resetPrismaClient();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* windows lock */
    }
  });

  const { createReel } = await import("../src/lib/reels");
  const { saveUploadedTake, TAKE_UPLOAD_STALE_MS: staleMs } = await import("../src/lib/takes");
  const reel = await createReel({ title: "зависшая загрузка" });
  const file = new File([Buffer.from("0123456789abcdef")], "clip.mp4", { type: "video/mp4" });
  const key = "stale-upload";

  const stuck = await saveUploadedTake(
    { reelId: reel.id, file, inputType: "video", idempotencyKey: key },
    {
      writeFile: async () => {
        throw new Error("stop before disk");
      },
      unlink: async () => undefined,
    },
  ).catch(() => null);
  assert.equal(stuck, null);

  const row = await prisma.take.findFirst({ where: { reelId: reel.id } });
  assert.equal(row?.mediaStatus, "failed");

  await prisma.take.update({
    where: { id: row!.id },
    data: {
      mediaStatus: "pending",
      storedPath: path.join(storage, "orphan.mp4"),
      createdAt: new Date(Date.now() - staleMs - 1000),
    },
  });

  const recovered = await saveUploadedTake({
    reelId: reel.id,
    file,
    inputType: "video",
    idempotencyKey: key,
    now: new Date(),
  });
  assert.equal(recovered.id, row!.id);
  assert.equal(recovered.mediaStatus, "ready");
  assert.equal(recovered.hasFile, true);
});
