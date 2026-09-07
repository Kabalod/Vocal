import {
  BROWSER_AUDIO_EXTENSIONS,
  BROWSER_VIDEO_EXTENSIONS,
} from "@/lib/constants";
import type { TakeInputType } from "@/types/reel";

export function extensionFromName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
};

export function mimeFromName(name: string, fallback = "application/octet-stream") {
  return MIME_BY_EXT[extensionFromName(name)] ?? fallback;
}

export function canPlayInBrowser(inputType: TakeInputType, originalName: string | null) {
  const ext = extensionFromName(originalName ?? "");
  if (inputType === "video") return BROWSER_VIDEO_EXTENSIONS.includes(ext);
  if (inputType === "audio") return BROWSER_AUDIO_EXTENSIONS.includes(ext);
  return false;
}

export function playbackHint(inputType: TakeInputType, originalName: string | null, hasFile: boolean) {
  if (inputType === "text") return "Текстовая попытка — файла нет.";
  if (!hasFile) return "Файл ещё не записан.";
  if (canPlayInBrowser(inputType, originalName)) return null;
  return "Этот контейнер браузер, скорее всего, не откроет. Скачайте исходник. FFmpeg его может прочитать, плеер — нет.";
}
