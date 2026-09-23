import { NextResponse } from "next/server";
import { ffmpegAvailable } from "@/lib/ffmpeg";
import { VOCAL_SUPABASE_PROJECT_REF, resolveAppDatabaseUrl } from "@/lib/db-target";

export const dynamic = "force-dynamic";

export async function GET() {
  let ffmpeg = true;
  let ffmpegError: string | null = null;
  try {
    ffmpegAvailable();
  } catch (error) {
    ffmpeg = false;
    ffmpegError = error instanceof Error ? error.message : "FFmpeg недоступен";
  }

  let postgres = false;
  let postgresError: string | null = null;
  try {
    resolveAppDatabaseUrl();
    const { prisma } = await import("@/lib/db");
    await prisma.$queryRaw`select 1`;
    postgres = true;
  } catch (error) {
    postgresError = error instanceof Error ? error.message : "Postgres недоступен";
  }

  return NextResponse.json({
    ffmpeg,
    ffmpegError,
    groq: Boolean(process.env.GROQ_API_KEY?.trim()),
    postgres,
    postgresError,
    project: VOCAL_SUPABASE_PROJECT_REF,
  });
}
