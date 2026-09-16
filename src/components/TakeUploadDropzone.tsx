"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_UPLOAD_MB } from "@/lib/constants";
import { clientThoughtMediaError } from "@/lib/media-session";
import {
  ABORT_TAKE_UPLOAD_LEAVE_TEXT,
  settleStudioTakeUpload,
} from "@/lib/recording-session";
import type { TakeInputType } from "@/types/reel";

export function TakeUploadDropzone({
  reelId,
  onUploaded,
  scriptVersionId,
  videoOnly = false,
  process = false,
  disabled = false,
  disabledReason,
}: {
  reelId: string;
  onUploaded: (info: { jobId: string | null }) => void;
  scriptVersionId?: string;
  videoOnly?: boolean;
  process?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [kind, setKind] = useState<Exclude<TakeInputType, "text">>("video");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      uploadAbortRef.current?.abort();
    };
  }, []);

  async function onFile(file: File | null) {
    if (!file || busy || disabled) return;
    const inputType = videoOnly ? "video" : kind;
    const local = clientThoughtMediaError(file, inputType, MAX_UPLOAD_MB);
    if (local) {
      setError(local);
      return;
    }
    setBusy(true);
    setError(null);
    const key = crypto.randomUUID();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    const form = new FormData();
    form.set("file", file);
    form.set("reelId", reelId);
    form.set("inputType", videoOnly ? "video" : kind);
    form.set("authorNote", note);
    form.set("idempotencyKey", key);
    if (scriptVersionId) form.set("scriptVersionId", scriptVersionId);
    if (process) form.set("process", "1");
    try {
      const outcome = await settleStudioTakeUpload({
        request: fetch("/api/uploads", {
          method: "POST",
          headers: { "Idempotency-Key": key },
          body: form,
          signal: controller.signal,
        }),
        signal: controller.signal,
        mounted: () => mountedRef.current,
        onSuccess: (jobId) => {
          setNote("");
          onUploadedRef.current({ jobId });
        },
      });
      if (outcome === "ignored") return;
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Ошибка загрузки.");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
      <p className="text-sm text-muted">
        {videoOnly
          ? "Снимите видео отдельно и загрузите файл. Камера в приложении не нужна."
          : "Готовый файл. Камера в браузере не нужна. Разбор ИИ с загрузки не запускается."}
      </p>
      {videoOnly ? null : (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setKind("video")}
          className={`rounded-full px-3 py-1 text-sm ${kind === "video" ? "bg-accent text-on-accent" : "bg-bg text-muted"}`}
        >
          Видео
        </button>
        <button
          type="button"
          onClick={() => setKind("audio")}
          className={`rounded-full px-3 py-1 text-sm ${kind === "audio" ? "bg-accent text-on-accent" : "bg-bg text-muted"}`}
        >
          Аудио
        </button>
      </div>
      )}
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Что менял (необязательно)"
        rows={2}
        className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none"
      />
      <input
        type="file"
        accept={
          !videoOnly && kind === "audio"
            ? "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm"
            : "video/*,.mp4,.webm,.mov,.mkv"
        }
        disabled={busy || disabled}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          void onFile(file);
        }}
      />
      {disabled && disabledReason ? <p className="text-sm text-muted">{disabledReason}</p> : null}
      {busy ? (
        <div className="space-y-1">
          <p className="text-sm text-muted">Загрузка…</p>
          <p className="text-xs text-muted">{ABORT_TAKE_UPLOAD_LEAVE_TEXT}</p>
        </div>
      ) : null}
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </div>
  );
}
