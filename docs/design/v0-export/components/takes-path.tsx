"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, FileText, Mic, MoreHorizontal, Pause, Play, Sparkles, Video, X } from "lucide-react";

import { useIsDesktop } from "./desktop-views";
import "./takes-path.css";

/** One take of a thought. Verdict, conclusion and tips are written by the model, never by the author. */
export type Take = {
  id: number;
  seconds: number;
  video: boolean;
  /** Main idea of the take: shown big on the polaroid when there is no video frame. */
  quote: string;
  verdict: string;
  conclusion: string;
  /** "What to improve" for the next take; 1-2 short pieces of advice. */
  tips: string[];
  when: string;
  transcript: string[];
};

export const MOCK_TAKES: Take[] = [
  {
    id: 1, seconds: 52, video: true, when: "3 дня назад",
    quote: "Три недели назад я начал бегать по утрам",
    verdict: "слишком длинно",
    conclusion: "Старт длинный, мысль размыта",
    tips: ["Начни сразу с главного", "Одна мысль — одно предложение"],
    transcript: [
      "Ну, в общем, это было где-то три недели назад, я уже даже не помню точно, когда. Я решил, что надо что-то менять, и начал бегать по утрам.",
      "Сначала казалось, что это вообще не моё. Потом, ну, как-то втянулся, хотя на третий день мне стало лень, и я думал не вставать.",
    ],
  },
  {
    id: 2, seconds: 78, video: false, when: "2 дня назад",
    quote: "Сначала лень, потом привычка",
    verdict: "мысль сдвинулась",
    conclusion: "Заход короче, тон спокойнее",
    tips: ["Убери вступление про «не помню когда»"],
    transcript: [
      "Три недели назад я начал бегать по утрам. На третий день мне стало лень, но я всё равно вышел.",
      "Дело оказалось не в силе воли. Лень никуда не делась — просто в какой-то момент она перестала быть поводом остаться дома.",
    ],
  },
  {
    id: 3, seconds: 65, video: true, when: "вчера",
    quote: "На третий день я всё равно вышел",
    verdict: "стало ближе к сути",
    conclusion: "Структура держится до конца",
    tips: ["Закончи одним действием", "Назови число: сколько дней подряд"],
    transcript: [
      "На третий день мне стало лень. Я лежал и думал, что одно утро ничего не изменит. Но я всё равно вышел.",
      "С тех пор я не спрашиваю себя, хочу ли я бежать. Я просто надеваю кроссовки — остальное происходит само.",
    ],
  },
  {
    id: 4, seconds: 84, video: false, when: "сегодня",
    quote: "Привычка начинается, когда лень уже не спорит",
    verdict: "ещё ближе к сути",
    conclusion: "Ясная мысль — лучший дубль",
    tips: ["Добавь один живой пример"],
    transcript: [
      "Три недели назад я начал бегать по утрам. На третий день мне стало лень, но я всё равно вышел — и именно в тот день всё поменялось.",
      "Привычка начинается не с мотивации, а с момента, когда лень перестаёт спорить. Ты просто делаешь, и мотивация догоняет по дороге.",
    ],
  },
];

type Order = "newest" | "oldest";
type Player = { id: number; playing: boolean; pos: number };

