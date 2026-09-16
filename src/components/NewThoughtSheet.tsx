"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { Field, TextArea } from "@/components/vocal-ui/Field";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { VocalModal } from "@/components/vocal-ui/VocalModal";
import {
  clearThoughtDraft,
  readThoughtDraft,
  writeThoughtDraft,
  type ThoughtDraft,
} from "@/lib/thought-draft";

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
  const [draft, setDraft] = useState<ThoughtDraft>({ title: "", body: "", idempotencyKey: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    inFlight.current = false;
    setDraft(readThoughtDraft());
  }, [open]);

  function patchDraft(patch: Partial<ThoughtDraft>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      writeThoughtDraft(next);
      return next;
    });
  }

  const openThought = useCallback(
    (id: string) => {
      clearThoughtDraft();
      onClose();
      router.push(`/reels/${id}`);
      router.refresh();
    },
    [onClose, router],
  );

  function cancel() {
    if (inFlight.current || submitting) return;
    onClose();
  }

  async function continueWithVocal() {
    if (inFlight.current || submitting || !draft.body.trim()) return;
    inFlight.current = true;
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
      const data = (await res.json()) as { reel?: { id: string; status?: string }; error?: string };
      if (!res.ok || !data.reel) throw new Error(data.error ?? "Не удалось создать мысль.");
      openThought(data.reel.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const canContinue = Boolean(draft.body.trim()) && !submitting;

  return (
    <VocalModal open={open} title="Новая мысль" onClose={cancel} placement="dialog">
      <div className="space-y-4">
        <label className="block space-y-1" htmlFor={titleId}>
          <span className="text-sm text-muted">Название</span>
          <Field
            id={titleId}
            value={draft.title}
            onChange={(e) => patchDraft({ title: e.target.value })}
            placeholder="Новая мысль"
            disabled={submitting}
          />
        </label>
        <label className="block space-y-1" htmlFor={bodyId}>
          <span className="text-sm text-muted">Мысль</span>
          <TextArea
            id={bodyId}
            value={draft.body}
            onChange={(e) => patchDraft({ body: e.target.value })}
            placeholder="Напишите мысль своими словами"
            rows={8}
            disabled={submitting}
          />
        </label>
        {error ? (
          <InlineError
            message={error}
            action={
              <ActionButton variant="secondary" disabled={submitting} onClick={() => void continueWithVocal()}>
                Повторить
              </ActionButton>
            }
          />
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton variant="secondary" disabled={submitting} onClick={cancel}>
            Отмена
          </ActionButton>
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
      </div>
    </VocalModal>
  );
}
