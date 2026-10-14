"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Camera, FileWarning, Lock, Mic, RotateCcw, Video, WifiOff, X } from "lucide-react";

type RecordingPhase = "ready" | "recording" | "processing" | "review" | "denied";

/** Preview switch for states that need a real device condition: ?name or ?name=value in the URL. */
export function useQueryFlag(name: string, value?: string) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOn(value === undefined ? params.has(name) : params.get(name) === value);
  }, [name, value]);
  return on;
}

/** Value of ?name=... (null when absent), read once on the client. */
export function useQueryParam(name: string) {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => { setValue(new URLSearchParams(window.location.search).get(name)); }, [name]);
  return value;
}

export function OfflineBanner() {
  return <div className="offline-banner" role="status"><WifiOff /><span>Нет соединения. Ответ сохранится и отправится позже</span><button>Повторить</button></div>;
}

function useModalKeys(open: boolean, onClose: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    const controls = Array.from(panel?.querySelectorAll<HTMLElement>('button,textarea,input,[tabindex]:not([tabindex="-1"])') ?? []);
    controls[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || controls.length === 0) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, ref]);
}

/** Exposes the on-screen keyboard height as --kb so bottom sheets can rise above it (iOS Safari). */
function useKeyboardInset(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    const update = () => document.documentElement.style.setProperty("--kb", `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`);
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => { viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); document.documentElement.style.removeProperty("--kb"); };
  }, [active]);
}

export function NewThoughtModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: () => void }) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [denied, setDenied] = useState(false);
  const micDenied = useQueryFlag("mic", "denied");
  const offline = useQueryFlag("offline");
  const panel = useRef<HTMLElement>(null);
  useModalKeys(open, onClose, panel);
  useKeyboardInset(open);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  if (!open) return null;
  return <div className="flow-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className="new-thought-modal" role="dialog" aria-modal="true" aria-labelledby="new-thought-title">
      <button className="flow-grabber" aria-label="Закрыть" onClick={onClose} />
      <header><h2 id="new-thought-title">Новая мысль</h2><button className="flow-close" aria-label="Закрыть" onClick={onClose}><X /></button></header>
      <div className="new-thought-card">
        {recording ? <div className="inline-recording" role="status"><button className="record-stop" aria-label="Остановить запись" onClick={() => setRecording(false)}><span /></button><strong>{String(Math.floor(seconds / 60)).padStart(2,"0")}:{String(seconds % 60).padStart(2,"0")}</strong><div className="flow-wave" aria-hidden="true">{Array.from({length:18},(_,i)=><i key={i}/>)}</div></div> : denied ? <div className="mic-denied" role="alert"><strong>Нет доступа к микрофону</strong><span>Разрешите доступ в настройках браузера</span><button onClick={() => setDenied(false)}>Повторить</button></div> : <div className="new-mic"><button aria-label="Нажмите и расскажите мысль" onClick={() => { if (micDenied) { setDenied(true); return; } setSeconds(0); setRecording(true); }}><Mic /></button><span>Нажмите и расскажите мысль</span></div>}
        {offline && <OfflineBanner />}
        <textarea rows={3} value={text} onChange={event => setText(event.target.value)} placeholder="Или напишите мысль" aria-label="Или напишите мысль" />
        <button className="video-upload" aria-label="Загрузить видео" title="Загрузить видео"><Video /><span>Видео</span></button>
      </div>
      <footer><button className="flow-ghost" onClick={onClose}>Отмена</button><button className="flow-primary" disabled={!text.trim() && seconds === 0} aria-disabled={!text.trim() && seconds === 0} onClick={onCreate}>Создать мысль</button></footer>
    </section>
  </div>;
}

