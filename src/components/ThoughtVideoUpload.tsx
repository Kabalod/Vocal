"use client";

import { useId, useRef, useState } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { MAX_UPLOAD_MB } from "@/lib/constants";
import { clientThoughtMediaError, thoughtMediaAccept } from "@/lib/media-session";

export function ThoughtVideoUpload({
  disabled,
  error,
  onFile,
}: {
  disabled?: boolean;
  error?: string | null;
  onFile: (file: File) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  function pick(file: File | null) {
    if (!file) return;
    const message = clientThoughtMediaError(file, "video", MAX_UPLOAD_MB);
    if (message) {
      setLocalError(message);
      return;
    }
    setLocalError(null);
    onFile(file);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Загрузите готовое видео. Камера в Vocal не включается.</p>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={thoughtMediaAccept("video")}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = "";
          pick(file);
        }}
      />
      <ActionButton variant="primary" disabled={disabled} onClick={() => inputRef.current?.click()}>
        Выбрать файл
      </ActionButton>
      {localError || error ? <InlineError message={localError ?? error ?? ""} /> : null}
    </div>
  );
}
