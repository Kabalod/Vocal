import { constants } from "node:fs";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { ffmpegAvailable } from "@/lib/ffmpeg";
import { resolveAppDatabaseUrl } from "@/lib/db-target";
import { logApiError } from "@/lib/safe-log";
import { ensureStorageDirs, audioDir, videoDir } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  let ffmpeg = true;
  try {
    ffmpegAvailable();
  } catch (error) {
    ffmpeg = false;
    logApiError("health/ffmpeg", error);
  }

  let postgres = false;
  try {
    resolveAppDatabaseUrl();
    const { prisma } = await import("@/lib/db");
    await prisma.$queryRaw`select 1`;
    postgres = true;
  } catch (error) {
    logApiError("health/postgres", error);
  }

  // Media lives on the server volume (S0 variant A): a read-only or missing volume must show up here.
  let storage = false;
  try {
    await ensureStorageDirs();
    await Promise.all([videoDir(), audioDir()].map((dir) => fs.access(dir, constants.R_OK | constants.W_OK)));
    storage = true;
  } catch (error) {
    logApiError("health/storage", error);
  }

  return NextResponse.json(
    {
      ffmpeg,
      storage,
      groq: Boolean(process.env.GROQ_API_KEY?.trim()),
      postgres,
      postgresStatus: postgres ? "ok" : "unavailable",
    },
    { status: postgres ? 200 : 503 },
  );
}
