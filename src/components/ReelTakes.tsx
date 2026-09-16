"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { TakeList } from "@/components/TakeList";
import { TakePlayer } from "@/components/TakePlayer";
import { TakeUploadDropzone } from "@/components/TakeUploadDropzone";
import { TranscriptEditor } from "@/components/TranscriptEditor";
import { QuestionList } from "@/components/QuestionList";
import { ReviewPanel } from "@/components/ReviewPanel";
import { ShellEmpty, ShellError, ShellLoading } from "@/components/shell-status";
import type { ReelDto, TakeDto } from "@/types/reel";

type ReelTakesSlots = {
  media: ReactNode;
  vocal: ReactNode;
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
}) {
  const [reel, setReel] = useState<ReelDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTake, setDetailTake] = useState<TakeDto | null>(null);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [seekInput, setSeekInput] = useState("0");
  const [textBody, setTextBody] = useState("");
  const [textNote, setTextNote] = useState("");
  const [savingText, setSavingText] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reels/${reelId}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить дубли.");
    const next = data.reel as ReelDto;
    setReel(next);
    setViewingId((current) => {
      if (current && next.takes.some((take) => take.id === current)) return current;
      return current;
    });
  }, [reelId]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, [load, reloadToken]);

  useEffect(() => {
    if (!viewingId || !detailOpen) {
      setDetailTake(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/takes/${viewingId}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { take?: TakeDto; error?: string }) => {
        if (cancelled) return;
        if (data.take) setDetailTake(data.take);
        else setError(data.error ?? "Не удалось открыть дубль.");
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось открыть дубль.");
      });
    return () => {
      cancelled = true;
    };
  }, [viewingId, detailOpen]);

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
    const pending = error ? <ShellError message={error} /> : <ShellLoading label="Загрузка попыток…" />;
    if (children) return <>{children({ media: pending, vocal: pending })}</>;
    return pending;
  }

  const list = (
    <div className={detailOpen ? "hidden shell:block" : ""}>
      <TakeList
        reel={reel}
        viewingId={viewingId}
        onView={(id) => {
          setViewingId(id);
          setDetailOpen(true);
        }}
        locked={thoughtCompleted}
        onFinal={(id) => void setFinal(id)}
        onNote={(id, note) => void saveNote(id, note)}
      />
    </div>
  );

  const detail = detailOpen ? (
    <div className="space-y-4">
      <ActionButton variant="secondary" className="shell:hidden" onClick={() => setDetailOpen(false)}>
        ← К списку дублей
      </ActionButton>
      <TakePlayer take={detailTake} seekTo={seekTo} />
      {detailTake ? <TranscriptEditor key={detailTake.id} takeId={detailTake.id} /> : null}
      {detailTake && detailTake.inputType !== "text" && detailTake.browserPlayback ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const sec = Number(seekInput.replace(",", "."));
            if (Number.isFinite(sec) && sec >= 0) setSeekTo(sec);
          }}
        >
          <label className="text-sm text-muted">
            Таймкод, сек
            <input
              value={seekInput}
              onChange={(event) => setSeekInput(event.target.value)}
              className="ml-2 w-24 rounded-lg border border-line bg-bg px-2 py-1"
            />
          </label>
          <button type="submit" className="vocal-btn vocal-btn-primary text-sm">
            К таймкоду
          </button>
        </form>
      ) : null}
    </div>
  ) : (
    <p className="hidden text-sm text-muted shell:block">Выберите дубль в списке.</p>
  );

  const vocal = (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Vocal</h2>
        <p className="text-sm text-muted">Вопросы и разбор по выбранному дублю. Обычные ответы не вызывают ИИ.</p>
      </div>
      {error ? <p className="text-bad">{error}</p> : null}
      {detailTake ? (
        <ReviewPanel key={`review-${detailTake.id}`} takeId={detailTake.id} />
      ) : (
        <ShellEmpty title="Нет дубля" description="Откройте попытку — разбор появится рядом." />
      )}
      <QuestionList reelId={reelId} takeId={viewingId} />
    </div>
  );

  const media = (
    <section className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Попытки</h2>
        <p className="text-sm text-muted">
          Новый дубль не заменяет старый и не становится итоговым сам. Дубль №1 — исходная мысль.
        </p>
      </div>
      {error ? <p className="text-bad">{error}</p> : null}
      <div className="grid gap-6 shell:grid-cols-[minmax(16rem,20rem)_1fr]">
        {list}
        {detail}
      </div>
      <div className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
        <p className="text-sm text-muted">Новый дубль — голос или загруженное видео. Текстовый сценарий пишется в черновике.</p>
        <ActionButton
          variant="primary"
          disabled={!canRecord || thoughtCompleted}
          disabledReason={
            thoughtCompleted ? "Сначала верните мысль в работу" : !canRecord ? recordBlockedReason : undefined
          }
          onClick={onStartVoiceRecord}
        >
          Записать дубль
        </ActionButton>
        <TakeUploadDropzone
          reelId={reelId}
          videoOnly
          process
          scriptVersionId={recordScriptId ?? undefined}
          disabled={!canRecord || thoughtCompleted}
          disabledReason={
            thoughtCompleted ? "Сначала верните мысль в работу" : recordBlockedReason
          }
          onUploaded={(info) => {
            void load();
            if (info.jobId) onTakeJobStarted?.(info.jobId);
          }}
        />
      </div>
      {reel.takes.length === 0 ? (
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
      ) : null}
    </section>
  );

  if (children) return <>{children({ media, vocal })}</>;
  return (
    <div className="space-y-8">
      {media}
      {vocal}
    </div>
  );
}