export function TakeRecorder({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<RecordingPhase>("ready");
  const [seconds, setSeconds] = useState(0);
  const [camera, setCamera] = useState(true);
  const [microphone, setMicrophone] = useState(true);
  const [scroll, setScroll] = useState(true);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const micDenied = useQueryFlag("mic", "denied");
  const offline = useQueryFlag("offline");
  const cancelPanel = useRef<HTMLElement>(null);
  useModalKeys(confirmCancel, () => setConfirmCancel(false), cancelPanel);
  const [transcript, setTranscript] = useState("Три недели назад я начал бегать по утрам. На третий день мне стало лень, но я всё равно вышел, потому что так уже делал вчера.");
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(() => setSeconds(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);
  const stop = () => { setPhase("processing"); window.setTimeout(() => setPhase("review"), 1800); };
  return <main className="take-recorder">
    <header className="take-header"><button onClick={onClose}><ArrowLeft /> К пути</button><h1>Запись дубля 5</h1></header>
    {offline && <OfflineBanner />}
    <div className="take-layout">
      <section className="teleprompter"><button className="hide-script">Скрыть</button><p>Три недели назад я начал бегать по утрам. На третий день мне стало лень, но я всё равно вышел, потому что так уже делал вчера. Привычка держится не на желании, а на простом первом шаге: надеть кроссовки.</p></section>
      <aside className="take-controls">
        <div className={`camera-preview ${camera ? "" : "off"}`}><Camera /><span>{camera ? "Камера" : "Камера выключена"}</span></div>
        <div className="device-toggles"><button className={camera ? "active" : ""} aria-label="Камера" aria-pressed={camera} onClick={() => setCamera(!camera)}><Camera /></button><button className={microphone ? "active" : ""} aria-label="Микрофон" aria-pressed={microphone} onClick={() => setMicrophone(!microphone)}><Mic /></button></div>
        {phase === "ready" && <button className="start-take" onClick={() => { if (micDenied) { setPhase("denied"); return; } setSeconds(0); setPhase("recording"); }}><span />Начать запись</button>}
        {phase === "denied" && <div className="take-denied" role="alert"><strong>Нет доступа к микрофону</strong><p>Разрешите доступ в настройках браузера</p><button className="flow-primary" onClick={() => setPhase("ready")}>Повторить</button></div>}
        {phase === "recording" && <div className="active-take"><time>{String(Math.floor(seconds/60)).padStart(2,"0")}:{String(seconds%60).padStart(2,"0")}</time><div className="flow-wave">{Array.from({length:18},(_,i)=><i key={i}/>)}</div><label><input type="checkbox" checked={scroll} onChange={event=>setScroll(event.target.checked)}/>Прокрутка</label><button className="stop-take" onClick={stop}><span />Стоп</button><button className="cancel-take" onClick={() => setConfirmCancel(true)}>Отмена</button></div>}
        {phase === "processing" && <div className="take-processing" role="status"><strong>Расшифровываем…</strong><span><i /></span><p>Можно закрыть экран, расшифровка продолжится</p></div>}
        {phase === "review" && <div className="take-review"><label htmlFor="take-transcript">Расшифровка</label><textarea id="take-transcript" value={transcript} onChange={event=>setTranscript(event.target.value)} /><button className="flow-primary">Сохранить дубль</button><button className="flow-ghost" onClick={() => setPhase("ready")}>Записать заново</button></div>}
      </aside>
    </div>
    {confirmCancel && <div className="flow-backdrop" onMouseDown={event => { if(event.target===event.currentTarget)setConfirmCancel(false) }}><section ref={cancelPanel} className="cancel-sheet" role="alertdialog" aria-modal="true" aria-labelledby="cancel-title"><h2 id="cancel-title">Отменить запись?</h2><button onClick={() => setConfirmCancel(false)}>Продолжить</button><button className="danger" onClick={() => { setConfirmCancel(false); setPhase("ready"); }}>Отменить запись</button></section></div>}
  </main>;
}

function StateCard({ icon, title, text, children, danger = false }: { icon: React.ReactNode; title: string; text?: string; children?: React.ReactNode; danger?: boolean }) {
  return <article className={`state-card ${danger ? "danger" : ""}`}><div className="state-icon">{icon}</div><h2>{title}</h2>{text && <p>{text}</p>}<div className="state-actions">{children}</div></article>;
}

export function ScriptBuildingState({ onCancel }: { onCancel?: () => void }) {
  return <article className="state-card script-state" role="status" aria-live="polite"><div className="script-skeleton"><i/><i/><i/><i/></div><p>Vocal собирает сценарий…</p><button onClick={onCancel}>Отмена</button></article>;
}

export function QuotaState({ compact = false, onRenew, onClose }: { compact?: boolean; onRenew?: () => void; onClose?: () => void }) {
  return <section className={`quota-exhausted ${compact ? "compact" : ""}`}><Lock /><div><h2>Ресурс на этот период закончился</h2><p>Мысли остаются доступны: их можно читать, копировать и скачивать</p></div><div><button className="flow-primary" onClick={onRenew}>Продлить</button>{onClose && <button className="flow-ghost" onClick={onClose}>Закрыть</button>}</div></section>;
}

export function StatesGallery({ onClose }: { onClose: () => void }) {
  const [count, setCount] = useState(60);
  useEffect(() => { const timer=window.setInterval(()=>setCount(n=>Math.max(0,n-1)),1000); return()=>clearInterval(timer) },[]);
  return <main className="states-gallery"><header><div><span>Vocal UI</span><h1>States</h1></div><button onClick={onClose}><X />Закрыть</button></header><OfflineBanner /><section className="states-grid">
    <StateCard icon={<Mic/>} title="Нет доступа к микрофону" text="Разрешите доступ в настройках браузера"><button>Открыть инструкцию</button><button>Повторить</button></StateCard>
    <StateCard icon={<Mic/>} title="Не расслышали" text="Говорите чуть громче или ближе к микрофону"><button>Записать заново</button></StateCard>
    <StateCard icon={<span className="spinner"/>} title="Расшифровываем…" text="Можно закрыть экран, расшифровка продолжится"><button>Закрыть</button></StateCard>
    <StateCard danger icon={<FileWarning/>} title="Не получилось расшифровать"><button>Повторить</button><button>Отмена</button></StateCard>
    <StateCard icon={<RotateCcw/>} title="Слишком часто. Подождите минуту" text={`00:${String(count).padStart(2,"0")}`} />
    <ScriptBuildingState />
    <StateCard danger icon={<AlertTriangle/>} title="Не удалось собрать сценарий"><button>Повторить</button></StateCard>
    <QuotaState onClose={() => undefined} />
    <article className="state-card empty-state"><button className="empty-mic" aria-label="Записать первую мысль"><Mic/></button><h2>Запишите первую мысль</h2><p>Расскажите голосом или напишите текст.</p></article>
    <article className="state-card empty-state"><h2>Ничего не найдено</h2><button>Сбросить фильтры</button></article>
  </section></main>;
}
