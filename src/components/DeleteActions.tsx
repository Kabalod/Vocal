"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { ConfirmAlert } from "@/components/vocal-ui/ConfirmAlert";
import { Field } from "@/components/vocal-ui/Field";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { VocalModal } from "@/components/vocal-ui/VocalModal";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export const ACCOUNT_DELETE_PHRASE = "УДАЛИТЬ";

async function sendDelete(url: string, body?: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return { ok: true, message: "" };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, message: data.error ?? "Не удалось удалить. Повторите." };
  } catch {
    return { ok: false, message: "Нет связи. Ничего не удалено, повторите." };
  }
}

function ConfirmDeleteModal({
  open,
  title,
  description,
  confirmLabel,
  busy,
  error,
  canConfirm = true,
  onCancel,
  onConfirm,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  canConfirm?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <VocalModal open={open} title={title} initialFocus="safe" onClose={() => (busy ? undefined : onCancel())}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{description}</p>
        {children}
        {error ? <InlineError message={error} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton variant="secondary" data-vocal-initial="safe" disabled={busy} onClick={onCancel}>
            Оставить
          </ActionButton>
          <ActionButton
            variant="danger"
            disabled={!canConfirm || busy}
            loading={busy}
            loadingLabel="Удаляем…"
            onClick={onConfirm}
          >
            {confirmLabel}
          </ActionButton>
        </div>
      </div>
    </VocalModal>
  );
}

export function DeleteThoughtAction({ reelId, title }: { reelId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await sendDelete(`/api/reels/${reelId}`);
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    router.push("/reels");
  }

  return (
    <>
      <ActionButton variant="compact" onClick={() => setOpen(true)}>
        Удалить мысль
      </ActionButton>
      <ConfirmDeleteModal
        open={open}
        title="Удалить мысль?"
        description={`«${title}» исчезнет вместе с дублями, записями, расшифровками, диалогом и сценариями. Это нельзя отменить.`}
        confirmLabel="Удалить мысль"
        busy={busy}
        error={error}
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
        onConfirm={() => void confirm()}
      />
    </>
  );
}

/**
 * Desktop: the same deletion as `DeleteThoughtAction`, opened from the "…" menu of the thought toolbar and confirmed in an iOS alert.
 * Controlled: the toolbar owns `open`. The safe answer ("Оставить") has the initial focus; a failure is shown in the alert's text.
 */
export function DeleteThoughtConfirm({
  reelId,
  title,
  open,
  onClose,
}: {
  reelId: string;
  title: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await sendDelete(`/api/reels/${reelId}`);
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    router.push("/reels");
  }

  return (
    <ConfirmAlert
      open={open}
      title="Удалить мысль?"
      message={
        error ??
        `«${title}» исчезнет вместе с дублями, записями, расшифровками, диалогом и сценариями. Это нельзя отменить.`
      }
      confirmLabel={busy ? "Удаляем…" : "Удалить"}
      cancelLabel="Оставить"
      destructive
      onCancel={() => {
        if (busy) return;
        setError(null);
        onClose();
      }}
      onConfirm={() => void confirm()}
    />
  );
}

/** Desktop path of takes: the same deletion as `DeleteTakeAction`, opened from the take menu and confirmed in an iOS alert. */
export function DeleteTakeConfirm({
  takeId,
  label,
  open,
  onClose,
  onDeleted,
}: {
  takeId: string;
  label: string;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await sendDelete(`/api/takes/${takeId}`);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onClose();
    onDeleted();
  }

  return (
    <ConfirmAlert
      open={open}
      title="Удалить дубль?"
      message={
        error ??
        `${label}: файл, расшифровка и разборы этого дубля исчезнут. Остальные дубли и мысль останутся. Это нельзя отменить.`
      }
      confirmLabel={busy ? "Удаляем…" : "Удалить дубль"}
      cancelLabel="Оставить"
      destructive
      onCancel={() => {
        if (busy) return;
        setError(null);
        onClose();
      }}
      onConfirm={() => void confirm()}
    />
  );
}

export function DeleteTakeAction({
  takeId,
  label,
  onDeleted,
}: {
  takeId: string;
  label: string;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await sendDelete(`/api/takes/${takeId}`);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
    onDeleted();
  }

  return (
    <>
      <ActionButton variant="compact" onClick={() => setOpen(true)}>
        Удалить дубль
      </ActionButton>
      <ConfirmDeleteModal
        open={open}
        title="Удалить дубль?"
        description={`${label}: файл, расшифровка и разборы этого дубля исчезнут. Остальные дубли и мысль останутся. Это нельзя отменить.`}
        confirmLabel="Удалить дубль"
        busy={busy}
        error={error}
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
        onConfirm={() => void confirm()}
      />
    </>
  );
}

/**
 * The account row of the profile card: a red "Удалить аккаунт" opens an iOS alert that says what goes away and asks to type the word.
 * The confirm button is inactive until the author has typed it; the client never fills the phrase in itself.
 */
export function DeleteAccountRow() {
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setPhrase("");
  }

  async function confirm() {
    if (busy || phrase !== ACCOUNT_DELETE_PHRASE) return;
    setBusy(true);
    setError(null);
    const result = await sendDelete("/api/account", { confirm: phrase });
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    const supabase = createBrowserSupabaseClient();
    await supabase?.auth.signOut().catch(() => undefined);
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        data-account-delete
        className="flex min-h-11 w-full items-center px-4 text-left text-sm text-bad hover:bg-white/5"
        onClick={() => setOpen(true)}
      >
        Удалить аккаунт
      </button>
      <ConfirmAlert
        open={open}
        title="Удалить аккаунт?"
        message={`Все ваши мысли, дубли и сценарии будут удалены без возможности восстановления. Чтобы подтвердить, введите «${ACCOUNT_DELETE_PHRASE}».`}
        confirmLabel={busy ? "Удаляем…" : "Удалить"}
        destructive
        confirmDisabled={phrase !== ACCOUNT_DELETE_PHRASE || busy}
        onCancel={() => (busy ? undefined : close())}
        onConfirm={() => void confirm()}
      >
        <label className="block space-y-1" htmlFor={inputId}>
          <span className="sr-only">Подтверждение</span>
          <Field
            id={inputId}
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            placeholder={ACCOUNT_DELETE_PHRASE}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        {error ? (
          <div className="mt-2">
            <InlineError message={error} />
          </div>
        ) : null}
      </ConfirmAlert>
    </>
  );
}
