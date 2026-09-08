"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { TakeList } from "@/components/TakeList";
import { TakePlayer } from "@/components/TakePlayer";
import { TakeUploadDropzone } from "@/components/TakeUploadDropzone";
import { TranscriptEditor } from "@/components/TranscriptEditor";
import { QuestionList } from "@/components/QuestionList";
import { ReviewPanel } from "@/components/ReviewPanel";
import { ShellEmpty, ShellError, ShellLoading } from "@/components/shell-status";
import type { ReelDto } from "@/types/reel";

type ReelTakesSlots = {
  media: ReactNode;
  vocal: ReactNode;
};

export function ReelTakes({
  reelId,
  children,
}: {
  reelId: string;
  children?: (slots: ReelTakesSlots) => ReactNode;
}) {
  const [reel, setReel] = useState<ReelDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [seekInput, setSeekInput] = useState("0");
  const [textBody, setTextBody] = useState("");
  const [textNote, setTextNote] = useState("");
  const [scriptVersionId, setScriptVersionId] = useState("");
  const [scriptOptions, setScriptOptions] = useState<{ id: string; label: string }[]>([]);
  const [savingText, setSavingText] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reels/${reelId}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить дубли.");
    const next = data.reel as ReelDto;
    setReel(next);
    const scriptsRes = await fetch(`/api/reels/${reelId}/scripts`, { cache: "no-store" });
    if (scriptsRes.ok) {
      const scripts = (await scriptsRes.json()) as { versions?: { id: string; kind: string; createdAt: string }[] };
      setScriptOptions(
        (scripts.versions ?? [])
          .filter((row) => row.kind !== "ai_proposal")
          .map((row) => ({ id: row.id, label: `${row.kind} · ${row.createdAt}` })),
      );
    }
    setViewingId((current) => {
      if (current && next.takes.some((take) => take.id === current)) return current;
      return next.takes[0]?.id ?? null;
    });
  }, [reelId]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, [load]);

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
    const res = await fetch(`/api/reels/${reelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedTakeId: takeId, expectedUpdatedAt: reel.updatedAt }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Не удалось отметить финальный дубль.");
      return;
    }
    setReel(data.reel);
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
          scriptVersionId: scriptVersionId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить текст.");
      setTextBody("");
      setTextNote("");
      await load();
      if (data.take?.id) setViewingId(data.take.id);
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

  const viewing = reel.takes.find((take) => take.id === viewingId) ?? null;

  const vocal = (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Vocal</h2>
        <p className="text-sm text-muted">Вопросы и разбор по выбранному дублю. Обычные ответы не вызывают ИИ.</p>
      </div>
      {error ? <p className="text-bad">{error}</p> : null}
      {viewing ? (
        <ReviewPanel key={`review-${viewing.id}`} takeId={viewing.id} />
      ) : (
        <ShellEmpty title="Нет дубля" description="Добавьте попытку — разбор появится рядом." />
      )}
      <QuestionList reelId={reelId} takeId={viewingId} />
    </div>
  );

  const media = (
    <section className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Попытки</h2>
        <p className="text-sm text-muted">
          Новый дубль не заменяет старый и не становится финальным сам. Расшифровку можно править версиями; распознавание
          речи по-прежнему запускается отдельно через задачу обработки.
        </p>
      </div>
      {error ? <p className="text-bad">{error}</p> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
        <TakeList
          reel={reel}
          viewingId={viewingId}
          onView={setViewingId}
          onFinal={(id) => void setFinal(id)}
          onNote={(id, note) => void saveNote(id, note)}
        />
        <div className="space-y-4">
          <TakePlayer take={viewing} seekTo={seekTo} />
          {viewing ? <TranscriptEditor key={viewing.id} takeId={viewing.id} /> : null}
          {viewing && viewing.inputType !== "text" && viewing.browserPlayback ? (
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
      </div>
      <TakeUploadDropzone reelId={reelId} onUploaded={() => void load()} />
      <form onSubmit={addText} className="space-y-3 p-1">
        <p className="text-sm text-muted">Текстовая попытка. Текст сразу сохраняется как исходная версия расшифровки.</p>
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
        <label className="block text-sm text-muted">
          Сценарий этой попытки
          <select
            value={scriptVersionId}
            onChange={(event) => setScriptVersionId(event.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2"
          >
            <option value="">Без привязки</option>
            {scriptOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={savingText || !textBody.trim()}
          className="vocal-btn vocal-btn-primary disabled:opacity-50"
        >
          {savingText ? "Сохраняем…" : "Добавить текст"}
        </button>
      </form>
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
