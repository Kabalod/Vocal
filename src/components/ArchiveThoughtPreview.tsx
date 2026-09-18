"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/vocal-ui/StatusBadge";
import { VocalModal } from "@/components/vocal-ui/VocalModal";
import { studioThoughtHref } from "@/components/reel-studio";
import type { ArchiveThoughtPreviewDto } from "@/lib/archive-preview";
import { ShellError, ShellLoading } from "@/components/shell-status";

export function ArchiveThoughtPreview({
  reelId,
  open,
  onClose,
}: {
  reelId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<"loading" | "error" | "ok">("loading");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ArchiveThoughtPreviewDto | null>(null);

  useEffect(() => {
    if (!open || !reelId) return;
    const ac = new AbortController();
    setLoad("loading");
    setError(null);
    setData(null);
    void fetch(`/api/reels/${reelId}/archive-preview`, { cache: "no-store", signal: ac.signal })
      .then(async (res) => {
        const body = (await res.json()) as ArchiveThoughtPreviewDto & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Не удалось открыть превью.");
        setData(body);
        setLoad("ok");
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Ошибка.");
        setLoad("error");
      });
    return () => ac.abort();
  }, [open, reelId]);

  const dialogHref = studioThoughtHref(reelId, "dialog");
  const recordHref = studioThoughtHref(reelId, "takes", { record: true });

  return (
    <VocalModal open={open} title="Превью мысли" onClose={onClose} placement="sheet">
      {load === "loading" ? <ShellLoading label="Загрузка превью…" /> : null}
      {load === "error" ? <ShellError message={error ?? "Не удалось открыть превью."} /> : null}
      {load === "ok" && data ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="min-w-0 break-words font-[family-name:var(--font-display)] text-2xl">{data.title}</h3>
            <StatusBadge status={data.userStatus} />
          </div>
          <p className="text-sm text-muted">Дублей: {data.takeCount}</p>
          {data.completed ? <p className="text-sm text-muted">Мысль уже завершена.</p> : null}
          {data.honesty === "processing" ? (
            <p className="text-sm text-muted" role="status">
              {data.honestyMessage}
            </p>
          ) : null}
          {data.honesty === "error" ? (
            <p className="text-sm text-bad" role="alert">
              {data.honestyMessage}
            </p>
          ) : null}
          {data.acceptedScript ? (
            <section className="space-y-2" aria-label="Последний принятый сценарий">
              <p className="text-sm text-muted">
                Последний принятый сценарий · версия {data.acceptedScript.versionNumber}
              </p>
              <p className="font-content text-sm text-text">{data.acceptedScript.excerpt}</p>
            </section>
          ) : (
            <p className="text-sm text-muted">{data.noScriptHint}</p>
          )}
          <div className="flex flex-col gap-2 pt-2">
            <Link
              href={recordHref}
              replace
              className="vocal-btn vocal-btn-primary inline-flex min-h-11 items-center justify-center"
            >
              Снять новый дубль
            </Link>
            <Link
              href={dialogHref}
              replace
              className="vocal-btn inline-flex min-h-11 items-center justify-center"
            >
              Перейти к работе с мыслью
            </Link>
          </div>
        </div>
      ) : null}
    </VocalModal>
  );
}
