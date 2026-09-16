"use client";

import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { InlineError } from "@/components/vocal-ui/InlineError";
import { ProcessingState } from "@/components/vocal-ui/ProcessingState";
import { studioJobPhase } from "@/lib/recording-session";

const PHASE_COPY = {
  saved: { label: "Файл сохранён", hint: "Материал на месте. Дальше расшифровка." },
  stt: { label: "Расшифровываем", hint: "Распознаём речь. Исходник уже сохранён." },
  analysis: { label: "Анализируем", hint: "Материал и расшифровка готовы. Обновляем студию." },
} as const;

export function StudioJobWatch({
  jobId,
  onSettled,
}: {
  jobId: string;
  onSettled: (status: "done" | "error") => void;
}) {
  const [phase, setPhase] = useState<ReturnType<typeof studioJobPhase>>("saved");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [retryKind, setRetryKind] = useState<"stt" | "analysis" | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    settled.current = false;
    const controller = new AbortController();
    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { signal: controller.signal, cache: "no-store" });
        const data = (await res.json()) as {
          job?: { status: string; stage?: string | null; errorMessage?: string | null; errorCode?: string | null };
          error?: string;
          code?: string;
        };
        if (controller.signal.aborted) return;
        if (!res.ok) throw Object.assign(new Error(data.error ?? "Нет связи. Не удалось обновить состояние."), { code: data.code ?? "NETWORK" });
        const next = studioJobPhase(data.job ?? null);
        setPhase(next);
        if (next === "error") {
          setError(data.job?.errorMessage ?? "Не удалось обработать материал.");
          setErrorCode(data.job?.errorCode ?? "PIPELINE");
          setRetryKind(data.job?.stage === "analyze" ? "analysis" : "stt");
          if (!settled.current) {
            settled.current = true;
            onSettled("error");
          }
          return;
        }
        setError(null);
        setErrorCode(null);
        setRetryKind(null);
        if (next === "done" && !settled.current) {
          settled.current = true;
          onSettled("done");
        }
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Нет связи. Не удалось обновить состояние.");
        setErrorCode(err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : "NETWORK");
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 1200);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [jobId, onSettled]);

  async function retry() {
    setError(null);
    setErrorCode(null);
    settled.current = false;
    const res = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
    const data = (await res.json()) as { error?: string; code?: string };
    if (!res.ok) {
      setError(data.error ?? "Не удалось повторить обработку.");
      setErrorCode(data.code ?? "RETRY");
    }
  }

  if (phase === "error" || error) {
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
        <InlineError
          message={error ?? "Не удалось обработать материал."}
          code={errorCode}
          action={
            retryKind ? (
              <ActionButton variant="secondary" onClick={() => void retry()}>
                {retryKind === "analysis" ? "Повторить анализ" : "Повторить расшифровку"}
              </ActionButton>
            ) : undefined
          }
        />
      </div>
    );
  }

  if (phase === "done") {
    return <ProcessingState label="Готово" hint="Дубль, сценарий и диалог обновлены." />;
  }

  const copy = PHASE_COPY[phase];
  return <ProcessingState label={copy.label} hint={copy.hint} />;
}
