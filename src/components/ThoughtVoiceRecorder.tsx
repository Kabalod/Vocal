"use client";

import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { ConfirmActions, VocalModal } from "@/components/vocal-ui/VocalModal";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { formatRecordingDuration, revokePreviewUrl, stopMediaStream } from "@/lib/media-session";

type VoiceState = "idle" | "requesting" | "recording" | "preview";

export function ThoughtVoiceRecorder({
  disabled,
  onReadyFile,
  onDirtyChange,
}: {
  disabled?: boolean;
  onReadyFile: (file: File) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewUrlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const blobRef = useRef<Blob | null>(null);

  function clearTimers() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  function releaseLive() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    void audioCtxRef.current?.close();
    audioCtxRef.current = null;
    clearTimers();
  }

  function releaseAll() {
    releaseLive();
    revokePreviewUrl(previewUrlRef.current);
    previewUrlRef.current = null;
    blobRef.current = null;
    chunksRef.current = [];
  }

  useEffect(() => {
    return () => {
      releaseAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  useEffect(() => {
    onDirtyChange(state === "recording" || state === "preview");
  }, [state, onDirtyChange]);

  function startMeter(stream: MediaStream) {
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const centered = (value - 128) / 128;
          sum += centered * centered;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        rafRef.current = window.requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setLevel(0);
    }
  }

  async function startRecording() {
    if (disabled) return;
    setError(null);
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        blobRef.current = blob;
        revokePreviewUrl(previewUrlRef.current);
        previewUrlRef.current = URL.createObjectURL(blob);
        stopMediaStream(streamRef.current);
        streamRef.current = null;
        void audioCtxRef.current?.close();
        audioCtxRef.current = null;
        clearTimers();
        setState("preview");
      };
      recorder.start();
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
      startMeter(stream);
      setState("recording");
    } catch {
      releaseLive();
      setState("idle");
      setError("Нет доступа к микрофону. Разрешите доступ в настройках браузера и нажмите «Начать запись» снова.");
    }
  }

  function finishRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function requestDiscard() {
    if (state === "idle" || state === "requesting") return;
    setConfirmOpen(true);
  }

  function discard() {
    setConfirmOpen(false);
    releaseAll();
    setSeconds(0);
    setLevel(0);
    setState("idle");
  }

  function continueWithVocal() {
    const blob = blobRef.current;
    if (!blob) return;
    const ext = blob.type.includes("mp4") ? "m4a" : "webm";
    onReadyFile(new File([blob], `thought.${ext}`, { type: blob.type || "audio/webm" }));
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Расскажите мысль своими словами</p>
      {state === "idle" || state === "requesting" ? (
        <div className="space-y-3">
          <p className="text-sm text-text">Готовы к записи</p>
          <p className="text-sm text-muted" aria-hidden="true">
            0:00
          </p>
          <ActionButton
            variant="primary"
            disabled={disabled}
            loading={state === "requesting"}
            loadingLabel="Запрашиваем микрофон…"
            onClick={() => void startRecording()}
          >
            Начать запись
          </ActionButton>
        </div>
      ) : null}

      {state === "recording" ? (
        <div className="space-y-3">
          <p className="text-sm text-text" aria-live="polite">
            Идёт запись · {formatRecordingDuration(seconds)}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-bg" aria-hidden="true">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(8, level * 100)}%` }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="primary" onClick={finishRecording}>
              Завершить запись
            </ActionButton>
            <ActionButton variant="secondary" onClick={requestDiscard}>
              Отменить
            </ActionButton>
          </div>
        </div>
      ) : null}

      {state === "preview" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Запись {formatRecordingDuration(seconds)}</p>
          {previewUrlRef.current ? <audio controls src={previewUrlRef.current} className="w-full" /> : null}
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="primary" disabled={disabled} onClick={continueWithVocal}>
              Продолжить с Vocal
            </ActionButton>
            <ActionButton variant="secondary" disabled={disabled} onClick={requestDiscard}>
              Удалить запись
            </ActionButton>
          </div>
        </div>
      ) : null}

      {error ? <InlineError message={error} /> : null}

      <VocalModal
        open={confirmOpen}
        title="Удалить эту запись?"
        initialFocus="safe"
        onClose={() => setConfirmOpen(false)}
      >
        <p className="text-sm text-muted">Длительность {formatRecordingDuration(seconds)}. Исчезнет только этот фрагмент.</p>
        <ConfirmActions
          cancelLabel="Вернуться к записи"
          confirmLabel="Удалить запись"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={discard}
        />
      </VocalModal>
    </div>
  );
}

