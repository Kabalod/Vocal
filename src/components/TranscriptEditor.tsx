"use client";

import { useCallback, useEffect, useState } from "react";
import type { TranscriptBundleDto, TranscriptRevisionDto } from "@/types/transcript";

function kindLabel(row: TranscriptRevisionDto) {
  if (row.kind === "original") return "Исходник";
  return "Правка";
}

export function TranscriptEditor({ takeId }: { takeId: string }) {
  const [bundle, setBundle] = useState<TranscriptBundleDto | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/takes/${takeId}/transcript`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить расшифровку.");
    const next = data.transcript as TranscriptBundleDto;
    setBundle(next);
    const selected = next.revisions.find((row) => row.id === next.selectedId) ?? next.revisions[0];
    setDraft(selected?.text ?? "");
  }, [takeId]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/takes/${takeId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить.");
      setBundle(data.transcript);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setSaving(false);
    }
  }

  async function select(selectedId: string) {
    setError(null);
    const res = await fetch(`/api/takes/${takeId}/transcript`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось выбрать версию.");
    const next = data.transcript as TranscriptBundleDto;
    setBundle(next);
    const selected = next.revisions.find((row) => row.id === selectedId);
    if (selected) setDraft(selected.text);
  }

  const original = bundle?.revisions.find((row) => row.id === bundle.originalId);

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
      <h3 className="font-medium">Расшифровка</h3>
      <p className="text-sm text-muted">
        Правка сохраняет исходник. Таймкоды относятся к исходной расшифровке, а не к отредактированному тексту.
        Сохранение не вызывает распознавание и не переписывает старый разбор.
      </p>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {bundle && bundle.revisions.length === 0 ? (
        <p className="text-sm text-muted">Пока нет сохранённого текста. Он появится после распознавания или из текста дубля.</p>
      ) : null}
      {bundle && bundle.revisions.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {bundle.revisions.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => void select(row.id).catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."))}
                className={`rounded-full px-3 py-1 text-sm ${
                  row.id === bundle.selectedId ? "bg-accent text-[#1a140c]" : "border border-line"
                }`}
              >
                {kindLabel(row)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {original ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Показать исходник</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-line bg-bg p-3">{original.text}</pre>
        </details>
      ) : null}
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={8}
        className="w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none"
        placeholder="Текст расшифровки"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !draft.trim()}
        className="rounded-full bg-accent px-4 py-2 text-sm text-[#1a140c] disabled:opacity-50"
      >
        {saving ? "Сохраняем…" : "Сохранить правку"}
      </button>
    </section>
  );
}
