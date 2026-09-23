import { NextResponse } from "next/server";
import { ffmpegAvailable } from "@/lib/ffmpeg";
import { resolveAppDatabaseUrl } from "@/lib/db-target";
import { logApiError } from "@/lib/safe-log";

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
    const { assertGeneratedPrismaProvider } = await import("@/lib/prisma-provider");
    assertGeneratedPrismaProvider();
    const { prisma } = await import("@/lib/db");
    await prisma.$queryRaw`select 1`;
    postgres = true;
  } catch (error) {
    logApiError("health/postgres", error);
  }

  return NextResponse.json(
    {
      ffmpeg,
      groq: Boolean(process.env.GROQ_API_KEY?.trim()),
      postgres,
      postgresStatus: postgres ? "ok" : "unavailable",
    },
    { status: postgres ? 200 : 503 },
  );
}