export function fmt(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const takeLabel = (take: Take, isFinal: boolean) =>
  `Дубль ${take.id}, ${fmt(take.seconds)}, ${take.verdict}${isFinal ? ", итоговый дубль" : ""}`;

/** Simulated replay: one take plays at a time, the progress advances in quarter-second ticks. */
function usePlayer(takes: Take[]) {
  const [player, setPlayer] = useState<Player | null>(null);
  const playing = player?.playing ?? false;
  const activeId = player?.id;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setPlayer((current) => {
        if (!current?.playing) return current;
        const total = takes.find((take) => take.id === current.id)?.seconds ?? 0;
        const pos = current.pos + 0.25;
        return pos >= total ? null : { ...current, pos };
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, [playing, activeId, takes]);
  const toggle = useCallback((id: number) => {
    setPlayer((current) => (current?.id === id ? { ...current, playing: !current.playing } : { id, playing: true, pos: 0 }));
  }, []);
  const stop = useCallback(() => setPlayer(null), []);
  return { player, toggle, stop };
}

/** Read-only dialog with a focus trap: Esc and the backdrop close it, focus returns to the opener. */
function Modal({ title, onClose, children, wide = false }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]),[href],[tabindex]:not([tabindex='-1'])"));
    (dialog.querySelector<HTMLElement>("[data-autofocus]") ?? dialog).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1], active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
      else if (!dialog.contains(active)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);
  return createPortal(
    <div className="tp-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} className={`tp-modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header>
          <h2 id={titleId}>{title}</h2>
          <button className="tp-close" aria-label="Закрыть" onClick={onClose} data-autofocus><X /></button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ReadModal({ take, isFinal, onClose }: { take: Take; isFinal: boolean; onClose: () => void }) {
  return (
    <Modal title={<>Дубль {take.id} · {fmt(take.seconds)}{isFinal && <span className="tp-final-pill">итоговый</span>}</>} onClose={onClose}>
      <div className="tp-read" tabIndex={0} aria-label="Расшифровка дубля, только чтение">
        <span className="tp-read-caption">Расшифровка · только чтение</span>
        {take.transcript.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
    </Modal>
  );
}

function VideoModal({ take, onClose }: { take: Take; onClose: () => void }) {
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setPos((value) => value + 0.25), 250);
    return () => window.clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    if (pos >= take.seconds) { setPlaying(false); setPos(0); }
  }, [pos, take.seconds]);
  return (
    <Modal title={<>Дубль {take.id} · видео</>} onClose={onClose} wide>
      <div className="tp-video">
        <div className="tp-video-frame" aria-hidden="true"><i /></div>
        <div className="tp-video-bar">
          <button className="tp-icon-btn" aria-label={playing ? "Пауза" : "Смотреть"} onClick={() => setPlaying(!playing)}>{playing ? <Pause /> : <Play />}</button>
          <ProgressBar label={`Дубль ${take.id}: видео`} pos={pos} total={take.seconds} />
          <time>{fmt(pos)} / {fmt(take.seconds)}</time>
        </div>
      </div>
    </Modal>
  );
}

function ProgressBar({ label, pos, total }: { label: string; pos: number; total: number }) {
  return (
    <div className="tp-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.floor(pos)} aria-valuetext={`${fmt(pos)} из ${fmt(total)}`}>
      <i style={{ width: `${Math.min(100, (pos / total) * 100)}%` }} />
    </div>
  );
}

/** The three actions a take has: listen, read, watch (only when the take has video). */
function TakeActions({ take, player, onListen, onRead, onVideo, labels = false }: {
  take: Take; player: Player | null; onListen: () => void; onRead: () => void; onVideo: () => void; labels?: boolean;
}) {
  const playing = player?.id === take.id && player.playing;
  return (
    <div className={`tp-actions${labels ? " labeled" : ""}`}>
      <button className="tp-act" aria-label={playing ? "Пауза" : "Слушать"} title={playing ? "Пауза" : "Слушать"} onClick={onListen}>
        {playing ? <Pause /> : <Play />}{labels && <span>Слушать</span>}
      </button>
      <button className="tp-act" aria-label="Читать" title="Читать" onClick={onRead}><FileText />{labels && <span>Читать</span>}</button>
      {take.video && <button className="tp-act" aria-label="Видео" title="Видео" onClick={onVideo}><Video />{labels && <span>Видео</span>}</button>}
    </div>
  );
}

function MiniPlayer({ take, player, onToggle, onStop }: { take: Take; player: Player; onToggle: () => void; onStop: () => void }) {
  return (
    <div className="tp-player">
      <button className="tp-icon-btn" aria-label={player.playing ? "Пауза" : "Слушать"} onClick={onToggle}>{player.playing ? <Pause /> : <Play />}</button>
      <ProgressBar label={`Дубль ${take.id}: воспроизведение`} pos={player.pos} total={take.seconds} />
      <time>{fmt(player.pos)}</time>
      <button className="tp-icon-btn" aria-label="Остановить" onClick={onStop}><X /></button>
    </div>
  );
}

