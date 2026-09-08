"use client";

import { useCallback, useEffect, useState } from "react";
import { RecordingCard } from "@/components/RecordingCard";
import { ScriptVersionList, versionById } from "@/components/ScriptVersionList";
import {
  emptyRecording,
  type RecordingCardDto,
  type ScriptBundleDto,
  type ScriptSourceRef,
} from "@/types/script";

function sourceKey(ref: ScriptSourceRef) {
  return `${ref.type}:${ref.id}`;
}

export function ScriptEditor({ reelId }: { reelId: string }) {
  const [bundle, setBundle] = useState<ScriptBundleDto | null>(null);
  const [body, setBody] = useState("");
  const [recording, setRecording] = useState<RecordingCardDto>(emptyRecording());
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const applyBundle = useCallback((next: ScriptBundleDto, keepDraft: boolean) => {
    setBundle(next);
    if (!keepDraft) {
      const head = next.versions.find((row) => row.id === next.headId) ?? null;
      setBody(head?.body ?? "");
      setRecording(head?.recording ?? emptyRecording());
      setSelected((head?.sources ?? []).map(sourceKey));
      setDirty(false);
    }
    setViewingId((current) => current ?? next.headId ?? next.versions[0]?.id ?? null);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reels/${reelId}/scripts`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить сценарий.");
    applyBundle(data as ScriptBundleDto, dirty);
  }, [applyBundle, dirty, reelId]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, [load]);

  function currentSources(): ScriptSourceRef[] {
    return (bundle?.sources ?? [])
      .filter((item) => selected.includes(sourceKey(item)))
      .map((item) => ({ type: item.type, id: item.id }));
  }

  async function post(action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/reels/${reelId}/scripts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        expectedHeadId: bundle?.headId ?? null,
        ...extra,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить сценарий.");
    applyBundle(data as ScriptBundleDto, false);
    return data as ScriptBundleDto;
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await post("save", { body, recording, sources: currentSources() });
      setStatus("Сохранено как новая версия.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    const draftBody = body;
    const draftRecording = recording;
    const draftSelected = selected;
    try {
      const res = await fetch(`/api/reels/${reelId}/scripts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: currentSources() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось собрать сценарий.");
      applyBundle(data.bundle as ScriptBundleDto, true);
      setBody(draftBody);
      setRecording(draftRecording);
      setSelected(draftSelected);
      setDirty(true);
      setStatus("Предложение модели сохранено отдельно. Черновик не затёрт.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setGenerating(false);
    }
  }

  const viewing = bundle ? versionById(bundle, viewingId) : null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Ваша версия</h2>
        <p className="text-sm text-muted">
          Ручное сохранение не вызывает модель. Генерация пишет отдельное предложение и не затирает текст в редакторе.
          Финальный сценарий и финальный дубль — разные выборы.
        </p>
      </div>
      {error ? <p className="text-bad">{error}</p> : null}
      {status ? <p className="text-sm text-muted">{status}</p> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(16rem,20rem)]">
        <div className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
          <textarea
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setDirty(true);
            }}
            rows={10}
            placeholder="Текст сценария"
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none"
          />
          <RecordingCard
            value={recording}
            onChange={(next) => {
              setRecording(next);
              setDirty(true);
            }}
          />
          <fieldset className="space-y-2">
            <legend className="text-sm text-muted">Источники (выбираете сами, ничего не склеивается само)</legend>
            {(bundle?.sources ?? []).length === 0 ? (
              <p className="text-sm text-muted">Пока нет заметок, расшифровок, ответов или прошлых сценариев.</p>
            ) : (
              bundle?.sources.map((source) => {
                const key = sourceKey(source);
                return (
                  <label key={key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(key)}
                      onChange={(event) => {
                        setSelected((current) =>
                          event.target.checked ? [...current, key] : current.filter((item) => item !== key),
                        );
                        setDirty(true);
                      }}
                    />
                    <span>{source.label}</span>
                  </label>
                );
              })
            )}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !body.trim()}
              className="rounded-full bg-accent px-4 py-2 text-sm text-[#1a140c] disabled:opacity-50"
            >
              {saving ? "Сохраняем…" : dirty ? "Сохранить новую версию" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating || selected.length === 0}
              className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50"
            >
              {generating ? "Собираем…" : "Собрать с ИИ"}
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {bundle ? (
            <ScriptVersionList
              bundle={bundle}
              viewingId={viewingId}
              onView={setViewingId}
              onRestore={(id) => void post("restore", { scriptId: id }).catch((err) => setError(err.message))}
              onFinal={(id) => void post("final", { scriptId: id }).catch((err) => setError(err.message))}
              onAccept={(id) => void post("accept", { proposalId: id }).catch((err) => setError(err.message))}
            />
          ) : (
            <p className="text-muted">Загрузка версий…</p>
          )}
          {viewing ? (
            <div className="rounded-2xl border border-line p-3 text-sm">
              <p className="text-muted">Просмотр версии</p>
              <p className="mt-2 whitespace-pre-wrap">{viewing.body}</p>
              {viewing.inventedIdeas.length > 0 ? (
                <p className="mt-2 text-muted">Новые идеи модели: {viewing.inventedIdeas.join("; ")}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
