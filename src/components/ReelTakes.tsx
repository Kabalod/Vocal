"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { TakesPathDesktop } from "@/components/TakesPathDesktop";
import { TakesPathMobile } from "@/components/TakesPathMobile";
import { TakeUploadDropzone } from "@/components/TakeUploadDropzone";
import { ShellError, ShellLoading } from "@/components/shell-status";
import type { ReelDto } from "@/types/reel";

type ReelTakesSlots = {
  media: ReactNode;
};

export function ReelTakes({
  reelId,
  children,
  onStartVoiceRecord,
  canRecord = false,
  recordBlockedReason,
  recordScriptId,
  onTakeJobStarted,
  reloadToken = 0,
  thoughtCompleted = false,
  onChanged,
  desktop = false,
}: {
  reelId: string;
  children?: (slots: ReelTakesSlots) => ReactNode;
  onStartVoiceRecord?: () => void;
  canRecord?: boolean;
  recordBlockedReason?: string;
  recordScriptId?: string | null;
  onTakeJobStarted?: (jobId: string) => void;
  reloadToken?: number;
  thoughtCompleted?: boolean;
  onChanged?: () => void;
  /** P3b: the zig-zag path of takes from the desktop shell breakpoint. */
  desktop?: boolean;
}) {
  const [reel, setReel] = useState<ReelDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [textBody, setTextBody] = useState("");
  const [textNote, setTextNote] = useState("");
  const [savingText, setSavingText] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reels/${reelId}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить дубли.");
    const next = data.reel as ReelDto;
    setReel(next);
  }, [reelId]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, [load, reloadToken]);

  async function saveNote(takeId: string, authorNote: string) {
    const res = await fetch(`/api/takes/${takeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorNote }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Не удалось сохранить заметку.");
      return;
    }
    await load();
  }

  async function setFinal(takeId: string | null) {
    if (!reel) return;
    const freshRes = await fetch(`/api/reels/${reelId}`, { cache: "no-store" });
    const fresh = await freshRes.json();
    const expectedUpdatedAt = (fresh.reel as ReelDto | undefined)?.updatedAt ?? reel.updatedAt;
    const res = await fetch(`/api/reels/${reelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finalTakeId: takeId, expectedUpdatedAt }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Не удалось отметить итоговый дубль.");
      return;
    }
    setReel(data.reel);
    onChanged?.();
  }

  async function addText(event: React.FormEvent) {
    event.preventDefault();
    if (!textBody.trim() || savingText) return;
    setSavingText(true);
    setError(null);
    try {
      const res = await fetch(`/api/reels/${reelId}/takes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputType: "text",
          bodyText: textBody,
          authorNote: textNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить текст.");
      setTextBody("");
      setTextNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setSavingText(false);
    }
  }

  if (!reel) {
    const pending = error ? <ShellError message={error} onRetry={() => void load()} /> : <ShellLoading label="Загрузка попыток…" />;
    if (children) return <>{children({ media: pending })}</>;
    return pending;
  }

  const textForm =
    reel.takes.length === 0 ? (
        <form onSubmit={addText} className="space-y-3 p-1">
          <p className="text-sm text-muted">Если мысль ещё текстом — это дубль №1. Дальше только голос или видео.</p>
          <textarea
            value={textBody}
            onChange={(event) => setTextBody(event.target.value)}
            rows={5}
            placeholder="Текст дубля"
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none"
          />
          <input
            value={textNote}
            onChange={(event) => setTextNote(event.target.value)}
            placeholder="Что менял"
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none"
          />
          <button
            type="submit"
            disabled={savingText || !textBody.trim()}
            className="vocal-btn vocal-btn-primary disabled:opacity-50"
          >
            {savingText ? "Сохраняем…" : "Добавить исходный текст"}
          </button>
        </form>
    ) : null;

  const pathMedia = (
    <div className="space-y-6" data-takes-desktop={desktop || undefined} data-takes-touch={desktop ? undefined : true}>
      {error ? <p className="text-bad">{error}</p> : null}
      {(() => {
        const Path = desktop ? TakesPathDesktop : TakesPathMobile;
        return (
          <Path
            reel={reel}
            locked={thoughtCompleted}
            canRecord={canRecord}
            recordBlockedReason={recordBlockedReason}
            onRecord={() => onStartVoiceRecord?.()}
            onFinal={(id) => void setFinal(id)}
            onNote={(id, note) => void saveNote(id, note)}
            onDeleted={() => {
              void load();
              onChanged?.();
            }}
          />
        );
      })()}
      <details className="rounded-2xl border border-line bg-bg-elev p-4 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center text-muted">Загрузить видео вместо записи</summary>
        <div className="mt-3">
          <TakeUploadDropzone
            reelId={reelId}
            videoOnly
            process
            scriptVersionId={recordScriptId ?? undefined}
            disabled={!canRecord || thoughtCompleted}
            disabledReason={thoughtCompleted ? "Сначала верните мысль в работу" : recordBlockedReason}
            onUploaded={(info) => {
              void load();
              if (info.jobId) onTakeJobStarted?.(info.jobId);
            }}
          />
        </div>
      </details>
      {textForm}
    </div>
  );

  const mediaNode = pathMedia;
  if (children) return <>{children({ media: mediaNode })}</>;
  return <div className="space-y-8">{mediaNode}</div>;
}
