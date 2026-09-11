"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ThoughtMediaProcessing } from "@/components/ThoughtMediaProcessing";
import { ThoughtVideoUpload } from "@/components/ThoughtVideoUpload";
import { ThoughtVoiceRecorder } from "@/components/ThoughtVoiceRecorder";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { ConfirmActions, VocalModal } from "@/components/vocal-ui/VocalModal";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { SegmentedTabs } from "@/components/vocal-ui/SegmentedTabs";
import { thoughtLeaveKind, type ThoughtLeaveKind } from "@/lib/thought-leave";
import { ThoughtUploadAbortedError, uploadThoughtMedia } from "@/lib/thought-media-upload";
import {
  clearThoughtDraft,
  newThoughtIdempotencyKey,
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
  const [voiceDirty, setVoiceDirty] = useState(false);
  const [voiceKey, setVoiceKey] = useState(0);
  const [mediaKey, setMediaKey] = useState("");
  const [reelId, setReelId] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveKind, setLeaveKind] = useState<ThoughtLeaveKind>("none");
  const pendingMethod = useRef<MethodId | null>(null);
  const leaveAfterConfirm = useRef<"close" | "switch" | null>(null);
  const uploadRef = useRef<{ abort: () => void } | null>(null);

  useEffect(() => {
    if (!open) return;
    setMethod("text");
    setError(null);
    setSubmitting(false);
    setVoiceDirty(false);
    setVoiceKey((value) => value + 1);
    setMediaKey(newThoughtIdempotencyKey());
    setReelId(null);
    setUploadPercent(null);
    setProcessing(false);
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

  const openThought = useCallback(
    (id: string) => {
      clearThoughtDraft();
      onClose();
      router.push(`/reels/${id}`);
    },
    [onClose, router],
  );

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
      openThought(data.reel.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка.");
    } finally {
      setSubmitting(false);
    }
  }

  async function sendMedia(file: File, inputType: "audio" | "video") {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setProcessing(true);
    setUploadPercent(0);
    const upload = uploadThoughtMedia({ file, inputType, idempotencyKey: mediaKey }, (percent) =>
      setUploadPercent(percent),
    );
    uploadRef.current = upload;
    try {
      const result = await upload.promise;
      setReelId(result.reelId);
      setUploadPercent(null);
    } catch (err) {
      if (err instanceof ThoughtUploadAbortedError) {
        setProcessing(false);
        setUploadPercent(null);
        return;
      }
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл.");
      setProcessing(false);
      setUploadPercent(null);
    } finally {
      uploadRef.current = null;
      setSubmitting(false);
    }
  }

  function currentLeaveKind(): ThoughtLeaveKind {
    return thoughtLeaveKind({
      voiceDirty,
      uploading: processing && !reelId,
      reelId,
    });
  }

  function requestLeave(kind: "close" | "switch", next?: MethodId) {
    const nextKind = currentLeaveKind();
    if (nextKind !== "none") {
      leaveAfterConfirm.current = kind;
      pendingMethod.current = next ?? null;
      setLeaveKind(nextKind);
      setLeaveOpen(true);
      return;
    }
    if (kind === "switch" && next) {
      setMethod(next);
      setError(null);
      return;
    }
    onClose();
  }

  function resetLocalMedia() {
    setVoiceDirty(false);
    setVoiceKey((value) => value + 1);
    setProcessing(false);
    setReelId(null);
    setUploadPercent(null);
    setMediaKey(newThoughtIdempotencyKey());
  }

  function confirmLeave() {
    const action = leaveAfterConfirm.current;
    const kind = leaveKind;
    setLeaveOpen(false);
    if (kind === "abort-upload") {
      uploadRef.current?.abort();
      resetLocalMedia();
    } else if (kind === "discard-local") {
      resetLocalMedia();
    }
    if (action === "switch" && pendingMethod.current && kind !== "saved-continue") {
      setMethod(pendingMethod.current);
      pendingMethod.current = null;
      return;
    }
    if (kind !== "saved-continue") onClose();
  }

  function dismissSavedAndClose() {
    setLeaveOpen(false);
    onClose();
  }

  function openSavedThought() {
    if (!reelId) return;
    setLeaveOpen(false);
    openThought(reelId);
  }

  const canContinue = Boolean(draft.body.trim()) && saved && !submitting;

  return (
    <VocalModal open={open} title="Новая мысль" onClose={() => requestLeave("close")} placement="sheet">
      <div className="space-y-4">
        <SegmentedTabs
          items={METHODS}
          value={method}
          onChange={(id) => requestLeave("switch", id as MethodId)}
          aria-label="Способ создания"
        />

        {method === "text" && !processing ? (
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

        {method === "voice" && !processing ? (
          <ThoughtVoiceRecorder
            key={voiceKey}
            disabled={submitting}
            onDirtyChange={setVoiceDirty}
            onReadyFile={(file) => void sendMedia(file, "audio")}
          />
        ) : null}

        {method === "video" && !processing ? (
          <ThoughtVideoUpload disabled={submitting} error={error} onFile={(file) => void sendMedia(file, "video")} />
        ) : null}

        {processing ? (
          <ThoughtMediaProcessing reelId={reelId} uploadPercent={uploadPercent} onReady={openThought} />
        ) : null}

        {method !== "text" && error && !processing ? <InlineError message={error} /> : null}
      </div>

      <VocalModal
        open={leaveOpen}
        title={
          leaveKind === "abort-upload"
            ? "Остановить загрузку?"
            : leaveKind === "saved-continue"
              ? "Материал сохранён"
              : "Удалить эту запись?"
        }
        initialFocus="safe"
        onClose={() => setLeaveOpen(false)}
      >
        {leaveKind === "abort-upload" ? (
          <>
            <p className="text-sm text-muted">Файл ещё не сохранён. Загрузка будет прервана, мысль не создастся.</p>
            <ConfirmActions
              cancelLabel="Продолжить загрузку"
              confirmLabel="Остановить загрузку"
              onCancel={() => setLeaveOpen(false)}
              onConfirm={confirmLeave}
            />
          </>
        ) : null}
        {leaveKind === "saved-continue" ? (
          <>
            <p className="text-sm text-muted">Материал уже на сервере. Обработка продолжится. Удаления не будет.</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <ActionButton variant="secondary" data-vocal-initial="safe" onClick={dismissSavedAndClose}>
                Закрыть
              </ActionButton>
              <ActionButton variant="primary" onClick={openSavedThought}>
                Открыть мысль
              </ActionButton>
            </div>
          </>
        ) : null}
        {leaveKind === "discard-local" ? (
          <>
            <p className="text-sm text-muted">Несохранённый фрагмент пропадёт. На сервер он ещё не отправлялся.</p>
            <ConfirmActions
              cancelLabel="Вернуться к записи"
              confirmLabel="Удалить запись"
              onCancel={() => setLeaveOpen(false)}
              onConfirm={confirmLeave}
            />
          </>
        ) : null}
      </VocalModal>
    </VocalModal>
  );
}
