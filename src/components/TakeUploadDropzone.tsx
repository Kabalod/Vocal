"use client";

import { useState } from "react";
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

  async function onFile(file: File | null) {
    if (!file || busy || disabled) return;
    setBusy(true);
    setError(null);
    const key = crypto.randomUUID();
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("reelId", reelId);
      form.set("inputType", videoOnly ? "video" : kind);
      form.set("authorNote", note);
      form.set("idempotencyKey", key);
      if (scriptVersionId) form.set("scriptVersionId", scriptVersionId);
      if (process) form.set("process", "1");
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: form,
      });
      const data = (await res.json()) as { error?: string; job?: { id?: string } };
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить файл.");
      setNote("");
      onUploaded({ jobId: typeof data.job?.id === "string" ? data.job.id : null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки.");
    } finally {
      setBusy(false);
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
      {busy ? <p className="text-sm text-muted">Загрузка…</p> : null}
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </div>
  );
}
