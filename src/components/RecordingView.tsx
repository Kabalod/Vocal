"use client";

import { ArrowLeft, Mic, Square } from "lucide-react";
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
  /** Which action "Повторить" repeats after an error: asking for the microphone or saving the take. */
  const [retry, setRetry] = useState<"mic" | "save" | null>(null);
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
    setRetry(null);
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
      setRetry("mic");
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
    setRetry(null);
    const ext = blob.type.includes("mp4") ? "m4a" : "webm";
    const file = new File([blob], `take.${ext}`, { type: blob.type || "audio/webm" });
    const local = clientThoughtMediaError(file, "audio", MAX_UPLOAD_MB);
    if (local) {
      setPhase("preview");
      setError(local);
      setRetry("save");
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
      setRetry("save");
    }
  }

  const retryAction = retry ? (
    <ActionButton variant="secondary" onClick={() => void (retry === "mic" ? startRecording() : saveTake())}>
      Повторить
    </ActionButton>
  ) : undefined;

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

        {error ? <InlineError message={error} action={retryAction} /> : null}
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

  const waveBars = Array.from({ length: 27 }, (_, index) => {
    const shape = 0.35 + 0.65 * Math.abs(Math.sin(index * 0.9));
    return Math.max(4, Math.round(4 + level * 36 * shape));
  });
  const working = phase === "recording";
  const reviewing = phase === "preview" || phase === "saving";

  return (
    <section
      className="fixed inset-0 z-[45] flex flex-col bg-bg"
      aria-label="Запись дубля"
      data-recording-mobile
    >
      <header className="flex min-h-11 shrink-0 items-center gap-2 border-b border-line px-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={requestLeave}
          className="inline-flex min-h-11 min-w-11 items-center gap-0.5 px-2 text-base text-accent-soft"
        >
          <span aria-hidden="true" className="text-2xl leading-none">
            ‹
          </span>
          {phase === "recording" || reviewing ? "Отмена" : "К списку дублей"}
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[15px] font-semibold">{thoughtTitle || "Мысль"}</p>
          <p className="truncate text-xs text-muted">{scriptVersionId ? `По сценарию · ${versionLabel}` : "Запись без готового сценария"}</p>
        </div>
        {scriptVersionId ? (
          <button
            type="button"
            onClick={() => setShowScript((value) => !value)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-sm text-muted"
          >
            {showScript ? "Скрыть сценарий" : "Показать сценарий"}
          </button>
        ) : (
          <span className="min-w-11" />
        )}
      </header>

      <div data-teleprompter className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        {showScript ? (
          scriptBody ? (
            <p className="recording-script whitespace-pre-wrap font-[family-name:var(--font-literata)] text-[22px] leading-[1.5]">{scriptBody}</p>
          ) : (
            <p className="text-sm text-muted">
              {scriptVersionId ? "Загружаем сценарий…" : "Можно говорить без готового сценария. Текст дубля появится после расшифровки."}
            </p>
          )
        ) : null}
      </div>

      <div
        className="shrink-0 space-y-4 border-t border-line bg-bg px-5 pt-4"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        {error ? <InlineError message={error} action={retryAction} /> : null}

        {phase === "idle" || phase === "permission" ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              data-record-start
              aria-label="Начать запись"
              disabled={phase === "permission"}
              aria-busy={phase === "permission" || undefined}
              onClick={() => void startRecording()}
              className="grid h-20 w-20 place-items-center rounded-full bg-accent text-on-accent shadow-[var(--vocal-shadow-cta)] active:scale-95 disabled:opacity-60"
            >
              <Mic className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
            </button>
            <p className="text-sm text-muted" aria-live="polite">
              {phase === "permission" ? "Запрашиваем микрофон…" : "Начать запись"}
            </p>
          </div>
        ) : null}

        {working ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-3xl font-medium tabular-nums" aria-live="off" data-record-timer>
              {formatRecordingDuration(seconds)}
            </p>
            <div className="flex h-10 items-center justify-center gap-[3px]" aria-hidden="true" data-record-wave>
              {waveBars.map((height, index) => (
                <span key={index} className="w-[3px] rounded-full bg-accent transition-[height] duration-100" style={{ height }} />
              ))}
            </div>
            <button
              type="button"
              data-record-stop
              aria-label="Завершить запись"
              onClick={finishRecording}
              className="grid h-20 w-20 place-items-center rounded-full bg-bad text-white active:scale-95"
            >
              <Square className="h-7 w-7 fill-current" strokeWidth={0} aria-hidden="true" />
            </button>
            <p className="text-sm text-bad">Стоп</p>
          </div>
        ) : null}

        {reviewing ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Запись {formatRecordingDuration(seconds)}</p>
            {previewUrlRef.current ? <audio controls src={previewUrlRef.current} className="w-full" /> : null}
            <ActionButton variant="primary" fullWidth loading={phase === "saving"} loadingLabel="Сохраняем…" onClick={() => void saveTake()}>
              Сохранить дубль
            </ActionButton>
            <ActionButton variant="secondary" fullWidth onClick={requestLeave}>
              Отменить
            </ActionButton>
          </div>
        ) : null}

        {phase === "saved" ? (
          <div className="space-y-3">
            <p className="text-sm text-text">Дубль сохранён. Следим за расшифровкой в списке дублей.</p>
            <ActionButton variant="primary" fullWidth onClick={onClose}>
              К списку дублей
            </ActionButton>
          </div>
        ) : null}
      </div>

      {confirmModal}
    </section>
  );
}