/** Square of the polaroid: the video frame if the take has a clip, otherwise the main idea as a big quote. */
function PolaroidFace({ take }: { take: Take }) {
  return take.video
    ? <div className="tp-shot" aria-hidden="true"><i /><span><Video /> видео</span></div>
    : <blockquote className="tp-quote">«{take.quote}»</blockquote>;
}

function TakeMenu({ onMakeFinal, className = "" }: { onMakeFinal: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", key, true); };
  }, [open]);
  return (
    <div ref={ref} className={`tp-menu ${className}${open ? " open" : ""}`}>
      <button className="tp-more" aria-label="Ещё" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal /></button>
      {open && (
        <div className="tp-menu-list" role="menu">
          <button role="menuitem" onClick={() => { setOpen(false); onMakeFinal(); }}><Check />Сделать итоговым</button>
        </div>
      )}
    </div>
  );
}

function OrderSwitch({ order, onChange }: { order: Order; onChange: (order: Order) => void }) {
  return (
    <div className="tp-order" role="group" aria-label="Порядок дублей">
      <span className="tp-order-label" aria-hidden="true">Порядок</span>
      <button aria-pressed={order === "newest"} onClick={() => onChange("newest")}>от последнего</button>
      <button aria-pressed={order === "oldest"} onClick={() => onChange("oldest")}>от первого</button>
    </div>
  );
}

/* ---------------- desktop: zig-zag path ---------------- */

const PW = 236; // polaroid width, px
const PH = 288; // polaroid height: 12px frame, 212px square, 64px thick bottom
const SLOT_X = [0.2, 0.76, 0.27, 0.7, 0.23, 0.74];
const SLOT_Y = [70, 340, 640, 930, 1230, 1510];
const SLOT_ROT = [-1.8, 1.5, 1.1, -1.4, 1.7, -1.2];
const TIP_ROT = [-4, 3, -2.5, 4.5, -3, 3.5];

function slot(index: number, width: number) {
  const side = index % 2 === 0 ? "left" : "right";
  const lap = Math.floor(index / SLOT_X.length);
  const base = SLOT_Y[index % SLOT_Y.length] + lap * 1800;
  const half = PW / 2 + 12;
  const cx = Math.min(width - half, Math.max(half, SLOT_X[index % SLOT_X.length] * width));
  return { side, cx, top: base, rot: SLOT_ROT[index % SLOT_ROT.length] };
}

