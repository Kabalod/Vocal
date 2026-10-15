"use client";

import { ArrowLeft, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { ConfirmActions, VocalModal } from "@/components/vocal-ui/VocalModal";
import { InlineError } from "@/components/vocal-ui/InlineError";
import {
  adoptGrantedMicrophone,
  cancelVoiceCaptureSession,
  closeAudioContext,
  createVoiceCaptureSession,
  detachRecorderHandlers,
  formatRecordingDuration,
  microphonePermissionMessage,
  clientThoughtMediaError,
  previewUrlIfSessionActive,
  revokePreviewUrl,
  stopMediaStream,
  stopRecorderIfActive,
  type VoiceCaptureSession,
} from "@/lib/media-session";
import { MAX_UPLOAD_MB } from "@/lib/constants";
import {
  ABORT_TAKE_UPLOAD_LEAVE_TEXT,
  applyLateTakeUploadResult,
  recordingNeedsDiscardConfirm,
  type RecordingPhase,
} from "@/lib/recording-session";

export function RecordingView({
  reelId,
  thoughtTitle,
  scriptVersionId,
  scriptNumber,
  onClose,
  onSaved,
  desktop = false,
}: {
  reelId: string;
  thoughtTitle: string;
  /** P3b: teleprompter ~70% + a compact column from the desktop shell breakpoint; the recording logic is the same. */
  desktop?: boolean;
  scriptVersionId?: string | null;
  scriptNumber: number | null;
  onClose: () => void;
  onSaved: (info: { jobId: string | null }) => void;
}) {
  const [phase, setPhase] = useState<RecordingPhase>("idle");
  const [scriptBody, setScriptBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showScript, setShowScript] = useState(true);
  const sessionRef = useRef<VoiceCaptureSession>(createVoiceCaptureSession());
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewUrlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  function clearTimers() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  function releaseHardware() {
    detachRecorderHandlers(recorderRef.current);
    stopRecorderIfActive(recorderRef.current);
    recorderRef.current = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    closeAudioContext(audioCtxRef.current);
    audioCtxRef.current = null;
    clearTimers();
  }

  function releaseAll() {
    uploadAbortRef.current?.abort();
    cancelVoiceCaptureSession(sessionRef.current);
    releaseHardware();
    revokePreviewUrl(previewUrlRef.current);
    previewUrlRef.current = null;
    blobRef.current = null;
    chunksRef.current = [];
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  useEffect(() => {
    if (!scriptVersionId) {
      setScriptBody("");
      return;
    }
    let cancelled = false;
    void fetch(`/api/reels/${reelId}/scripts/${scriptVersionId}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { body?: string; error?: string }) => {
        if (cancelled) return;
        if (typeof data.body === "string") setScriptBody(data.body);
        else setError(data.error ?? "Не удалось загрузить сценарий.");
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить сценарий.");
      });
    return () => {
      cancelled = true;
    };
  }, [reelId, scriptVersionId]);

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
        if (sessionRef.current.cancelled) return;
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
    setError(null);
    const session = createVoiceCaptureSession();
    sessionRef.current = session;
    setPhase("permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!adoptGrantedMicrophone(session, stream)) return;
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (session.cancelled) return;
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (session.cancelled) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        blobRef.current = blob;
        revokePreviewUrl(previewUrlRef.current);
        const url = previewUrlIfSessionActive(session, blob);
        previewUrlRef.current = url;
        stopMediaStream(streamRef.current);
        streamRef.current = null;
        closeAudioContext(audioCtxRef.current);
        audioCtxRef.current = null;
        clearTimers();
        if (!url) return;
        setPhase("preview");
      };
      recorder.start();
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
      startMeter(stream);
      setPhase("recording");
    } catch (err) {
      if (session.cancelled) return;
      releaseHardware();
      setPhase("idle");
      setError(microphonePermissionMessage(err, { secureContext: window.isSecureContext }));
    }
  }

  function finishRecording() {
    stopRecorderIfActive(recorderRef.current);
  }

  function requestLeave() {
    if (recordingNeedsDiscardConfirm(phase)) {
      setConfirmOpen(true);
      return;
    }
    releaseAll();
    onClose();
  }

  function discard() {
    setConfirmOpen(false);
    releaseAll();
    sessionRef.current = createVoiceCaptureSession();
    setSeconds(0);
    setLevel(0);
    setPhase("idle");
  }

  async function saveTake() {
    const blob = blobRef.current;
    if (!blob || phase === "saving") return;
    setPhase("saving");
    setError(null);
    const ext = blob.type.includes("mp4") ? "m4a" : "webm";
    const file = new File([blob], `take.${ext}`, { type: blob.type || "audio/webm" });
    const local = clientThoughtMediaError(file, "audio", MAX_UPLOAD_MB);
    if (local) {
      setPhase("preview");
      setError(local);
      return;
    }
    const key = crypto.randomUUID();
    const form = new FormData();
    form.set("file", file);
    form.set("reelId", reelId);
    form.set("inputType", "audio");
    if (scriptVersionId) form.set("scriptVersionId", scriptVersionId);
    form.set("process", "1");
    form.set("idempotencyKey", key);
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: form,
        signal: controller.signal,
      });
      const data = (await res.json()) as { error?: string; job?: { id?: string } };
      if (applyLateTakeUploadResult({ mounted: mountedRef.current, aborted: controller.signal.aborted }) === "ignore") {
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить дубль.");
      releaseHardware();
      revokePreviewUrl(previewUrlRef.current);
      previewUrlRef.current = null;
      blobRef.current = null;
      setPhase("saved");
      onSaved({ jobId: typeof data.job?.id === "string" ? data.job.id : null });
    } catch (err) {
      const aborted = controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError");
      if (applyLateTakeUploadResult({ mounted: mountedRef.current, aborted }) === "ignore") return;
      setPhase("preview");
      setError(err instanceof Error ? err.message : "Не удалось сохранить дубль.");
    }
  }

  const versionLabel =
    scriptNumber != null ? `версия ${scriptNumber}` : scriptVersionId ? "готовая версия" : "без сценария";
  const stage = (
      <div
        className={
          desktop
            ? "space-y-3"
            : "space-y-3 border-t border-line bg-bg pt-3 shell:border-t-0 shell:border-l shell:border-line shell:pl-4 shell:pt-0"
        }
        style={desktop ? undefined : { paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {phase === "idle" || phase === "permission" ? (
          <div className="space-y-3">
            <p className="text-sm text-text">Готовы к записи</p>
            <p className="text-sm text-muted" aria-hidden="true">
              0:00
            </p>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                variant="primary"
                fullWidth={desktop}
                className={desktop ? "min-h-12 text-base" : ""}
                loading={phase === "permission"}
                loadingLabel="Запрашиваем микрофон…"
                onClick={() => void startRecording()}
              >
                Начать запись
              </ActionButton>
              {desktop ? null : (
                <ActionButton variant="secondary" onClick={requestLeave}>
                  К списку дублей
                </ActionButton>
              )}
            </div>
          </div>
        ) : null}

        {phase === "recording" ? (
          <div className="space-y-3">
            <p className="text-sm text-text" aria-live="polite">
              Идёт запись · {formatRecordingDuration(seconds)}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-bg-elev" aria-hidden="true">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(8, level * 100)}%` }} />
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="primary" fullWidth={desktop} onClick={finishRecording}>
                Завершить запись
              </ActionButton>
              <ActionButton variant="secondary" onClick={requestLeave}>
                Отменить
              </ActionButton>
            </div>
          </div>
        ) : null}

        {phase === "preview" || phase === "saving" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Запись {formatRecordingDuration(seconds)}</p>
            {previewUrlRef.current ? <audio controls src={previewUrlRef.current} className="w-full" /> : null}
            <div className="flex flex-wrap gap-2">
              <ActionButton
                variant="primary"
                fullWidth={desktop}
                loading={phase === "saving"}
                loadingLabel="Сохраняем…"
                onClick={() => void saveTake()}
              >
                Сохранить дубль
              </ActionButton>
              <ActionButton variant="secondary" onClick={requestLeave}>
                Отменить
              </ActionButton>
            </div>
          </div>
        ) : null}

        {phase === "saved" ? (
          <div className="space-y-3">
            <p className="text-sm text-text">Дубль сохранён. Следим за расшифровкой в списке дублей.</p>
            <ActionButton variant="primary" fullWidth={desktop} onClick={onClose}>
              К списку дублей
            </ActionButton>
          </div>
        ) : null}

        {error ? <InlineError message={error} /> : null}
      </div>
  );

  const confirmModal = (
      <VocalModal
        open={confirmOpen}
        title={phase === "saving" ? "Прервать загрузку?" : "Отменить эту запись?"}
        initialFocus="safe"
        onClose={() => setConfirmOpen(false)}
      >
        <p className="text-sm text-muted">
          {phase === "saving"
            ? ABORT_TAKE_UPLOAD_LEAVE_TEXT
            : `Длительность ${formatRecordingDuration(seconds)}. Исчезнет только этот фрагмент. Уже сохранённые дубли останутся.`}
        </p>
        <ConfirmActions
          cancelLabel="Вернуться к записи"
          confirmLabel="Отменить запись"
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            discard();
            onClose();
          }}
        />
      </VocalModal>
  );

  if (desktop) {
    const micState =
      phase === "recording"
        ? "Микрофон включён"
        : phase === "permission"
          ? "Ждём разрешение на микрофон…"
          : phase === "preview" || phase === "saving" || phase === "saved"
            ? "Запись остановлена"
            : "Микрофон будет запрошен при старте";
    return (
      <section aria-label="Запись дубля" data-recording-desktop className="space-y-5">
        <header className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={requestLeave}
            className="inline-flex min-h-8 items-center gap-1.5 text-[13px] text-muted hover:text-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />К пути
          </button>
          <h2 className="font-[family-name:var(--font-display)] text-[22px] font-medium leading-tight">Запись дубля</h2>
          <p className="text-sm text-muted">{scriptVersionId ? `По сценарию · ${versionLabel}` : "Без готового сценария"}</p>
        </header>
        <div className={`grid items-start gap-8 ${showScript ? "grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]" : "mx-auto max-w-[360px] grid-cols-1"}`}>
          {showScript ? (
            <section
              aria-label="Телесуфлёр"
              data-teleprompter
              className="relative min-h-[420px] rounded-[14px] border border-line bg-white/[0.02] px-10 pb-10 pt-12"
            >
              {scriptVersionId ? (
                <button
                  type="button"
                  onClick={() => setShowScript(false)}
                  className="absolute right-4 top-3 rounded-lg px-2.5 py-1 text-[13px] text-muted hover:bg-white/10 hover:text-text"
                >
                  Скрыть
                </button>
              ) : null}
              {scriptBody ? (
                <p className="max-h-[calc(100dvh-280px)] overflow-y-auto whitespace-pre-wrap font-[family-name:var(--font-display)] text-[28px] leading-[1.5]">
                  {scriptBody}
                </p>
              ) : (
                <p className="text-sm text-muted">
                  {scriptVersionId ? "Загружаем сценарий…" : "Можно говорить без готового сценария. Текст дубля появится после расшифровки."}
                </p>
              )}
            </section>
          ) : null}
          <aside aria-label="Управление записью" className="space-y-4">
            <div
              data-mic-viewport
              className="flex h-[120px] flex-col items-center justify-center gap-2.5 rounded-xl border border-line bg-white/[0.03] px-4 text-center"
            >
              <Mic className="h-6 w-6 text-accent-soft" strokeWidth={1.5} aria-hidden="true" />
              <p className="text-xs text-muted">{micState}</p>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-100"
                  style={{ width: phase === "recording" ? `${Math.max(6, level * 100)}%` : "0%" }}
                />
              </div>
            </div>
            {stage}
            {scriptVersionId && !showScript ? (
              <ActionButton variant="compact" onClick={() => setShowScript(true)}>
                Показать сценарий
              </ActionButton>
            ) : null}
          </aside>
        </div>
        {confirmModal}
      </section>
    );
  }

  return (
    <section className="flex min-h-[28rem] flex-col" aria-label="Запись дубля">
      <header className="space-y-1 border-b border-line pb-3">
        <p className="font-[family-name:var(--font-display)] text-xl">{thoughtTitle || "Мысль"}</p>
        <p className="text-sm text-muted">{scriptVersionId ? `По сценарию · ${versionLabel}` : "Запись без готового сценария"}</p>
        {scriptVersionId ? (
          <ActionButton variant="compact" onClick={() => setShowScript((value) => !value)}>
            {showScript ? "Скрыть сценарий" : "Показать сценарий"}
          </ActionButton>
        ) : null}
      </header>

      <div className={`min-h-0 flex-1 gap-4 overflow-hidden py-4 ${showScript ? "shell:grid shell:grid-cols-[minmax(0,1.7fr)_minmax(15rem,20rem)]" : ""}`}>
        {showScript ? (
          <div className="min-h-0 overflow-y-auto pr-1">
            {scriptBody ? (
              <p className="recording-script whitespace-pre-wrap">{scriptBody}</p>
            ) : (
              <p className="text-sm text-muted">
                {scriptVersionId ? "Загружаем сценарий…" : "Можно говорить без готового сценария. Текст дубля появится после расшифровки."}
              </p>
            )}
          </div>
        ) : null}
        <div className={showScript ? "mt-4 shrink-0 shell:mt-0" : ""}>{stage}</div>
      </div>

      {confirmModal}
    </section>
  );
}
