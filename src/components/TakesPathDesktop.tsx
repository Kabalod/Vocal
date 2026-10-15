"use client";

import "@/components/takes-path.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, FileText, Mic, MoreHorizontal, Music, Pause, Play, Trash2, Video, X } from "lucide-react";
import { DeleteTakeConfirm } from "@/components/DeleteActions";
import { TranscriptEditor } from "@/components/TranscriptEditor";
import {
  formatClock,
  pathHeight,
  pathNodes,
  pathSegments,
  pathSlot,
  polaroidQuote,
  POLAROID_H,
  POLAROID_W,
  takeActions,
  takeAriaLabel,
  takeCaption,
  takeMediaUrl,
  takesCountLabel,
  type TakeOrder,
} from "@/components/takes-path";
import { ActionButton } from "@/components/vocal-ui/ActionButton";
import { PopoverMenu } from "@/components/vocal-ui/PopoverMenu";
import { VocalModal } from "@/components/vocal-ui/VocalModal";
import type { ReelDto, TakeDto } from "@/types/reel";
import type { TranscriptBundleDto } from "@/types/transcript";

type PlayerState = { id: string; playing: boolean; pos: number; total: number };

/** One take plays at a time through a single audio element (a video take plays its sound). */
export function useTakeAudio(takes: readonly TakeDto[]) {
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPlayer(null);
  }, []);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    if (player && !takes.some((take) => take.id === player.id)) stop();
  }, [takes, player, stop]);

  const toggle = useCallback(
    (take: TakeDto) => {
      const url = takeMediaUrl(take);
      if (!url) return;
      const audio = (audioRef.current ??= new Audio());
      if (player?.id === take.id) {
        if (player.playing) {
          audio.pause();
          setPlayer({ ...player, playing: false });
        } else {
          void audio.play().catch(() => undefined);
          setPlayer({ ...player, playing: true });
        }
        return;
      }
      audio.pause();
      audio.src = url;
      audio.ontimeupdate = () => setPlayer((current) => (current ? { ...current, pos: audio.currentTime, total: audio.duration || current.total } : current));
      audio.onloadedmetadata = () => setPlayer((current) => (current ? { ...current, total: audio.duration || 0 } : current));
      audio.onended = () => setPlayer(null);
      audio.onerror = () => setPlayer(null);
      setPlayer({ id: take.id, playing: true, pos: 0, total: 0 });
      void audio.play().catch(() => setPlayer(null));
    },
    [player],
  );

  return { player, toggle, stop };
}

export function ProgressBar({ label, pos, total }: { label: string; pos: number; total: number }) {
  const percent = total > 0 ? Math.min(100, (pos / total) * 100) : 0;
  return (
    <div
      className="tp-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, Math.floor(total))}
      aria-valuenow={Math.floor(pos)}
      aria-valuetext={`${formatClock(pos)} из ${formatClock(total)}`}
    >
      <i style={{ width: `${percent}%` }} />
    </div>
  );
}

function PolaroidFace({ take }: { take: TakeDto }) {
  const { video } = takeActions(take);
  const url = takeMediaUrl(take);
  if (video && url) {
    return (
      <>
        <video className="tp-shot" src={`${url}#t=0.1`} preload="metadata" muted playsInline aria-hidden="true" tabIndex={-1} />
        <span className="tp-shot-badge">
          <Video aria-hidden="true" /> видео
        </span>
      </>
    );
  }
  const quote = polaroidQuote(take);
  if (quote) return <blockquote className="tp-quote">«{quote}»</blockquote>;
  return (
    <div className="tp-plain" aria-hidden="true">
      {take.inputType === "audio" ? <Music /> : <FileText />}
      <span>{take.inputType === "audio" ? "Аудио" : "Текст"}</span>
    </div>
  );
}

function TakeMenu({
  take,
  isFinal,
  locked,
  onFinal,
  onDelete,
}: {
  take: TakeDto;
  isFinal: boolean;
  locked: boolean;
  onFinal: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="tp-menu">
      <PopoverMenu
        items={[
          { id: "final", label: isFinal ? "Снять итоговый" : "Сделать итоговым", icon: <Check className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />, disabled: locked },
          { id: "delete", label: "Удалить дубль", icon: <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />, destructive: true },
        ]}
        onSelect={(id) => (id === "final" ? onFinal() : onDelete())}
        trigger={({ ref, ...props }) => (
          <button ref={ref} type="button" className="tp-more" aria-label={`Меню дубля ${take.number}`} {...props}>
            <MoreHorizontal aria-hidden="true" />
          </button>
        )}
      />
    </div>
  );
}

