"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PROFILE_FIELD_IDS,
  PROFILE_FIELD_LABELS,
  type AssembledReelContext,
  type ProfileFieldId,
  type ReelContextDto,
} from "@/types/profile";

function Preview({ live }: { live: AssembledReelContext }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-bg p-4 text-sm">
      <p className="font-medium">Что уйдёт в модель, если запустить разбор позже</p>
      <p>
        <span className="text-muted">Цель ролика: </span>
        {live.reelGoal || "не указана"}
      </p>
      <p>
        <span className="text-muted">Аудитория ролика: </span>
        {live.reelAudience || "не указана"}
      </p>
      <div>
        <p className="text-muted">Можно в текст (публичный материал)</p>
        {live.publicForScript.length === 0 ? (
          <p>Ничего не выбрано.</p>
        ) : (
          <ul className="list-disc pl-5">
            {live.publicForScript.map((field) => (
              <li key={field.id}>
                {field.label}: {field.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-muted">Только для понимания (не как публичный эпизод)</p>
        {live.understandingOnly.length === 0 ? (
          <p>Ничего не выбрано.</p>
        ) : (
          <ul className="list-disc pl-5">
            {live.understandingOnly.map((field) => (
              <li key={field.id}>
                {field.label}: {field.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-muted">
        Исключены:{" "}
        {live.excludedKeys.length ? live.excludedKeys.map((id) => PROFILE_FIELD_LABELS[id]).join(", ") : "нет"}
      </p>
    </div>
  );
}

export function ReelContextForm({ reelId }: { reelId: string }) {
  const [bundle, setBundle] = useState<ReelContextDto | null>(null);
  const [reelGoal, setReelGoal] = useState("");
  const [reelAudience, setReelAudience] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<ProfileFieldId[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reels/${reelId}/context`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить контекст.");
    const next = data.context as ReelContextDto;
    setBundle(next);
    setReelGoal(next.reelGoal);
    setReelAudience(next.reelAudience);
    setSelectedKeys(next.selectedKeys);
  }, [reelId]);

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Ошибка."));
  }, [load]);

  function toggle(id: ProfileFieldId) {
    setSelectedKeys((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/reels/${reelId}/context`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reelGoal, reelAudience, selectedKeys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить контекст.");
      const next = data.context as ReelContextDto;
      setBundle(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-bg-elev p-4">
      <h2 className="font-display text-2xl">Контекст ролика</h2>
      <p className="text-sm text-muted">
        Цель и аудитория этой карточки могут отличаться от анкеты. Невыбранные поля анкеты не попадают в контекст.
        Сохранение не вызывает ИИ и фиксирует снимок для истории.
      </p>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      <label className="block space-y-2">
        <span className="text-sm text-muted">Цель этого ролика</span>
        <textarea
          value={reelGoal}
          onChange={(event) => setReelGoal(event.target.value)}
          rows={3}
          className="w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none"
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm text-muted">Аудитория этого ролика</span>
        <textarea
          value={reelAudience}
          onChange={(event) => setReelAudience(event.target.value)}
          rows={3}
          className="w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm text-muted">Какие поля анкеты взять</legend>
        {PROFILE_FIELD_IDS.map((id) => (
          <label key={id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selectedKeys.includes(id)} onChange={() => toggle(id)} />
            {PROFILE_FIELD_LABELS[id]}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-full bg-accent px-4 py-2 text-sm text-[#1a140c] disabled:opacity-50"
      >
        {saving ? "Сохраняем…" : "Сохранить контекст"}
      </button>
      {bundle ? <Preview live={bundle.live} /> : null}
      {bundle && bundle.snapshots.length > 0 ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">Снимки контекста</p>
          <ul className="space-y-2 text-muted">
            {bundle.snapshots.map((row) => (
              <li key={row.id} className="rounded-xl border border-line p-3">
                {new Date(row.createdAt).toLocaleString("ru")} · цель: {row.assembled.reelGoal || "—"} · в текст:{" "}
                {row.assembled.publicForScript.map((field) => field.id).join(", ") || "нет"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
