"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { SegmentedTabs } from "@/components/vocal-ui/SegmentedTabs";
import { VocalModal } from "@/components/vocal-ui/VocalModal";
import {
  clearThoughtDraft,
  readThoughtDraft,
  writeThoughtDraft,
  type ThoughtDraft,
} from "@/lib/thought-draft";

const METHODS = [
  { id: "text", label: "Текст" },
  { id: "voice", label: "Голос" },
  { id: "video", label: "Видео" },
] as const;

type MethodId = (typeof METHODS)[number]["id"];

export function NewThoughtSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const bodyId = useId();
  const [method, setMethod] = useState<MethodId>("text");
  const [draft, setDraft] = useState<ThoughtDraft>({ title: "", body: "", idempotencyKey: "" });
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMethod("text");
    setError(null);
    setSubmitting(false);
    setDraft(readThoughtDraft());
    setSaved(true);
  }, [open]);

  function patchDraft(patch: Partial<ThoughtDraft>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      writeThoughtDraft(next);
      return next;
    });
    setSaved(true);
  }

  async function continueWithVocal() {
    if (submitting || !draft.body.trim()) return;
    writeThoughtDraft(draft);
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/thoughts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          body: draft.body,
          idempotencyKey: draft.idempotencyKey,
        }),
      });
      const data = (await res.json()) as { reel?: { id: string }; error?: string };
      if (!res.ok || !data.reel) throw new Error(data.error ?? "Не удалось создать мысль.");
      clearThoughtDraft();
      onClose();
      router.push(`/reels/${data.reel.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setSubmitting(false);
    }
  }

  const canContinue = Boolean(draft.body.trim()) && saved && !submitting;

  return (
    <VocalModal open={open} title="Новая мысль" onClose={onClose} placement="sheet">
      <div className="space-y-4">
        <SegmentedTabs items={METHODS} value={method} onChange={(id) => setMethod(id as MethodId)} aria-label="Способ создания" />

        {method === "text" ? (
          <div className="grid gap-4 shell:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)] shell:items-start">
            <div className="space-y-3">
              <label className="block space-y-1" htmlFor={titleId}>
                <span className="text-sm text-muted">Название</span>
                <input
                  id={titleId}
                  value={draft.title}
                  onChange={(e) => patchDraft({ title: e.target.value })}
                  placeholder="Новая мысль"
                  className="vocal-input"
                />
              </label>
              <label className="block space-y-1" htmlFor={bodyId}>
                <span className="text-sm text-muted">Мысль</span>
                <textarea
                  id={bodyId}
                  value={draft.body}
                  onChange={(e) => patchDraft({ body: e.target.value })}
                  placeholder="Напишите мысль своими словами"
                  rows={8}
                  className="vocal-input min-h-40"
                />
              </label>
              <p className="text-sm text-muted" aria-live="polite">
                {saved ? "Черновик сохранён на этом устройстве" : "Сохраняем черновик…"}
              </p>
              <p className="text-sm text-muted shell:hidden">Дальше — с Vocal. Это ещё не вызов модели.</p>
              {error ? <InlineError message={error} /> : null}
              <ActionButton
                variant="primary"
                disabled={!canContinue}
                disabledReason={!draft.body.trim() ? "Нужен текст мысли" : undefined}
                loading={submitting}
                loadingLabel="Создаём мысль…"
                onClick={() => void continueWithVocal()}
              >
                Продолжить с Vocal
              </ActionButton>
            </div>
            <aside className="hidden text-sm text-muted shell:block">
              <p className="font-medium text-text">Дальше — с Vocal</p>
              <p className="mt-2">Текст станет Дублем 1 и первой версией сценария. Модель на этом шаге не вызывается.</p>
            </aside>
          </div>
        ) : null}

        {method === "voice" ? (
          <p className="text-sm text-muted">Запись голоса появится на следующем этапе. Микрофон сейчас не включается.</p>
        ) : null}
        {method === "video" ? (
          <p className="text-sm text-muted">Загрузка видео появится на следующем этапе.</p>
        ) : null}
      </div>
    </VocalModal>
  );
}
