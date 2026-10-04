"use client";

import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { ProcessingState } from "@/components/vocal-ui/ProcessingState";
import { ProgressBar } from "@/components/vocal-ui/ProgressBar";

type Phase = "upload" | "saved" | "stt" | "analysis" | "done" | "error";

const PHASE_COPY: Record<Exclude<Phase, "upload" | "error" | "done">, { label: string; hint: string }> = {
  saved: { label: "Файл сохранён", hint: "Материал на месте. Дальше расшифровка." },
  stt: { label: "Расшифровываем", hint: "Распознаём речь. Исходник уже сохранён." },
  analysis: { label: "Завершаем", hint: "Расшифровка уже есть. Открываем рабочий дубль." },
};

export function ThoughtMediaProcessing({
  reelId,
  uploadPercent,
  onReady,
}: {
  reelId: string | null;
  uploadPercent: number | null;
  onReady: (reelId: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>(reelId ? "saved" : "upload");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [retryKind, setRetryKind] = useState<"stt" | "analysis" | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (!reelId) {
      setPhase("upload");
      return;
    }
    const controller = new AbortController();
    async function poll() {
      try {
        const res = await fetch(`/api/thoughts/${reelId}/processing`, { signal: controller.signal });
        const data = (await res.json()) as {
          phase?: Phase;
          scriptReady?: boolean;
          job?: { id: string };
          error?: { message: string; code?: string; retry: "upload" | "stt" | "analysis" };
        };
        if (controller.signal.aborted) return;
        if (!res.ok) throw new Error("Нет связи. Не удалось обновить состояние.");
        setJobId(data.job?.id ?? null);
        const next = data.phase ?? "saved";
        setPhase(next);
        if (data.error) {
          setError(data.error.message);
          setErrorCode(data.error.code ?? "PIPELINE");
          setRetryKind(data.error.retry === "analysis" || data.error.retry === "stt" ? data.error.retry : "stt");
          return;
        }
        setError(null);
        setErrorCode(null);
        if ((data.scriptReady || next === "done" || next === "analysis") && reelId && !opened.current) {
          opened.current = true;
          onReady(reelId);
        }
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Нет связи. Не удалось обновить состояние.");
        setErrorCode("NETWORK");
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 1200);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [reelId, onReady]);

  async function retry() {
    if (!jobId) return;
    setError(null);
    setErrorCode(null);
    const res = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
    const data = (await res.json()) as { error?: string; code?: string };
    if (!res.ok) {
      setError(data.error ?? "Не удалось повторить обработку.");
      setErrorCode(data.code ?? "RETRY");
    }
  }

  if (uploadPercent !== null && !reelId) {
    return <ProgressBar value={uploadPercent} label="Загрузка файла" />;
  }

  if (phase === "error" || error) {
    return (
      <div className="space-y-3">
        <InlineError
          message={error ?? "Не удалось обработать материал."}
          code={errorCode}
          action={
            retryKind ? (
              <ActionButton variant="secondary" onClick={() => void retry()}>
                {retryKind === "analysis" ? "Повторить обработку" : "Повторить расшифровку"}
              </ActionButton>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (phase === "upload") {
    return <ProgressBar value={uploadPercent ?? 0} label="Загрузка файла" />;
  }

  if (phase === "done") {
    return <ProcessingState label="Готово" hint="Открываем мысль." />;
  }

  const copy = PHASE_COPY[phase];
  return <ProcessingState label={copy.label} hint={copy.hint} />;
}