/** "Читать": the selected transcript revision, read-only; "Править" opens the existing editor. The author's note stays editable here. */
export function ReadDialog({
  take,
  isFinal,
  onClose,
  onNote,
}: {
  take: TakeDto;
  isFinal: boolean;
  onClose: () => void;
  onNote: (takeId: string, note: string) => void;
}) {
  const [text, setText] = useState<string | null>(take.inputType === "text" ? take.bodyText : null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (take.inputType === "text" && take.bodyText.trim()) return;
    let cancelled = false;
    void fetch(`/api/takes/${take.id}/transcript`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { transcript?: TranscriptBundleDto; error?: string }) => {
        if (cancelled) return;
        if (!data.transcript) {
          setError(data.error ?? "Не удалось загрузить расшифровку.");
          return;
        }
        const bundle = data.transcript;
        const selected = bundle.revisions.find((row) => row.id === bundle.selectedId) ?? bundle.revisions[0];
        setText(selected?.text ?? "");
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить расшифровку.");
      });
    return () => {
      cancelled = true;
    };
  }, [take.id, take.inputType, take.bodyText]);

  const paragraphs = (text ?? "").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return (
    <VocalModal open title={`Дубль ${take.number}${isFinal ? " · итоговый" : ""}`} onClose={onClose} placement="sheet">
      <div className="space-y-4">
        <div className="tp-read" tabIndex={0} aria-label="Расшифровка дубля">
          <span className="tp-read-caption">Расшифровка{editing ? "" : " · только чтение"}</span>
          {error ? <p className="text-bad">{error}</p> : null}
          {text === null && !error ? <p className="text-muted">Загрузка…</p> : null}
          {text !== null && paragraphs.length === 0 ? <p className="text-muted">Расшифровки пока нет.</p> : null}
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="whitespace-pre-wrap">
              {paragraph}
            </p>
          ))}
        </div>
        <label className="block space-y-1 text-sm text-muted">
          Что менял в этом дубле
          <textarea
            key={`${take.id}:${take.authorNote}`}
            defaultValue={take.authorNote}
            rows={2}
            onBlur={(event) => {
              if (event.target.value !== take.authorNote) onNote(take.id, event.target.value);
            }}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-base text-text outline-none"
          />
        </label>
        {editing ? (
          <TranscriptEditor takeId={take.id} />
        ) : (
          <ActionButton variant="secondary" onClick={() => setEditing(true)}>
            Править расшифровку
          </ActionButton>
        )}
        <div className="flex justify-end">
          <ActionButton variant="secondary" onClick={onClose}>
            Закрыть
          </ActionButton>
        </div>
      </div>
    </VocalModal>
  );
}

export function VideoDialog({ take, onClose }: { take: TakeDto; onClose: () => void }) {
  return (
    <VocalModal open title={`Дубль ${take.number} · видео`} onClose={onClose} placement="sheet">
      <div className="space-y-4">
        {takeMediaUrl(take) ? (
          <video src={takeMediaUrl(take) ?? undefined} controls autoPlay className="w-full rounded-xl bg-black" aria-label={`Видео дубля ${take.number}`} />
        ) : null}
        <div className="flex items-center justify-between gap-3">
          {take.hasFile ? (
            <a href={`/api/takes/${take.id}/media?download=1`} className="text-sm text-accent-soft">
              Скачать исходник
            </a>
          ) : (
            <span />
          )}
          <ActionButton variant="secondary" onClick={onClose}>
            Закрыть
          </ActionButton>
        </div>
      </div>
    </VocalModal>
  );
}

/**
 * Desktop "Дубли" tab (P3b, ref 01): the history of takes — a zig-zag of polaroids on a dotted S-curve, listen / read / video,
 * "Сделать итоговым", the stamp on the final take and a ghost "next take" at the newest end. No AI layer (owner decision 15.10.2026).
 */
