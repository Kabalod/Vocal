import { NextResponse } from "next/server";
import { ffmpegAvailable } from "@/lib/ffmpeg";

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

  return NextResponse.json({
    ffmpeg,
    ffmpegError,
    groq: Boolean(process.env.GROQ_API_KEY?.trim()),
  });
}
