"use client";

import { useCallback, useEffect, useState } from "react";
import { CanonicalExportActions } from "@/components/CanonicalExportActions";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { sanitizeExportFilename } from "@/lib/canonical-export";
import { thoughtCompletionGate } from "@/lib/thought-completion";
import { TAKE_INPUT_TYPE_LABELS, type ReelDto } from "@/types/reel";

export function CompletionSummary({
  reelId,
  reloadToken = 0,
  onPickTake,
  onStatusChange,
}: {
  reelId: string;
  reloadToken?: number;
  onPickTake: () => void;
  onPickScript?: () => void;
  onStatusChange?: (status: ReelDto["status"]) => void;
}) {
  const [reel, setReel] = useState<ReelDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportText, setExportText] = useState("");
  const [exportName, setExportName] = useState("mysl.txt");

  const load = useCallback(async () => {
    const reelRes = await fetch(`/api/reels/${reelId}`, { cache: "no-store" });
    const reelData = (await reelRes.json()) as { reel?: ReelDto; error?: string };
    if (!reelRes.ok || !reelData.reel) throw new Error(reelData.error ?? "Не удалось загрузить мысль.");
    setReel(reelData.reel);
    onStatusChange?.(reelData.reel.status);
    if (reelData.reel.finalTakeId) {
      const exportRes = await fetch(`/api/reels/${reelId}/export?format=txt`, { cache: "no-store" });
      if (exportRes.ok) {
        setExportText(await exportRes.text());
        setExportName(sanitizeExportFilename(reelData.reel.title));
      } else {
        setExportText("");
      }
    } else {
      setExportText("");
    }
  }, [onStatusChange, reelId]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, [load, reloadToken]);

  async function patchStatus(status: "completed" | "in_progress") {
    if (!reel || busy) return;
    setBusy(true);
    setError(null);
    try {
      const freshRes = await fetch(`/api/reels/${reelId}`, { cache: "no-store" });
      const fresh = await freshRes.json();
      const expectedUpdatedAt = (fresh.reel as ReelDto | undefined)?.updatedAt ?? reel.updatedAt;
      const res = await fetch(`/api/reels/${reelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, expectedUpdatedAt }),
      });
      const data = (await res.json()) as { reel?: ReelDto; error?: string };
      if (!res.ok || !data.reel) throw new Error(data.error ?? "Не удалось изменить статус.");
      setReel(data.reel);
      onStatusChange?.(data.reel.status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setBusy(false);
    }
  }

  if (!reel) return null;

  const take = reel.takes.find((row) => row.id === reel.finalTakeId) ?? null;
  const hasFinalText = Boolean(exportText.trim());
  const gate = thoughtCompletionGate({
    finalTakeId: reel.finalTakeId,
    hasFinalText: reel.finalTakeId ? hasFinalText : undefined,
    status: reel.status,
  });
  const takeLabel = take
    ? `№${take.number}${take.number === 1 ? " · исходная мысль" : ""} · ${TAKE_INPUT_TYPE_LABELS[take.inputType]}`
    : "не выбран";

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4" aria-label="Завершение мысли">
      <h3 className="font-[family-name:var(--font-display)] text-xl">Завершение</h3>
      <p className="text-sm">
        Итоговый дубль: {takeLabel}{" "}
        <button type="button" className="text-accent underline" onClick={onPickTake}>
          {take ? "открыть" : "выбрать"}
        </button>
      </p>
      {exportText ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Итоговый текст</p>
          <p className="whitespace-pre-wrap text-sm text-muted">{exportText.slice(0, 500)}</p>
        </div>
      ) : (
        <p className="text-sm text-muted">Итоговый текст появится после выбора дубля с расшифровкой.</p>
      )}
      <p className="text-sm text-muted">Завершить мысль — закончить работу в Vocal, не публикация ролика.</p>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {exportText ? <CanonicalExportActions filename={exportName} text={exportText} /> : null}
      {gate.isCompleted ? (
        <div className="space-y-2">
          <p className="text-sm">Мысль успешно завершена. Итоги сохранены.</p>
          <ActionButton variant="secondary" disabled={busy} onClick={() => void patchStatus("in_progress")}>
            Вернуть в работу
          </ActionButton>
        </div>
      ) : (
        <ActionButton
          variant="primary"
          disabled={!gate.canComplete || busy}
          disabledReason={!gate.canComplete ? gate.blockedReason : undefined}
          onClick={() => void patchStatus("completed")}
        >
          Завершить мысль
        </ActionButton>
      )}
    </section>
  );
}