export function TakesPathDesktop({
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
  const [reading, setReading] = useState<TakeDto | null>(null);
  const [watching, setWatching] = useState<TakeDto | null>(null);
  const [deleting, setDeleting] = useState<TakeDto | null>(null);
  const [width, setWidth] = useState(0);
  const pathRef = useRef<HTMLDivElement>(null);
  const { player, toggle, stop } = useTakeAudio(reel.takes);

  useLayoutEffect(() => {
    const node = pathRef.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const nodes = useMemo(() => pathNodes(reel.takes, order), [reel.takes, order]);
  const slots = nodes.map((_, index) => pathSlot(index, width));
  const segments = pathSegments(nodes, width);
  const height = pathHeight(nodes.length, width);
  const recordDisabled = !canRecord || locked;
  const recordReason = locked ? "Сначала верните мысль в работу" : !canRecord ? recordBlockedReason : undefined;

  return (
    <section className="takes-path" aria-labelledby="takes-path-title" data-takes-path>
      <header className="flex flex-wrap items-center gap-3.5">
        <div className="min-w-0 flex-1">
          <h2 id="takes-path-title" className="font-[family-name:var(--font-display)] text-[26px] font-medium leading-[1.15]">
            Путь дублей
          </h2>
          <p className="mt-1 text-[13px] text-muted">{takesCountLabel(reel.takes.length)}</p>
        </div>
        <div role="group" aria-label="Порядок дублей" className="inline-flex items-center gap-0.5 rounded-[11px] border border-line bg-white/[0.03] p-[3px]">
          <span className="px-2.5 text-[11px] uppercase tracking-[0.06em] text-muted" aria-hidden="true">
            Порядок
          </span>
          {(["newest", "oldest"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={order === value}
              onClick={() => setOrder(value)}
              className={`min-h-[30px] rounded-lg px-3 text-[13px] font-medium ${
                order === value ? "bg-white/10 text-text" : "text-muted hover:text-text"
              }`}
            >
              {value === "newest" ? "от последнего" : "от первого"}
            </button>
          ))}
        </div>
        <ActionButton variant="primary" disabled={recordDisabled} disabledReason={recordReason} onClick={onRecord}>
          <Mic className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />+ Новый дубль
        </ActionButton>
      </header>

      <div ref={pathRef} className="tp-path" style={{ height }}>
        {width > 0 ? (
          <>
            <svg className="tp-curves" width={width} height={height} aria-hidden="true">
              {segments.map((segment) => (
                <path key={segment.key} d={segment.d} />
              ))}
            </svg>
            {nodes.map((take, index) => {
              const place = slots[index];
              const style = { transform: `translate(${place.cx - POLAROID_W / 2}px, ${place.top}px)`, "--rot": `${place.rot}deg` } as CSSProperties;
              if (!take) {
                return (
                  <div key="ghost" className="tp-item" style={style} data-takes-ghost>
                    <button
                      type="button"
                      className="tp-ghost"
                      disabled={recordDisabled}
                      title={recordReason}
                      onClick={onRecord}
                      aria-label="Следующий дубль: записать"
                    >
                      <span className="tp-ghost-mic">
                        <Mic aria-hidden="true" />
                      </span>
                      <strong>Следующий дубль</strong>
                      <small>Записать</small>
                    </button>
                  </div>
                );
              }
              const isFinal = reel.finalTakeId === take.id;
              const actions = takeActions(take);
              const active = player?.id === take.id ? player : null;
              const playing = Boolean(active?.playing);
              return (
                <div key={take.id} className="tp-item" style={style} data-take-id={take.id}>
                  <article
                    className={`tp-polaroid${active ? " has-player" : ""}`}
                    aria-label={takeAriaLabel(take, isFinal)}
                    style={{ minHeight: POLAROID_H }}
                  >
                    <div className="tp-frame">
                      <PolaroidFace take={take} />
                      <div className="tp-actions">
                        {actions.listen ? (
                          <button
                            type="button"
                            className="tp-act"
                            aria-label={playing ? "Пауза" : "Слушать"}
                            title={playing ? "Пауза" : "Слушать"}
                            onClick={() => toggle(take)}
                          >
                            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                          </button>
                        ) : null}
                        <button type="button" className="tp-act" aria-label="Читать" title="Читать" onClick={() => setReading(take)}>
                          <FileText aria-hidden="true" />
                        </button>
                        {actions.video ? (
                          <button type="button" className="tp-act" aria-label="Видео" title="Видео" onClick={() => setWatching(take)}>
                            <Video aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                      {active ? (
                        <div className="tp-player">
                          <button type="button" className="tp-icon-btn" aria-label={playing ? "Пауза" : "Слушать"} onClick={() => toggle(take)}>
                            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                          </button>
                          <ProgressBar label={`Дубль ${take.number}: воспроизведение`} pos={active.pos} total={active.total} />
                          <time>{formatClock(active.pos)}</time>
                          <button type="button" className="tp-icon-btn" aria-label="Остановить" onClick={stop}>
                            <X aria-hidden="true" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <p className="tp-caption">{takeCaption(take)}</p>
                    {isFinal ? <span className="tp-stamp">итоговый</span> : null}
                    <TakeMenu
                      take={take}
                      isFinal={isFinal}
                      locked={locked}
                      onFinal={() => onFinal(isFinal ? null : take.id)}
                      onDelete={() => setDeleting(take)}
                    />
                  </article>
                </div>
              );
            })}
          </>
        ) : null}
      </div>

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
