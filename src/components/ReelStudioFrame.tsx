"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { STUDIO_PANELS, type StudioPanelId } from "@/components/reel-studio";

export function ReelStudioFrame({
  header,
  left,
  panels,
}: {
  header: ReactNode;
  left: ReactNode;
  panels: Record<StudioPanelId, ReactNode>;
}) {
  const [open, setOpen] = useState<StudioPanelId | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="space-y-6">
      {header}

      <div className="hidden gap-8 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] lg:items-start">
        <section className="min-w-0 space-y-6" aria-label="Версия автора">
          {left}
        </section>
        <section className="min-w-0 space-y-6" aria-label="Общение с Vocal">
          {panels.vocal}
        </section>
      </div>

      <div className="space-y-6 lg:hidden">
        {left}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Панели записи">
          {STUDIO_PANELS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="vocal-btn text-sm"
              onClick={() => setOpen(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden space-y-8 border-t border-line pt-8 lg:block">
        <section aria-label="Дубли">{panels.takes}</section>
        <section aria-label="Контекст">{panels.context}</section>
        <section aria-label="Сравнение">{panels.compare}</section>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Закрыть панель"
            onClick={() => setOpen(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-y-0 right-0 flex w-[min(24rem,calc(100vw-1.25rem))] max-w-full flex-col bg-bg-elev"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <p id={titleId} className="font-[family-name:var(--font-display)] text-lg">
                {STUDIO_PANELS.find((item) => item.id === open)?.label}
              </p>
              <button type="button" className="vocal-btn shrink-0" onClick={() => setOpen(null)}>
                Закрыть
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{panels[open]}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
