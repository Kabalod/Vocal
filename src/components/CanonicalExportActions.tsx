"use client";

import { useState } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { copyCanonicalExport, downloadCanonicalExport } from "@/lib/canonical-export";

export function CanonicalExportActions({
  text,
  filename,
  disabled = false,
}: {
  text: string;
  filename: string;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "downloaded" | "manual" | "empty">("idle");
  const ready = Boolean(text.trim()) && !disabled;

  async function copy() {
    if (!ready) {
      setStatus("empty");
      return;
    }
    const result = await copyCanonicalExport(text);
    setStatus(result);
  }

  function download() {
    if (!ready) {
      setStatus("empty");
      return;
    }
    const result = downloadCanonicalExport(filename, text);
    setStatus(result);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <ActionButton variant="compact" disabled={!ready} onClick={() => void copy()}>
          Копировать
        </ActionButton>
        <ActionButton variant="compact" disabled={!ready} onClick={download}>
          Скачать .txt
        </ActionButton>
      </div>
      {status === "copied" ? <p className="text-sm text-muted">Текст скопирован.</p> : null}
      {status === "downloaded" ? <p className="text-sm text-muted">Файл .txt сохранён.</p> : null}
      {status === "empty" ? (
        <p className="text-sm text-bad">Нет готового сценария для экспорта.</p>
      ) : null}
      {status === "manual" ? (
        <div className="space-y-1">
          <p className="text-sm text-bad">
            Не удалось скопировать или скачать автоматически. Выделите текст и скопируйте вручную.
          </p>
          <textarea
            readOnly
            value={text}
            rows={8}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none"
          />
        </div>
      ) : null}
    </div>
  );
}
