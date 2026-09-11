export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function revokePreviewUrl(url: string | null | undefined): void {
  if (!url) return;
  URL.revokeObjectURL(url);
}

export function formatRecordingDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function thoughtMediaAccept(inputType: "audio" | "video"): string {
  return inputType === "audio"
    ? "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm"
    : "video/*,.mp4,.webm,.mov,.mkv";
}

export function clientThoughtMediaError(file: File, inputType: "audio" | "video", maxMb: number): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  const allowed =
    inputType === "audio"
      ? [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm"]
      : [".mp4", ".webm", ".mov", ".mkv"];
  if (!allowed.includes(ext)) {
    return inputType === "audio"
      ? "Этот формат не поддерживается. Нужен файл mp3, wav, m4a, aac, ogg или webm."
      : "Этот формат не поддерживается. Нужен файл mp4, webm, mov или mkv.";
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `Файл больше ${maxMb} МБ. Выберите другой файл.`;
  }
  return null;
}
