"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_UPLOAD_MB, MAX_VIDEO_SECONDS } from "@/lib/constants";

const ACCEPT = ".mp4,.webm,.mov,.mkv,video/mp4,video/webm,video/quicktime";

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        setError(`Файл больше ${MAX_UPLOAD_MB} МБ.`);
        return;
      }

      setBusy(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Не удалось загрузить.");
        }
        router.push(`/jobs/${data.job.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки.");
        setBusy(false);
      }
    },
    [router],
  );

  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const file = e.dataTransfer.files[0];
          if (file) void onFile(file);
        }}
        className={`w-full rounded-3xl border border-dashed px-6 py-16 text-center transition ${
          drag
            ? "border-accent bg-accent-dim"
            : "border-line bg-bg-elev hover:border-accent/50"
        } ${busy ? "opacity-60" : ""}`}
      >
        <p className="font-[family-name:var(--font-display)] text-3xl">
          {busy ? "Загружаем…" : "Перетащите видео сюда"}
        </p>
        <p className="mt-3 text-sm text-muted">
          mp4, webm, mov, mkv · до {MAX_VIDEO_SECONDS / 60} минут · до {MAX_UPLOAD_MB}{" "}
          МБ
        </p>
        <span className="mt-6 inline-block rounded-full bg-accent px-5 py-2 text-sm font-medium text-on-accent">
          Выбрать файл
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      {error ? (
        <p className="rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}
