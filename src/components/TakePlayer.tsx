"use client";

import { useEffect, useRef } from "react";
import { playbackHint } from "@/lib/take-playback";
import type { TakeDto } from "@/types/reel";

export function TakePlayer({ take, seekTo }: { take: TakeDto | null; seekTo: number | null }) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  useEffect(() => {
    if (seekTo == null || !mediaRef.current) return;
    mediaRef.current.currentTime = seekTo;
    void mediaRef.current.play().catch(() => undefined);
  }, [seekTo, take?.id]);

  if (!take) {
    return <p className="text-sm text-muted">Выберите попытку слева.</p>;
  }

  if (take.inputType === "text") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted">Текстовая попытка №{take.number}. Это не видео.</p>
        <pre className="whitespace-pre-wrap rounded-xl border border-line bg-bg p-3 text-sm">{take.bodyText}</pre>
      </div>
    );
  }

  if (take.mediaStatus === "failed") {
    return <p className="text-bad">Загрузка не записалась. Файл не сохранён как успешный. Загрузите снова.</p>;
  }
  if (take.mediaStatus === "pending" || !take.hasFile || !take.mediaUrl) {
    return <p className="text-muted">Файл этой попытки ещё не готов.</p>;
  }

  const hint = playbackHint(take.inputType, take.originalName, take.hasFile);

  if (!take.browserPlayback) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-bad">{hint}</p>
        {take.downloadUrl ? (
          <a href={take.downloadUrl} className="inline-block rounded-full bg-accent px-4 py-2 text-sm text-[#1a140c]">
            Скачать исходник
          </a>
        ) : null}
      </div>
    );
  }

  if (take.inputType === "audio") {
    return (
      <div className="space-y-3">
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          key={take.id}
          src={take.mediaUrl}
          controls
          className="w-full"
        />
        {take.downloadUrl ? (
          <a href={take.downloadUrl} className="text-sm text-accent">
            Скачать исходник
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <video
        ref={mediaRef as React.RefObject<HTMLVideoElement>}
        key={take.id}
        src={take.mediaUrl}
        controls
        className="w-full rounded-xl bg-black"
      />
      {take.downloadUrl ? (
        <a href={take.downloadUrl} className="text-sm text-accent">
          Скачать исходник
        </a>
      ) : null}
    </div>
  );
}
