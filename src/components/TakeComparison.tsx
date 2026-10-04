"use client";

import { useCallback, useEffect, useState } from "react";
import type { CompareDto } from "@/types/compare";
import type { ReelDto } from "@/types/reel";
import type { TextDiffDto } from "@/lib/text-diff";
import type { TranscriptBundleDto } from "@/types/transcript";

export function TakeComparison({ reelId }: { reelId: string }) {
  const [reel, setReel] = useState<ReelDto | null>(null);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [leftRev, setLeftRev] = useState("");
  const [rightRev, setRightRev] = useState("");
  const [leftBundle, setLeftBundle] = useState<TranscriptBundleDto | null>(null);
  const [rightBundle, setRightBundle] = useState<TranscriptBundleDto | null>(null);
  const [preview, setPreview] = useState<TextDiffDto | null>(null);
  const [intent, setIntent] = useState("");
  const [history, setHistory] = useState<CompareDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadReel = useCallback(async () => {
    const res = await fetch(`/api/reels/${reelId}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить карточку.");
    setReel(data.reel as ReelDto);
  }, [reelId]);

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/reels/${reelId}/compare`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить сравнения.");
    setHistory(data.comparisons as CompareDto[]);
  }, [reelId]);

  useEffect(() => {
    void Promise.all([loadReel(), loadHistory()]).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Ошибка.");
    });
  }, [loadHistory, loadReel]);

  async function loadBundle(takeId: string, side: "left" | "right") {
    if (!takeId) return;
    const res = await fetch(`/api/takes/${takeId}/transcript`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить текст.");
    const bundle = data.transcript as TranscriptBundleDto;
    if (side === "left") {
      setLeftBundle(bundle);
      setLeftRev(bundle.selectedId ?? bundle.revisions[0]?.id ?? "");
    } else {
      setRightBundle(bundle);
      setRightRev(bundle.selectedId ?? bundle.revisions[0]?.id ?? "");
    }
  }

  async function loadPreview() {
    if (!leftId || !rightId) return;
    setError(null);
    const params = new URLSearchParams({
      leftTakeId: leftId,
      rightTakeId: rightId,
      leftTranscriptId: leftRev,
      rightTranscriptId: rightRev,
    });
    const res = await fetch(`/api/reels/${reelId}/compare?${params}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось сравнить тексты.");
    setPreview(data.textDiff as TextDiffDto);
  }

  async function saveCompare(runAi: boolean) {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/reels/${reelId}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leftTakeId: leftId,
          rightTakeId: rightId,
          leftTranscriptId: leftRev,
          rightTranscriptId: rightRev,
          intent,
          runAi,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить сравнение.");
      await loadHistory();
      if (data.comparison?.textDiff) setPreview(data.comparison.textDiff as TextDiffDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setRunning(false);
    }
  }

  async function setFinal(takeId: string | null) {
    if (!reel) return;
    const freshRes = await fetch(`/api/reels/${reelId}`, { cache: "no-store" });
    const fresh = await freshRes.json();
    const expectedUpdatedAt = (fresh.reel as { updatedAt?: string } | undefined)?.updatedAt ?? reel.updatedAt;
    const res = await fetch(`/api/reels/${reelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finalTakeId: takeId, expectedUpdatedAt }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Не удалось выбрать финальный дубль.");
      return;
    }
    setReel(data.reel);
  }

  async function downloadExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reels/${reelId}/export`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось экспортировать.");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reel-${reelId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setExporting(false);
    }
  }

  const takes = reel?.takes ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Сравнение и экспорт</h2>
          <p className="text-sm text-muted">
            Текстовые правки считает обычный код. Смысловое сравнение моделью отсюда не запускается. Финал выбираете вы.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void downloadExport()}
          disabled={exporting}
          className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50"
        >
          {exporting ? "Экспорт…" : "Экспорт карточки"}
        </button>
      </div>
      {error ? <p className="text-bad">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-muted">
          Дубль A
          <select
            value={leftId}
            onChange={(event) => {
              const id = event.target.value;
              setLeftId(id);
              void loadBundle(id, "left").catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
            }}
            className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2"
          >
            <option value="">Выберите</option>
            {takes.map((take) => (
              <option key={take.id} value={take.id}>
                №{take.number}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted">
          Дубль B
          <select
            value={rightId}
            onChange={(event) => {
              const id = event.target.value;
              setRightId(id);
              void loadBundle(id, "right").catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
            }}
            className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2"
          >
            <option value="">Выберите</option>
            {takes.map((take) => (
              <option key={take.id} value={take.id}>
                №{take.number}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted">
          Версия текста A
          <select
            value={leftRev}
            onChange={(event) => setLeftRev(event.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2"
          >
            {(leftBundle?.revisions ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.kind} · {row.createdAt}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-muted">
          Версия текста B
          <select
            value={rightRev}
            onChange={(event) => setRightRev(event.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2"
          >
            {(rightBundle?.revisions ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.kind} · {row.createdAt}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input
        value={intent}
        onChange={(event) => setIntent(event.target.value)}
        placeholder="Цель правки (для смыслового сравнения)"
        className="w-full rounded-xl border border-line bg-bg px-3 py-2"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void loadPreview().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."))}
          disabled={!leftId || !rightId}
          className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50"
        >
          Показать правки
        </button>
        <button
          type="button"
          onClick={() => void saveCompare(false)}
          disabled={running || !leftId || !rightId}
          className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50"
        >
          Сохранить текстовое сравнение
        </button>
      </div>
      {preview ? (
        <div className="rounded-2xl border border-line bg-bg-elev p-4 text-sm">
          {preview.truncated ? <p className="text-bad">Сравнение усечено.</p> : null}
          <p className="text-muted">{preview.note}</p>
          <p className="mt-2 whitespace-pre-wrap">
            {preview.chunks.map((chunk, index) => (
              <span
                key={`${chunk.op}-${index}`}
                className={
                  chunk.op === "add" ? "bg-green-900/40" : chunk.op === "del" ? "bg-red-900/40 line-through" : undefined
                }
              >
                {chunk.text}
              </span>
            ))}
          </p>
        </div>
      ) : null}
      {reel ? (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-muted">Итоговый дубль:</span>
          <button type="button" className="rounded-full border border-line px-3 py-1" onClick={() => void setFinal(null)}>
            Снять
          </button>
          {takes.map((take) => (
            <button
              key={take.id}
              type="button"
              className={`rounded-full border px-3 py-1 ${reel.finalTakeId === take.id ? "border-accent" : "border-line"}`}
              onClick={() => void setFinal(take.id)}
            >
              №{take.number}
            </button>
          ))}
        </div>
      ) : null}
      <ul className="space-y-2 text-sm">
        {history.map((item) => (
          <li key={item.id} className="rounded-xl border border-line p-3">
            <p>
              {item.leftTakeId.slice(0, 6)} ↔ {item.rightTakeId.slice(0, 6)} · {item.intent || "без цели"}
            </p>
            {item.semantic ? (
              <p className="text-muted">
                Мысль сохранена: {item.semantic.thoughtPreserved ? "да" : "нет"}
                {item.intent ? ` · намерение: ${item.semantic.intentMet == null ? "неясно" : item.semantic.intentMet ? "да" : "нет"}` : ""}
              </p>
            ) : (
              <p className="text-muted">Только текстовые правки, без выбора победителя.</p>
            )}
            {item.errorMessage ? <p className="text-bad">{item.errorMessage}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
