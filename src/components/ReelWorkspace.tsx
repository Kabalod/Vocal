"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { REEL_STATUS_LABELS, REEL_STATUSES, type ReelDto, type ReelStatus } from "@/types/reel";

type SaveState = "idle" | "saving" | "saved" | "error";

export function ReelWorkspace({ id }: { id: string }) {
  const [reel, setReel] = useState<ReelDto | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<ReelStatus>("idea");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const seq = useRef(0);
  const noteTimer = useRef<number | null>(null);

  const applyReel = useCallback((next: ReelDto) => {
    setReel(next);
    setTitle(next.title);
    setNote(next.initialNote);
    setStatus(next.status);
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(`/api/reels/${id}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Карточка не найдена.");
    applyReel(data.reel as ReelDto);
  }, [applyReel, id]);

  useEffect(() => {
    void load().catch((err: unknown) => {
      setLoadError(err instanceof Error ? err.message : "Ошибка.");
    });
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    if (!reel) return;
    const requestId = ++seq.current;
    setSaveState("saving");
    setSaveError(null);
    const res = await fetch(`/api/reels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, expectedUpdatedAt: reel.updatedAt }),
    });
    const data = await res.json();
    if (requestId !== seq.current) return;
    if (!res.ok) {
      setSaveState("error");
      setSaveError(data.error ?? "Не удалось сохранить.");
      if (res.status === 409) {
        try {
          await load();
        } catch {
          /* оставляем ошибку сохранения */
        }
      }
      return;
    }
    applyReel(data.reel as ReelDto);
    setSaveState("saved");
  }

  function scheduleNoteSave(value: string) {
    if (noteTimer.current) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => {
      void patch({ initialNote: value });
    }, 450);
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-bad">{loadError}</p>
        <Link href="/reels" className="text-sm text-accent">
          К списку
        </Link>
      </div>
    );
  }

  if (!reel) {
    return <p className="text-muted">Загрузка…</p>;
  }

  const saveLabel =
    saveState === "saving"
      ? "Сохраняется…"
      : saveState === "saved"
        ? "Сохранено"
        : saveState === "error"
          ? saveError ?? "Ошибка сохранения"
          : "Изменения ещё не отправлялись";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/reels" className="text-sm text-muted hover:text-text">
          ← Мои ролики
        </Link>
        <p className={`text-sm ${saveState === "error" ? "text-bad" : "text-muted"}`}>{saveLabel}</p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm text-muted">Название</span>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaveState("idle");
          }}
          onBlur={() => {
            if (title.trim() !== reel.title) void patch({ title });
          }}
          className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 text-xl outline-none focus:border-accent/50"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm text-muted">Заметка</span>
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setSaveState("idle");
            scheduleNoteSave(e.target.value);
          }}
          rows={8}
          className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 outline-none focus:border-accent/50"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm text-muted">Статус</span>
        <select
          value={status}
          onChange={(e) => {
            const next = e.target.value as ReelStatus;
            setStatus(next);
            void patch({ status: next });
          }}
          className="rounded-xl border border-line bg-bg-elev px-3 py-2 outline-none"
        >
          {REEL_STATUSES.map((item) => (
            <option key={item} value={item}>
              {REEL_STATUS_LABELS[item]}
            </option>
          ))}
        </select>
      </label>

      <p className="text-sm text-muted">Дублей: {reel.takeCount}. Финальный дубль выбирается позже, когда появятся материалы.</p>
      <p className="text-sm text-muted">
        Расшифровка, вопросы и сценарий — следующие этапы. Здесь они не включены и не имитируются.
      </p>
    </div>
  );
}
