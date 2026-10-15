"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileText, Mic, MoreHorizontal, Music, Pause, Play, Video, X } from "lucide-react";
import { DeleteTakeConfirm } from "@/components/DeleteActions";
import { ProgressBar, ReadDialog, useTakeAudio, VideoDialog } from "@/components/TakesPathDesktop";
import {
  focusTakeId,
  formatClock,
  polaroidQuote,
  takeActions,
  takeAriaLabel,
  takeCaption,
  takeMediaUrl,
  takesCountLabel,
  timelineNodes,
  type TakeOrder,
} from "@/components/takes-path";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { ActionSheet } from "@/components/vocal-ui/ActionSheet";
import { IconButton } from "@/components/vocal-ui/IconButton";
import type { ReelDto, TakeDto } from "@/types/reel";

/**
 * Mobile "Дубли" (ref 08): the focus card of one take on top (the final one, or the newest) and a compact vertical timeline of the
 * other takes below; a tap on a timeline row puts that take into the focus. No zig-zag, no manual comparison. Data and actions are
 * the same as on the desktop path: no AI cloud, conclusion or stickers (owner decision 15.10.2026).
 */
export function TakesPathMobile({
  reel,
  locked,
  canRecord,
  recordBlockedReason,
  onRecord,
  onFinal,
  onNote,
  onDeleted,
}: {
  reel: ReelDto;
  locked: boolean;
  canRecord: boolean;
  recordBlockedReason?: string;
  onRecord: () => void;
  onFinal: (takeId: string | null) => void;
  onNote: (takeId: string, note: string) => void;
  onDeleted: () => void;
}) {
  const [order, setOrder] = useState<TakeOrder>("newest");
  const [picked, setPicked] = useState<string | null>(null);
  const [reading, setReading] = useState<TakeDto | null>(null);
  const [watching, setWatching] = useState<TakeDto | null>(null);
  const [deleting, setDeleting] = useState<TakeDto | null>(null);
  const [menuFor, setMenuFor] = useState<TakeDto | null>(null);
  const focusRef = useRef<HTMLElement>(null);
  const { player, toggle, stop } = useTakeAudio(reel.takes);
  const focusId = focusTakeId(reel.takes, reel.finalTakeId, picked);
  const focus = reel.takes.find((take) => take.id === focusId) ?? null;
  const nodes = useMemo(() => timelineNodes(reel.takes, order, focusId), [reel.takes, order, focusId]);
  const recordDisabled = !canRecord || locked;
  const recordReason = locked ? "Сначала верните мысль в работу" : !canRecord ? recordBlockedReason : undefined;

  useEffect(() => {
    if (picked && !reel.takes.some((take) => take.id === picked)) setPicked(null);
  }, [reel.takes, picked]);

  function focusOn(take: TakeDto) {
    setPicked(take.id);
    focusRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const isFinal = focus ? reel.finalTakeId === focus.id : false;
  const actions = focus ? takeActions(focus) : null;
  const active = focus && player?.id === focus.id ? player : null;
  const playing = Boolean(active?.playing);
  const quote = focus ? polaroidQuote(focus) : null;
  const url = focus ? takeMediaUrl(focus) : null;

  return (
    <section aria-labelledby="takes-mobile-title" data-takes-mobile className="space-y-5">
      <header className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="takes-mobile-title" className="font-[family-name:var(--font-display)] text-2xl leading-tight">
            Путь дублей
          </h2>
          <p className="mt-0.5 text-sm text-muted">{takesCountLabel(reel.takes.length)}</p>
        </div>
        <ActionButton variant="primary" disabled={recordDisabled} onClick={onRecord}>
          <Mic className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Новый дубль
        </ActionButton>
      </header>
      {recordReason ? <p className="-mt-3 text-xs text-muted">{recordReason}</p> : null}

      {focus ? (
        <article
          ref={focusRef}
          data-take-focus={focus.id}
          aria-label={takeAriaLabel(focus, isFinal)}
          className="relative scroll-mt-16 rounded-[6px] bg-[var(--paper,#e8e5df)] p-3 pb-2 text-[var(--paper-ink,#22212a)] shadow-[0_14px_28px_rgba(0,0,0,0.4)]"
        >
          <div className="relative flex min-h-[200px] items-center justify-center overflow-hidden rounded-[3px] bg-[#f4f1ea]">
            {actions?.video && url ? (
              <video className="h-[220px] w-full bg-[#14121c] object-cover" src={`${url}#t=0.1`} preload="metadata" muted playsInline aria-hidden="true" tabIndex={-1} />
            ) : quote ? (
              <blockquote className="px-5 py-6 text-center font-[family-name:var(--font-display)] text-xl leading-snug">«{quote}»</blockquote>
            ) : (
              <div className="grid place-items-center gap-1.5 py-10 text-sm text-[#55525c]" aria-hidden="true">
                {focus.inputType === "audio" ? <Music className="h-7 w-7" /> : <FileText className="h-7 w-7" />}
                <span>{focus.inputType === "audio" ? "Аудио" : "Текст"}</span>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-1 py-2">
            <p className="font-[family-name:var(--font-display)] text-lg">{takeCaption(focus)}</p>
            {isFinal ? (
              <span className="rounded-[4px] border-2 border-[#7c5cf0d9] px-2 py-0.5 text-xs font-bold uppercase tracking-[0.14em] text-[#6a49e6d9]">
                итоговый
              </span>
            ) : null}
          </div>
          {active ? (
            <div className="mb-2 flex items-center gap-2 rounded-[10px] bg-[#1d1b24f2] px-2 py-1 text-[#f4f2f7]">
              <button type="button" aria-label={playing ? "Пауза" : "Слушать"} className="grid h-11 w-11 place-items-center" onClick={() => toggle(focus)}>
                {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              </button>
              <ProgressBar label={`Дубль ${focus.number}: воспроизведение`} pos={active.pos} total={active.total} />
              <time className="text-xs tabular-nums">{formatClock(active.pos)}</time>
              <button type="button" aria-label="Остановить" className="grid h-11 w-11 place-items-center" onClick={stop}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-black/10 pt-2">
            {actions?.listen ? (
              <button
                type="button"
                data-press
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#22212a] px-4 text-sm text-[#f4f2f7]"
                onClick={() => toggle(focus)}
              >
                {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                {playing ? "Пауза" : "Слушать"}
              </button>
            ) : null}
            <button
              type="button"
              data-press
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#22212a] px-4 text-sm text-[#f4f2f7]"
              onClick={() => setReading(focus)}
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Читать
            </button>
            {actions?.video ? (
              <button
                type="button"
                data-press
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#22212a] px-4 text-sm text-[#f4f2f7]"
                onClick={() => setWatching(focus)}
              >
                <Video className="h-4 w-4" aria-hidden="true" />
                Видео
              </button>
            ) : null}
            <IconButton label={`Меню дубля ${focus.number}`} className="ml-auto !text-[#22212a]" onClick={() => setMenuFor(focus)}>
              <MoreHorizontal aria-hidden="true" />
            </IconButton>
          </div>
        </article>
      ) : (
        <p className="rounded-2xl border border-line bg-bg-elev p-4 text-sm text-muted">Дублей пока нет. Запишите первый — голосом или текстом.</p>
      )}

      {focus ? (
        <div className="flex items-center gap-3">
          <ActionButton
            variant={isFinal ? "secondary" : "primary"}
            disabled={locked}
            disabledReason={locked ? "Сначала верните мысль в работу" : undefined}
            fullWidth
            onClick={() => onFinal(isFinal ? null : focus.id)}
          >
            <Check className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {isFinal ? "Снять итоговый" : "Сделать итоговым"}
          </ActionButton>
        </div>
      ) : null}

      {reel.takes.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-muted">Остальные дубли</h3>
            <div role="group" aria-label="Порядок дублей" className="inline-flex rounded-[10px] border border-line bg-white/[0.03] p-0.5">
              {(["newest", "oldest"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={order === value}
                  onClick={() => setOrder(value)}
                  className={`min-h-11 rounded-[8px] px-3 text-[13px] font-medium ${order === value ? "bg-white/10 text-text" : "text-muted"}`}
                >
                  {value === "newest" ? "от последнего" : "от первого"}
                </button>
              ))}
            </div>
          </div>
          <ol className="relative ml-3 border-l border-dashed border-accent-soft/50" data-takes-timeline>
            {nodes.map((node) =>
              node ? (
                <li key={node.id} className="relative pl-5">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${reel.finalTakeId === node.id ? "bg-accent" : "bg-accent-soft/70"}`}
                  />
                  <button
                    type="button"
                    data-press
                    data-take-id={node.id}
                    onClick={() => focusOn(node)}
                    className="my-1 flex min-h-12 w-full items-center justify-between gap-3 rounded-[12px] border border-line bg-white/[0.03] px-3.5 text-left"
                  >
                    <span className="min-w-0 truncate text-sm">{takeCaption(node)}</span>
                    {reel.finalTakeId === node.id ? (
                      <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-accent-soft">итоговый</span>
                    ) : null}
                  </button>
                </li>
              ) : (
                <li key="ghost" className="relative pl-5" data-takes-ghost>
                  <span aria-hidden="true" className="absolute -left-[5px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-accent-soft" />
                  <button
                    type="button"
                    data-press
                    disabled={recordDisabled}
                    onClick={onRecord}
                    className="my-1 flex min-h-12 w-full items-center gap-2 rounded-[12px] border-2 border-dashed border-accent-soft/50 bg-accent-soft/5 px-3.5 text-left text-sm text-[#d7cffc] disabled:opacity-50"
                  >
                    <Mic className="h-4 w-4" aria-hidden="true" />
                    Следующий дубль · Записать
                  </button>
                </li>
              ),
            )}
          </ol>
        </div>
      ) : null}

      <ActionSheet
        open={Boolean(menuFor)}
        title={menuFor ? takeCaption(menuFor) : undefined}
        actions={[{ id: "delete", label: "Удалить дубль", destructive: true }]}
        onClose={() => setMenuFor(null)}
        onSelect={() => {
          setDeleting(menuFor);
          setMenuFor(null);
        }}
      />
      {reading ? <ReadDialog take={reading} isFinal={reel.finalTakeId === reading.id} onClose={() => setReading(null)} onNote={onNote} /> : null}
      {watching ? <VideoDialog take={watching} onClose={() => setWatching(null)} /> : null}
      <DeleteTakeConfirm
        takeId={deleting?.id ?? ""}
        label={deleting ? `Дубль №${deleting.number}` : ""}
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          onDeleted();
        }}
      />
    </section>
  );
}
