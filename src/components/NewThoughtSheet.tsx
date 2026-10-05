"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ThoughtMediaProcessing } from "@/components/ThoughtMediaProcessing";
import { ThoughtVideoUpload } from "@/components/ThoughtVideoUpload";
import { ThoughtVoiceRecorder } from "@/components/ThoughtVoiceRecorder";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { Field, TextArea } from "@/components/vocal-ui/Field";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { ConfirmActions, VocalModal } from "@/components/vocal-ui/VocalModal";
import {
  ABORT_UPLOAD_LEAVE_TEXT,
  syncThoughtUploadToSheetVisibility,
  thoughtLeaveKind,
  type ThoughtLeaveKind,
} from "@/lib/thought-leave";
import { ThoughtUploadAbortedError, uploadThoughtMedia } from "@/lib/thought-media-upload";
import {
  clearThoughtDraft,
  newThoughtIdempotencyKey,
  readThoughtDraft,
  writeThoughtDraft,
  type ThoughtDraft,
} from "@/lib/thought-draft";

/** Voice and video are entered through explicit buttons in the same card; there are no tabs. */
type MediaMode = "none" | "voice" | "video";

function MicIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </svg>
  );
}

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
  const [mode, setMode] = useState<MediaMode>("none");
  const [voiceDirty, setVoiceDirty] = useState(false);
  const [voiceKey, setVoiceKey] = useState(0);
  const [mediaKey, setMediaKey] = useState("");
  const [reelId, setReelId] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveKind, setLeaveKind] = useState<ThoughtLeaveKind>("none");
  const pendingMode = useRef<MediaMode | null>(null);
  const leaveAfterConfirm = useRef<"close" | "switch" | null>(null);
  const uploadRef = useRef<{ abort: () => void } | null>(null);

  useEffect(() => {
    syncThoughtUploadToSheetVisibility({ open }, uploadRef.current);
    return () => {
      syncThoughtUploadToSheetVisibility({ open: false, unmounting: true }, uploadRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    inFlight.current = false;
    setMode("none");
    setVoiceDirty(false);
    setVoiceKey((value) => value + 1);
    setMediaKey(newThoughtIdempotencyKey());
    setReelId(null);
    setUploadPercent(null);
    setProcessing(false);
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
      // No router refresh here: right after push it races the navigation and can leave the
      // author on the list (observed in a real browser, ~half of runs). The studio loads its own data.
      router.push(`/reels/${id}`);
    },
    [onClose, router],
  );

  async function sendMedia(file: File, inputType: "audio" | "video") {
    if (inFlight.current || submitting) return;
    inFlight.current = true;
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
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function currentLeaveKind(): ThoughtLeaveKind {
    return thoughtLeaveKind({ voiceDirty, uploading: processing && !reelId, reelId });
  }

  function requestLeave(kind: "close" | "switch", next?: MediaMode) {
    const nextKind = currentLeaveKind();
    if (nextKind !== "none") {
      leaveAfterConfirm.current = kind;
      pendingMode.current = next ?? null;
      setLeaveKind(nextKind);
      setLeaveOpen(true);
      return;
    }
    if (kind === "switch" && next) {
      setMode(next);
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
    if (action === "switch" && pendingMode.current && kind !== "saved-continue") {
      setMode(pendingMode.current);
      pendingMode.current = null;
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

  function cancel() {
    if (inFlight.current && !processing) return;
    requestLeave("close");
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

  const canContinue = Boolean(draft.body.trim()) && !submitting && !voiceDirty;

  return (
    <VocalModal open={open} title="Новая мысль" onClose={cancel} placement="dialog">
      <div className="space-y-4">
        {processing ? (
          <ThoughtMediaProcessing reelId={reelId} uploadPercent={uploadPercent} onReady={openThought} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Способ записи мысли">
              <ActionButton
                variant={mode === "voice" ? "primary" : "secondary"}
                disabled={submitting}
                aria-pressed={mode === "voice"}
                aria-label="Записать голосом"
                onClick={() => requestLeave("switch", mode === "voice" ? "none" : "voice")}
              >
                <MicIcon />
                <span>Голос</span>
              </ActionButton>
              <ActionButton
                variant={mode === "video" ? "primary" : "secondary"}
                disabled={submitting}
                aria-pressed={mode === "video"}
                aria-label="Загрузить видео"
                onClick={() => requestLeave("switch", mode === "video" ? "none" : "video")}
              >
                <VideoIcon />
                <span>Видео</span>
              </ActionButton>
            </div>

            {mode === "voice" ? (
              <ThoughtVoiceRecorder
                key={voiceKey}
                disabled={submitting}
                onDirtyChange={setVoiceDirty}
                onReadyFile={(file) => void sendMedia(file, "audio")}
              />
            ) : null}
            {mode === "video" ? (
              <ThoughtVideoUpload disabled={submitting} error={error} onFile={(file) => void sendMedia(file, "video")} />
            ) : null}

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
                rows={mode === "none" ? 8 : 4}
                disabled={submitting}
              />
            </label>
          </>
        )}
        {error && mode !== "video" && !processing ? (
          <InlineError
            message={error}
            action={
              <ActionButton variant="secondary" disabled={submitting} onClick={() => void continueWithVocal()}>
                Повторить
              </ActionButton>
            }
          />
        ) : null}
        {error && processing ? <InlineError message={error} /> : null}
        {!processing ? (
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
        ) : null}
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
            <p className="text-sm text-muted">{ABORT_UPLOAD_LEAVE_TEXT}</p>
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