function PathDesktop({ ordered, order, locked, onRecord, finalId, setFinal, player, toggle, stop, onRead, onVideo }: {
  ordered: Take[]; order: Order; locked: boolean; onRecord: () => void; finalId: number; setFinal: (id: number) => void; player: Player | null;
  toggle: (id: number) => void; stop: () => void; onRead: (take: Take) => void; onVideo: (take: Take) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // The ghost "next take" stands right before the newest take: first when newest-first, last when oldest-first.
  const nodes: (Take | null)[] = order === "newest" ? [null, ...ordered] : [...ordered, null];
  const slots = nodes.map((_, index) => slot(index, width));
  const last = slots[slots.length - 1];
  const height = last ? last.top + PH + 80 : 0;
  // Tips of the older take of each neighbouring pair sit on the curve between the two (the ghost counts as the newest).
  const segments = nodes.slice(0, -1).map((take, index) => {
    const from = slots[index], to = slots[index + 1];
    const ay = from.top + 12 + 106, by = to.top + 12 + 106;
    const ax = from.side === "left" ? from.cx + PW / 2 + 8 : from.cx - PW / 2 - 8;
    const bx = to.side === "left" ? to.cx + PW / 2 + 8 : to.cx - PW / 2 - 8;
    const reach = (bx - ax) * 0.56;
    const next = nodes[index + 1];
    const older = (take && next ? (take.id < next.id ? take : next) : take ?? next)!;
    return {
      key: `${take?.id ?? "next"}-${next?.id ?? "next"}`,
      d: `M ${ax} ${ay} C ${ax + reach} ${ay}, ${bx - reach} ${by}, ${bx} ${by}`,
      mx: (ax + bx) / 2, my: (ay + by) / 2, tips: older.tips, rot: TIP_ROT[index % TIP_ROT.length],
    };
  });
  return (
    <div ref={ref} className="tp-path" style={{ height }}>
      {width > 0 && (
        <>
          <svg className="tp-curves" width={width} height={height} aria-hidden="true">
            {segments.map((segment) => <path key={segment.key} d={segment.d} />)}
          </svg>
          {segments.map((segment) => (
            <aside key={`tip-${segment.key}`} className="tp-tip" style={{ left: segment.mx, top: segment.my, "--tip-rot": `${segment.rot}deg` } as CSSProperties}>
              <strong>Что улучшить</strong>
              <ul>{segment.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
            </aside>
          ))}
          {nodes.map((take, index) => {
            const place = slots[index];
            if (!take)
              return (
                <div
                  key="ghost"
                  className="tp-item"
                  style={{ transform: `translate(${place.cx - PW / 2}px, ${place.top}px)`, "--rot": `${place.rot}deg` } as CSSProperties}
                >
                  <button className="tp-ghost" disabled={locked} onClick={onRecord} aria-label="Следующий дубль: записать">
                    <span className="tp-ghost-mic"><Mic /></span>
                    <strong>Следующий дубль</strong>
                    <small>Записать</small>
                  </button>
                </div>
              );
            const isFinal = take.id === finalId;
            const active = player?.id === take.id;
            return (
              <div
                key={take.id}
                className="tp-item"
                style={{ transform: `translate(${place.cx - PW / 2}px, ${place.top}px)`, "--rot": `${place.rot}deg` } as CSSProperties}
              >
                <div className="tp-cloud"><Sparkles /><span>{cap(take.verdict)}</span></div>
                <article className={`tp-polaroid${active ? " has-player" : ""}`} aria-label={takeLabel(take, isFinal)}>
                  <div className="tp-frame">
                    <PolaroidFace take={take} />
                    <TakeActions take={take} player={player} onListen={() => toggle(take.id)} onRead={() => onRead(take)} onVideo={() => onVideo(take)} />
                    {active && player && <MiniPlayer take={take} player={player} onToggle={() => toggle(take.id)} onStop={stop} />}
                  </div>
                  <p className="tp-caption">Дубль {take.id} · {fmt(take.seconds)}</p>
                  {isFinal ? <span className="tp-stamp">итоговый</span> : <TakeMenu onMakeFinal={() => setFinal(take.id)} />}
                </article>
                <p className="tp-conclusion">{take.conclusion}</p>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

/* ---------------- mobile: focus card + timeline ---------------- */

function FocusCard({ take, isFinal, player, toggle, stop, setFinal, onRead, onVideo }: {
  take: Take; isFinal: boolean; player: Player | null; toggle: (id: number) => void; stop: () => void;
  setFinal: (id: number) => void; onRead: (take: Take) => void; onVideo: (take: Take) => void;
}) {
  const active = player?.id === take.id ? player : null;
  return (
    <section className="tp-focus" aria-label={`Выбранный дубль ${take.id}`}>
      <div className="tp-cloud"><Sparkles /><span>{cap(take.verdict)}</span></div>
      <article className="tp-polaroid" aria-label={takeLabel(take, isFinal)}>
        <div className="tp-frame"><PolaroidFace take={take} /></div>
        <p className="tp-caption">Дубль {take.id} · {fmt(take.seconds)}</p>
        {isFinal ? <span className="tp-stamp">итоговый</span> : <TakeMenu onMakeFinal={() => setFinal(take.id)} />}
      </article>
      <p className="tp-conclusion">{take.conclusion}</p>
      {active && <MiniPlayer take={take} player={active} onToggle={() => toggle(take.id)} onStop={stop} />}
      <TakeActions take={take} player={player} labels onListen={() => toggle(take.id)} onRead={() => onRead(take)} onVideo={() => onVideo(take)} />
      <aside className="tp-tips">
        <strong>Что улучшить</strong>
        <ul>{take.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
      </aside>
    </section>
  );
}

function Timeline({ takes, finalId, onPick }: { takes: Take[]; finalId: number; onPick: (id: number) => void }) {
  return (
    <ol className="tp-timeline">
      {takes.map((take, index) => (
        <li key={take.id} style={{ "--rot": `${[-2, 1.6, -1.2, 2][index % 4]}deg` } as CSSProperties}>
          <button aria-label={`${takeLabel(take, take.id === finalId)}. Показать`} onClick={() => onPick(take.id)}>
            <span className="tp-mini" aria-hidden="true">
              <span className={`tp-mini-face${take.video ? " video" : ""}`}>{take.video ? <Video /> : <q>{take.quote}</q>}</span>
              <b>{take.id}</b>
            </span>
            <span className="tp-row-text">
              <strong>Дубль {take.id}{take.id === finalId && <em>итоговый</em>}</strong>
              <small>{take.when} · {fmt(take.seconds)}{take.video ? " · видео" : ""}</small>
              <span>{take.verdict}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- tab ---------------- */

export function TakesPath({ takes, locked = false, onRecord }: { takes: Take[]; locked?: boolean; onRecord: () => void }) {
  const desktop = useIsDesktop();
  const [order, setOrder] = useState<Order>("newest");
  const [finalId, setFinalId] = useState(takes[takes.length - 1].id);
  const [focusId, setFocusId] = useState(takes[takes.length - 1].id);
  const [reading, setReading] = useState<Take | null>(null);
  const [watching, setWatching] = useState<Take | null>(null);
  const { player, toggle, stop } = usePlayer(takes);
  const focusRef = useRef<HTMLDivElement>(null);
  const ordered = order === "newest" ? [...takes].reverse() : takes;
  const focused = takes.find((take) => take.id === focusId) ?? takes[takes.length - 1];
  const rest = ordered.filter((take) => take.id !== focused.id);
  const pick = (id: number) => {
    setFocusId(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    focusRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  };
  const count = `${takes.length} ${takes.length === 1 ? "дубль" : takes.length < 5 ? "дубля" : "дублей"}`;
  return (
    <section className={`takes-path ${desktop ? "is-desktop" : "is-mobile"}`} aria-labelledby="takes-path-title">
      <header className="tp-head">
        <div className="tp-title">
          <h2 id="takes-path-title">Путь дублей</h2>
          <p>{count} · сравнивает ИИ</p>
        </div>
        {desktop && <OrderSwitch order={order} onChange={setOrder} />}
        {desktop && <button className="tp-new" disabled={locked} onClick={onRecord}><Mic />+ Новый дубль</button>}
      </header>
      {desktop ? (
        <PathDesktop
          ordered={ordered} order={order} locked={locked} onRecord={onRecord} finalId={finalId} setFinal={setFinalId} player={player} toggle={toggle} stop={stop}
          onRead={setReading} onVideo={setWatching}
        />
      ) : (
        <div className="tp-mobile">
          <div ref={focusRef} className="tp-focus-anchor">
            <FocusCard
              take={focused} isFinal={focused.id === finalId} player={player} toggle={toggle} stop={stop}
              setFinal={setFinalId} onRead={setReading} onVideo={setWatching}
            />
          </div>
          {rest.length > 0 && (
            <>
              <div className="tp-timeline-head">
                <h3>Остальные дубли</h3>
                <OrderSwitch order={order} onChange={setOrder} />
              </div>
              <Timeline takes={rest} finalId={finalId} onPick={pick} />
            </>
          )}
          <div className="tp-new-bar">
            <button className="tp-new" disabled={locked} onClick={onRecord}><Mic />+ Новый дубль</button>
          </div>
        </div>
      )}
      {reading && <ReadModal take={reading} isFinal={reading.id === finalId} onClose={() => setReading(null)} />}
      {watching && <VideoModal take={watching} onClose={() => setWatching(null)} />}
    </section>
  );
}
