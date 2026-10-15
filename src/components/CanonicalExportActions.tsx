"use client";

import { Copy, Download } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/vocal-ui/IconButton";
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
      {status === "copied" ? (
        <p className="text-sm text-muted" role="status">
          Текст скопирован.
        </p>
      ) : null}
      {status === "downloaded" ? (
        <p className="text-sm text-muted" role="status">
          Файл .txt сохранён.
        </p>
      ) : null}
      {status === "empty" ? (
        <p className="text-sm text-bad" role="alert">
          Нет готового сценария для экспорта.
        </p>
      ) : null}
      {status === "manual" ? (
        <div className="space-y-1">
          <p className="text-sm text-bad" role="alert">
            Не удалось скопировать или скачать автоматически. Выделите текст и скопируйте вручную.
          </p>
          <label className="block space-y-1">
            <span className="sr-only">Текст для ручного копирования</span>
            <textarea
              readOnly
              value={text}
              rows={8}
              className="w-full max-w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

/** Desktop reader header: copy and .txt as icon buttons with hints; the result is a short note next to them. */
export function CanonicalExportIconButtons({
  text,
  filename,
  disabled = false,
}: {
  text: string;
  filename: string;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "downloaded" | "manual">("idle");
  const ready = Boolean(text.trim()) && !disabled;
  return (
    <div className="flex items-center gap-1">
      <span role="status" className="mr-1 text-xs text-muted">
        {status === "copied" ? "Скопировано" : status === "downloaded" ? "Файл сохранён" : ""}
        {status === "manual" ? <span className="text-bad">Не удалось — скопируйте вручную</span> : null}
      </span>
      <IconButton label="Копировать" disabled={!ready} onClick={() => void copyCanonicalExport(text).then(setStatus)}>
        <Copy className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </IconButton>
      <IconButton label="Скачать .txt" disabled={!ready} onClick={() => setStatus(downloadCanonicalExport(filename, text))}>
        <Download className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
