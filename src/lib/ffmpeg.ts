import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const FFMPEG_TIMEOUT_MS = 90_000;
const FFPROBE_TIMEOUT_MS = 20_000;

function bin(kind: "ffmpeg" | "ffprobe"): string {
  if (kind === "ffmpeg") {
    const path = typeof ffmpegStatic === "string" ? ffmpegStatic : null;
    if (!path) {
      throw new Error("FFmpeg не найден. Установите ffmpeg-static или FFmpeg в PATH.");
    }
    return path;
  }
  const probe = ffprobeStatic as { path?: string; default?: { path?: string } };
  const path = probe?.path ?? probe?.default?.path;
  if (!path) {
    throw new Error("ffprobe не найден. Установите ffprobe-static или FFmpeg в PATH.");
  }
  return path;
}

function run(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Таймаут ${command} (${timeoutMs} мс)`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${command} завершился с кодом ${code}. ${stderr.slice(-800) || stdout.slice(-400)}`,
        ),
      );
    });
  });
}

export async function probeDuration(inputPath: string): Promise<number> {
  const { stdout } = await run(
    bin("ffprobe"),
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ],
    FFPROBE_TIMEOUT_MS,
  );
  const duration = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Не удалось определить длительность видео.");
  }
  return duration;
}

export async function extractAudio(inputPath: string, outputPath: string): Promise<void> {
  await run(
    bin("ffmpeg"),
    [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "64k",
      outputPath,
    ],
    FFMPEG_TIMEOUT_MS,
  );
}

export function ffmpegAvailable(): { ffmpeg: string; ffprobe: string } {
  return { ffmpeg: bin("ffmpeg"), ffprobe: bin("ffprobe") };
}
