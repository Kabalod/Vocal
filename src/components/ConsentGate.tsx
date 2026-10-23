"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { useDialogBehavior } from "@/components/vocal-ui/dialog-behavior";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { CONSENT_LOCAL_KEY, CONSENT_VERSION, consentMetadata, hasCurrentConsent } from "@/lib/consent";
import { CONSENT_ACCEPT, CONSENT_POINTS, CONSENT_TITLE } from "@/lib/privacy-content";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const noop = () => undefined;

/**
 * The first-entry sheet. Not dismissable (no close button, the backdrop and Escape do nothing): the only way on is the button.
 * Desktop: a centered dialog; touch: a bottom sheet. Presentation only, the gate below owns the state.
 */
export function ConsentSheet({
  open,
  busy = false,
  error = null,
  onAccept,
}: {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onAccept: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogBehavior({ open, panelRef, onClose: noop, initialFocus: "safe" });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center shell:items-center" data-consent-sheet>
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="vocal-overlay-panel relative max-h-[90vh] w-full overflow-auto rounded-t-[var(--vocal-radius-modal)] bg-bg-elev px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shell:m-4 shell:max-w-[440px] shell:rounded-[var(--vocal-radius-modal)] shell:p-5"
      >
        <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-9 rounded-full bg-line-strong shell:hidden" />
        <h2 id={titleId} className="mb-3 font-[family-name:var(--font-display)] text-xl">
          {CONSENT_TITLE}
        </h2>
        <ul className="space-y-2 text-sm leading-relaxed text-muted">
          {CONSENT_POINTS.map((point) => (
            <li key={point} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-soft" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm">
          <Link className="inline-flex min-h-11 items-center text-accent-soft" href="/privacy" target="_blank" rel="noopener">
            Подробнее о данных
          </Link>
        </p>
        {error ? (
          <div className="mb-3">
            <InlineError message={error} />
          </div>
        ) : null}
        <ActionButton variant="primary" fullWidth loading={busy} data-vocal-initial="safe" onClick={onAccept}>
          {CONSENT_ACCEPT}
        </ActionButton>
      </div>
    </div>
  );
}

type Phase = "checking" | "needed" | "done";

/**
 * Asks once per notice version. The fact is stored in Supabase user_metadata (no migration, see lib/consent.ts); without Supabase
 * (local UI) in this browser. A failed read never blocks the app: the sheet is shown only when the notice is known to be unconfirmed.
 */
export function ConsentGate() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      try {
        setPhase(window.localStorage.getItem(CONSENT_LOCAL_KEY) === CONSENT_VERSION ? "done" : "needed");
      } catch {
        setPhase("done");
      }
      return;
    }
    void supabase.auth
      .getUser()
      .then(({ data, error: readError }) => {
        if (!alive) return;
        if (readError || !data.user) setPhase("done");
        else setPhase(hasCurrentConsent(data.user.user_metadata) ? "done" : "needed");
      })
      .catch(() => {
        if (alive) setPhase("done");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      try {
        window.localStorage.setItem(CONSENT_LOCAL_KEY, CONSENT_VERSION);
      } catch {
        /* nothing to remember it in: do not trap the author */
      }
      setPhase("done");
      setBusy(false);
      return;
    }
    const { error: saveError } = await supabase.auth.updateUser({ data: consentMetadata() }).catch(() => ({ error: new Error("network") }));
    if (saveError) {
      setError("Не удалось сохранить ответ. Проверьте соединение и нажмите ещё раз.");
      setBusy(false);
      return;
    }
    setPhase("done");
    setBusy(false);
  }

  return <ConsentSheet open={phase === "needed"} busy={busy} error={error} onAccept={() => void accept()} />;
}
