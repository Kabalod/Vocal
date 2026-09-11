export type VoiceCaptureSession = {
  cancelled: boolean;
};

export function createVoiceCaptureSession(): VoiceCaptureSession {
  return { cancelled: false };
}

export function cancelVoiceCaptureSession(session: VoiceCaptureSession): void {
  session.cancelled = true;
}

export function adoptGrantedMicrophone(session: VoiceCaptureSession, stream: MediaStream): boolean {
  if (session.cancelled) {
    stopMediaStream(stream);
    return false;
  }
  return true;
}

export type RecorderLike = {
  state: string;
  stop: () => void;
  ondataavailable: unknown;
  onstop: unknown;
};

export async function finishVoiceRecording(input: {
  recorder: RecorderLike | null | undefined;
  stream: MediaStream | null | undefined;
  chunks: Blob[];
  mimeType?: string;
  cancelled?: () => boolean;
}): Promise<Blob> {
  const mimeType = input.mimeType ?? "audio/webm";
  const recorder = input.recorder;
  if (!recorder) {
    stopMediaStream(input.stream);
    return new Blob(input.chunks, { type: mimeType });
  }
  if (recorder.state !== "recording" && recorder.state !== "paused") {
    detachRecorderHandlers(recorder as MediaRecorder);
    stopMediaStream(input.stream);
    return new Blob(input.chunks, { type: mimeType });
  }
  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (event: { data?: Blob }) => {
      if (input.cancelled?.() || !event.data?.size) return;
      input.chunks.push(event.data);
    };
    recorder.onstop = () => {
      detachRecorderHandlers(recorder as MediaRecorder);
      stopMediaStream(input.stream);
      resolve(new Blob(input.chunks, { type: mimeType }));
    };
    try {
      recorder.stop();
    } catch (error) {
      detachRecorderHandlers(recorder as MediaRecorder);
      stopMediaStream(input.stream);
      reject(error);
    }
  });
}

export function stopRecorderIfActive(recorder: { state: string; stop: () => void } | null | undefined): void {
  if (!recorder) return;
  if (recorder.state === "recording" || recorder.state === "paused") {
    recorder.stop();
  }
}

export function detachRecorderHandlers(recorder: {
  ondataavailable: ((event: BlobEvent) => void) | null;
  onstop: ((event: Event) => void) | null;
} | null | undefined): void {
  if (!recorder) return;
  recorder.ondataavailable = null;
  recorder.onstop = null;
}

export function previewUrlIfSessionActive(
  session: VoiceCaptureSession,
  blob: Blob,
  createObjectURL: (value: Blob) => string = (value) => URL.createObjectURL(value),
): string | null {
  if (session.cancelled) return null;
  return createObjectURL(blob);
}

export function closeAudioContext(ctx: { close: () => Promise<void> | void } | null | undefined): void {
  if (!ctx) return;
  try {
    void ctx.close();
  } catch {
    /* already closed */
  }
}

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
