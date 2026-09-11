"use client";

import { useEffect, useState } from "react";
import {
  PROFILE_FIELD_HINTS,
  PROFILE_FIELD_IDS,
  PROFILE_FIELD_LABELS,
  emptyProfileFields,
  type ProfileDto,
  type ProfileFieldValue,
  type ProfileUsage,
} from "@/types/profile";

export function ProfileForm() {
  const [fields, setFields] = useState<ProfileFieldValue[]>(emptyProfileFields());
  const [revisions, setRevisions] = useState<ProfileDto["revisions"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Загрузка…");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Не удалось открыть анкету.");
        if (cancelled) return;
        const profile = data.profile as ProfileDto;
        setFields(profile.fields);
        setRevisions(profile.revisions);
        setStatus(profile.currentRevisionId ? "Сохранено ранее" : "Ещё не сохраняли");
        setDirty(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(id: ProfileFieldValue["id"], patch: Partial<ProfileFieldValue>) {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить.");
      const profile = data.profile as ProfileDto;
      setFields(profile.fields);
      setRevisions(profile.revisions);
      setStatus("Сохранено");
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm ${error ? "text-bad" : "text-muted"}`}>{error ?? status}</p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-full bg-accent px-4 py-2 text-sm text-on-accent disabled:opacity-50"
        >
          {saving ? "Сохраняем…" : dirty ? "Сохранить черновик" : "Сохранить"}
        </button>
      </div>
      <p className="text-sm text-muted">
        Поля можно пропускать. «Можно в текст» попадёт в сценарий как публичный материал. «Только для понимания»
        модель может учесть, но не должна выдавать это как ваш публичный эпизод. Сохранение не вызывает ИИ.
      </p>
      {PROFILE_FIELD_IDS.map((id) => {
        const field = fields.find((item) => item.id === id) ?? {
          id,
          label: PROFILE_FIELD_LABELS[id],
          text: "",
          usage: "understanding" as ProfileUsage,
        };
        return (
          <section key={id} className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
            <h2 className="font-medium">{PROFILE_FIELD_LABELS[id]}</h2>
            <p className="text-sm text-muted">{PROFILE_FIELD_HINTS[id]}</p>
            <textarea
              value={field.text}
              onChange={(event) => updateField(id, { text: event.target.value })}
              rows={4}
              className="w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none"
              placeholder="Можно оставить пустым"
            />
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="sr-only">Разрешение использования</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`usage-${id}`}
                  checked={field.usage === "in_text"}
                  onChange={() => updateField(id, { usage: "in_text" })}
                />
                Можно использовать в тексте
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`usage-${id}`}
                  checked={field.usage === "understanding"}
                  onChange={() => updateField(id, { usage: "understanding" })}
                />
                Только для понимания
              </label>
            </fieldset>
          </section>
        );
      })}
      {revisions.length > 0 ? (
        <section className="space-y-2">
          <h2 className="font-medium">История сохранений</h2>
          <p className="text-sm text-muted">
            Новое сохранение создаёт снимок. Старые версии остаются; прошлые разборы к ним не переписываются.
          </p>
          <ul className="space-y-1 text-sm text-muted">
            {revisions.slice(0, 12).map((row, index) => (
              <li key={row.id}>
                {index === 0 ? "Текущая · " : ""}
                {new Date(row.createdAt).toLocaleString("ru")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
