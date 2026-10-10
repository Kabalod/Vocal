"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Video, MessageCircle, Pencil, ChevronsUpDown, Play, Pause, X,
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  FileText,
  HelpCircle,
  Lightbulb,
  Mic,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  StopCircle,
  Trash2,
  UserRound,
} from "lucide-react";

import ThoughtLibrary from "./thought-library";
import { ThoughtBubble } from './thought-bubble';
import './focused-thought.css';
import './macos-thought.css';
import './apple-polish.css';

type Tab = "Дубли" | "Диалог" | "Сценарий";
type RecordingState =
  "idle" | "recording" | "transcribing" | "review" | "error";
const thoughts = [
  {
    title: "Привычка и мотивация",
    preview: "На третий день мне стало лень, но я всё равно вышел…",
    status: "Не завершена",
    versions: 2,
    time: "10:42",
    group: "Сегодня",
  },
  {
    title: "Переезд в другой город",
    preview: "Первый месяц оказался совсем не таким, как я ожидал.",
    status: "Не завершена",
    versions: 1,
    time: "Вчера",
    group: "Вчера",
  },
  {
    title: "Как не выгорать",
    preview: "Я понял, что отдых — это тоже часть работы.",
    status: "Завершена",
    versions: 3,
    time: "Пн",
    group: "Раньше",
  },
  {
    title: "Ритм без мотивации",
    preview: "Маленькие шаги складываются в привычку.",
    status: "Завершена",
    versions: 1,
    time: "12 ноя",
    group: "Раньше",
  },
];
const messages = [
  { role: "vocal", text: "Почему привычка остаётся, когда мотивация исчезла?" },
  {
    role: "author",
    text: "На третий день мне стало лень, но я всё равно вышел, потому что так уже делал вчера.",
  },
  {
    role: "vocal",
    note: "Чем подробнее вы рассказываете, тем лучше получится сценарий для рилс.",
    text: "Что вы почувствовали, когда всё-таки вышли на пробежку?",
  },
  { role: "author", text: "Стало легче дышать. Дальше пошло само." },
];

function Rail({
  onThoughts,
  onNew,
}: {
  onThoughts: () => void;
  onNew: () => void;
}) {
  return (
    <aside className="icon-rail">
      <div className="rail-logo">V</div>
      <button
        className="rail-button rail-active"
        aria-label="Мысли"
        onClick={onThoughts}
      >
        <Archive />
      </button>
      <button className="rail-button" aria-label="Поиск" onClick={onThoughts}>
        <Search />
      </button>
      <button className="rail-button" aria-label="Новая мысль" onClick={onNew}>
        <Plus />
      </button>
      <div className="rail-spacer" />
      <button className="rail-button" aria-label="Профиль">
        <UserRound />
      </button>
    </aside>
  );
}
function ThoughtList({ onSelect }: { onSelect: (title: string) => void }) {
  return (
    <section className="thought-pane">
      <div className="thoughts-heading">
        <div>
          <span className="eyebrow">Vocal</span>
          <h2>
            Мысли <small>24</small>
          </h2>
        </div>
        <button className="icon-button" aria-label="Настройки">
          <Settings />
        </button>
      </div>
      <div className="thought-search">
        <Search />
        <input placeholder="Поиск мыслей" aria-label="Поиск мыслей" />
      </div>
      <div className="thought-filters">
        <button className="filter-active">Все</button>
        <button>Не завершены</button>
        <button>Завершены</button>
      </div>
      <div className="thought-groups">
        {["Сегодня", "Вчера", "Раньше"].map((group) => (
          <div className="thought-group" key={group}>
            <div className="group-label">{group}</div>
            {thoughts
              .filter((item) => item.group === group)
              .map((item) => (
                <button
                  className="thought-row"
                  key={item.title}
                  onClick={() => onSelect(item.title)}
                >
                  <span className="thought-icon">
                    <FileText />
                  </span>
                  <span className="thought-copy">
                    <strong>{item.title}</strong>
                    <small>{item.preview}</small>
                    <em>
                      {item.status} · {item.versions}{" "}
                      {item.versions === 1 ? "версия" : "версии"}
                    </em>
                  </span>
                  <time>{item.time}</time>
                  <MoreHorizontal className="row-more" />
                </button>
              ))}
          </div>
        ))}
      </div>
      <button className="load-more" type="button">
        Показать ещё
      </button>
    </section>
  );
}
function ThoughtShell({
  children,
  onThoughts,
  onNew,
  onSelect,
}: {
  children: React.ReactNode;
  onThoughts: () => void;
  onNew: () => void;
  onSelect: (title: string) => void;
}) {
  return (
    <div className="vocal-shell">
      <main className="app-main focused-thought">{children}</main>
    </div>
  );
}
function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () =>
      thoughts
        .filter((item) =>
          `${item.title} ${item.preview}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 5),
    [query],
  );
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <section
        className="command-palette"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Командная палитра"
      >
        <div className="palette-input">
          <Search />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по Vocal"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-results">
          {results.map((item, index) => (
            <button
              key={item.title}
              className={
                index === 0 ? "palette-result active" : "palette-result"
              }
            >
              <FileText />
              <span>
                <strong>{item.title}</strong>
                <small>{item.preview}</small>
              </span>
              <kbd>↵</kbd>
            </button>
          ))}
        </div>
        <div className="palette-footer">
          <span>↑↓ навигация</span>
          <span>↵ открыть</span>
        </div>
      </section>
    </div>
  );
}
function Header({
  title,
  tab,
  setTab,
  onThoughts,
  onOpenMenu,
}: {
  title: string;
  tab: Tab;
  setTab: (tab: Tab) => void;
  onThoughts: () => void;
  onOpenMenu: () => void;
}) {
  const [status, setStatus] = useState('Не завершена');
  const [statusMenu, setStatusMenu] = useState(false);
  useEffect(() => { const close = () => setStatusMenu(false); const key = (e: KeyboardEvent) => { if(e.key === 'Escape') close() }; window.addEventListener('click', close); window.addEventListener('keydown', key); return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', key) } }, []);
  const tabIcons = { Дубли: Video, Диалог: MessageCircle, Сценарий: FileText };
  return (
    <header className="workspace-header">
      <button className="back-link" onClick={onThoughts}>
        <ArrowLeft /> Все мысли
      </button>
      <div className="title-row">
        <div>
          <span className="eyebrow">Сегодня, 10:42</span>
          <h1>{title}</h1>
        </div>
        <div className="status-anchor"><button className="status" aria-expanded={statusMenu} aria-haspopup="menu" onClick={e=>{e.stopPropagation();setStatusMenu(!statusMenu)}}><i className={status === 'Итоговая' ? 'green' : ''}/>{status}<ChevronsUpDown/></button>{statusMenu&&<div className="apple-menu" role="menu">{['Не завершена','Итоговая'].map(value=><button key={value} role="menuitem" onClick={()=>{setStatus(value);setStatusMenu(false)}}>{value}</button>)}</div>}</div>
        <button
          className="more-button"
          aria-label="Меню мысли"
          onClick={onOpenMenu}
        >
          <MoreHorizontal />
        </button>
      </div>
      <nav className="tabs" aria-label="Раздел мысли">
        {(["Дубли", "Диалог", "Сценарий"] as Tab[]).map((item) => {
          const Icon = tabIcons[item];
          return (
            <button
              key={item}
              className={tab === item ? "tab tab-active" : "tab"}
              onClick={() => setTab(item)}
              aria-label={item}
              title={`${item} ⌘${['Дубли','Диалог','Сценарий'].indexOf(item)+1}`}
              aria-pressed={tab === item}
            >
              <Icon className={item === 'Дубли' ? 'mobile-drafts-icon' : undefined} />
              {item === 'Дубли' && <Copy className="desktop-drafts-icon" />}
              <span>{tab === item ? item : ""}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}
function Dialog() {
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState<RecordingState>("idle");
  const [transcript, setTranscript] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [sent, setSent] = useState<string[]>([]);
  useEffect(() => {
    if (recording !== 'recording') return;
    const timer = window.setInterval(() => setSeconds(n => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);
  useEffect(() => {
    if (recording !== 'transcribing') return;
    const timer = window.setTimeout(() => {
      if (seconds < 2) { setRecording('error'); return; }
      setTranscript('На третий день мне стало лень, но я всё равно вышел.');
      setRecording('review');
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [recording, seconds]);
  const start = () => { setSeconds(0); setTranscript(''); setRecording('recording'); };
  return (
    <section className="dialog-view">
      <div className="conversation">
        <time className="conversation-time">Сегодня, 10:42</time>
        {messages.map((message, index) => <ThoughtBubble key={index} {...message} grouped={messages[index+1]?.role===message.role || (index===messages.length-1 && sent.length>0)}/>)}
        {sent.map((text,index)=><ThoughtBubble key={`sent-${index}`} text={text} role="author" grouped={index<sent.length-1}/>)}
      </div>
      {recording === 'recording' && <div className="recording-status" role="status"><Mic className="desktop-recording-mic" /><div className="recording-wave" aria-hidden="true">{Array.from({length: 15}, (_, i) => <i key={i} style={{animationDelay: `${i * 0.09}s`}} />)}</div><p>Идёт запись · {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</p><div><button className="button button-primary" onClick={() => setRecording('transcribing')}><StopCircle /> Стоп</button><button className="button button-outline" aria-label="Отмена" onClick={() => setRecording('idle')}><X /></button></div></div>}
      {recording === 'recording' && <p className="record-caption">Нажмите и говорите</p>}
      {recording === 'error' && <div className="recording-status" role="alert"><p>Не расслышали</p><button className="button button-outline" onClick={start}>Записать заново</button></div>}
      {recording === "transcribing" && (
        <div className="transcribing" role="status">
          Распознаём…
          <span />
          <span />
          <span />
        </div>
      )}
      {recording === "review" && (
        <div className="transcript-card">
          <label htmlFor="transcript">Проверьте текст</label>
          <textarea
            id="transcript"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
          />
          <div>
            <button
              className="button button-outline"
              onClick={start}
            >
              Записать заново
            </button>
            <button
              className="button button-primary"
              onClick={() => {
                if (!transcript.trim()) return;
                setSent(previous => [...previous, transcript.trim()]);
                setTranscript('');
                setRecording("idle");
              }}
            >
              Отправить
            </button>
          </div>
        </div>
      )}
      {recording === "idle" && (
        <div className="voice-composer">
          <div className="mic-area">
            <button
              className="mic-button"
              onClick={start}
              aria-label="Нажмите и говорите"
            ><Mic /></button>
            <span>Нажмите и говорите</span>
            <small>Демо записи · ответы моковые</small>
          </div>
          <form
            className="type-reply"
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.trim()) return;
              setSent(previous => [...previous, draft.trim()]);
              setDraft("");
            }}
          >

            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Или напишите ответ"
              aria-label="Или напишите ответ"
              onKeyDown={e=>{if(e.nativeEvent.isComposing || e.keyCode===229){if(e.key==='Enter')e.preventDefault();return} if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();e.currentTarget.form?.requestSubmit()}}}
            />
            {draft.trim() ? <button aria-label="Отправить" className="has-text"><ArrowRight /></button> : <button type="button" aria-label="Нажмите и говорите" className="has-text" onClick={start}><Mic /></button>}
            <span className="composer-shortcut">⌘↵</span>
          </form>
        </div>
      )}
    </section>
  );
}
function ScriptView() {
  return (
    <section className="script-layout">
      <div className="script-main">
        <details className="source-disclosure"><summary>Основа · ваш дубль №1</summary><article className="source-card">
          <p>
            Три недели назад я начал бегать по утрам. На третий день мне стало
            лень, но я всё равно вышел, потому что так уже делал вчера.
          </p>
        </article></details>
        <div className="vocal-prompt">
          <div>
            <div className="message-label">Vocal</div>
            <p>
              Я понял так: привычка держится на простом первом шаге, а не на
              желании. Собрать сценарий?
            </p>
          </div>
          <button className="button button-primary">
            <Sparkles />
            Сгенерировать сценарий
          </button>
        </div>
        <div className="version-heading">
          <h2>Версия 2 из 2</h2>
          <div className="version-control">
            <button className="icon-button" aria-label="Предыдущая версия">
              <ArrowLeft />
            </button>
            <button
              className="icon-button"
              aria-label="Следующая версия"
              disabled
            >
              <ArrowRight />
            </button>
          </div>
        </div>
        <article className="script-card">
          <p className="script-text">
            Три недели назад я начал бегать по утрам. На третий день мне стало
            лень, но я всё равно вышел, потому что так уже делал вчера. Привычка
            держится не на желании, а на простом первом шаге: надеть кроссовки.
          </p>
        </article>
      </div>
      <aside className="version-inspector">
        <div className="inspector-title">
          Версия <MoreHorizontal />
        </div>
        <div className="inspector-toggle">
          <button className="active">Изменения</button>
          <button>Основа</button>
        </div>
        <p>Вторая версия собрана из ваших слов и уточнений в диалоге.</p>
        <div className="inspector-item">
          <Check /> Убрал повтор и оставил ваши слова.
        </div>
        <div className="inspector-item">
          <Check /> Добавил фразу про первый шаг.
        </div>
        <div className="inspector-actions">
          <div className="inspector-tools"><button title="Править" aria-label="Править"><Pencil /></button><button title="Копировать" aria-label="Копировать" onClick={()=>navigator.clipboard.writeText(document.querySelector('.script-text')?.textContent || '').catch(()=>{})}><Copy /></button><button title="Скачать" aria-label="Скачать" onClick={()=>{const url=URL.createObjectURL(new Blob([document.querySelector('.script-text')?.textContent || ''],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='script.txt';a.click();URL.revokeObjectURL(url)}}><Download /></button></div>
          <button className="button button-primary">Сделать итоговой</button>
        </div>
      </aside>
    </section>
  );
}
function DraftsView() {
  const [takes,setTakes]=useState<number[]>([]), [selected,setSelected]=useState(0), [playing,setPlaying]=useState(false), [position,setPosition]=useState(0);
  useEffect(()=>{if(!playing)return;const timer=setInterval(()=>setPosition(n=>{if(n>=42){setPlaying(false);return 0}return n+1}),1000);return()=>clearInterval(timer)},[playing]);
  const add=()=>{setTakes(list=>[...list,list.length+1]);setSelected(takes.length+1);setPosition(0);setPlaying(false)};
  const wave=<svg viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true">{Array.from({length:60},(_,i)=><rect key={i} x={i*5} y={12-(3+(i*7%10))} width="2" height={2*(3+(i*7%10))} rx="1"/>)}</svg>;
  if(takes.length)return <section className="takes-list">{takes.map(id=><div key={id} className={`take-item ${selected===id?'selected':''}`}><div className="take-row"><button aria-label={playing&&selected===id?'Пауза':'Воспроизвести'} onClick={()=>{setSelected(id);setPlaying(selected===id?!playing:true)}}>{playing&&selected===id?<Pause/>:<Play/>}</button><button className="take-title" onClick={()=>setSelected(id)}>Дубль №{id}</button><span>Сегодня, 10:42 · 00:42</span></div>{wave}<p>Три недели назад я начал бегать по утрам. На третий день мне стало лень, но я всё равно вышел.</p>{selected===id&&<div className="take-player">{wave}<input aria-label="Позиция воспроизведения" type="range" min="0" max="42" value={position} onChange={e=>setPosition(Number(e.target.value))}/><div><time>00:{String(position).padStart(2,'0')}</time><time>00:42</time></div></div>}</div>)}<button className="button button-primary" onClick={add}><Mic/>Записать новый дубль</button></section>;
  return (
    <section className="drafts-view">
      <Copy />
      <h2>Дубли</h2>
      <p>Здесь появятся ваши голосовые дубли.</p>
      <button className="button button-primary" onClick={add}>
        <Mic /> Записать дубль
      </button>
    </section>
  );
}
export default function VocalApp() {
  const [tab, setTab] = useState<Tab>("Диалог");
  const [showThoughts, setShowThoughts] = useState(true);
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const [activeThought, setActiveThought] = useState("Привычка и мотивация");
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
      }
      if ((event.metaKey || event.ctrlKey) && ['1','2','3'].includes(event.key)) { event.preventDefault(); setTab((['Дубли','Диалог','Сценарий'] as Tab[])[Number(event.key)-1]); }
      if (event.key === "Escape") {
        setPalette(false);
        setMenu(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  if (showThoughts)
    return (
      <ThoughtLibrary
        onOpen={(title) => {
          setActiveThought(title || "Новая мысль");
          setShowThoughts(false);
          setPalette(false);
        }}
      />
    );
  return (
    <ThoughtShell
      onThoughts={() => setShowThoughts(true)}
      onNew={() => setShowThoughts(true)}
      onSelect={setActiveThought}
    >
      <Header
        title={activeThought}
        tab={tab}
        setTab={setTab}
        onThoughts={() => setShowThoughts(true)}
        onOpenMenu={() => setMenu(!menu)}
      />
      {menu && (
        <div className="thought-menu">
          <button>
            <Mic />
            Записать дубль
          </button>
          <button className="danger">
            <Trash2 />
            Удалить мысль
          </button>
        </div>
      )}
      {tab === "Диалог" && <Dialog />}
      {tab === "Сценарий" && <ScriptView />}
      {tab === "Дубли" && <DraftsView />}
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </ThoughtShell>
  );
}
function ThoughtsPage({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="vocal-shell">
      <Rail onThoughts={() => {}} onNew={onOpen} />
      <main className="thoughts-page">
        <header className="thoughts-page-header">
          <div>
            <span className="eyebrow">Ваше пространство</span>
            <h1>
              Мысли <small>24</small>
            </h1>
            <p>Голосовые заметки, из которых рождаются сценарии.</p>
          </div>
          <button className="button button-primary" onClick={onOpen}>
            <Plus />
            Новая мысль
          </button>
        </header>
        <div className="thoughts-toolbar">
          <div className="thought-search">
            <Search />
            <input
              placeholder="Поиск по названию и тексту"
              aria-label="Поиск по названию и тексту"
            />
          </div>
          <div className="thought-filters">
            <button className="filter-active">Все</button>
            <button>Не завершены</button>
            <button>Завершены</button>
          </div>
        </div>
        <div className="thoughts-full-list">
          {["Сегодня", "Вчера", "Раньше"].map((group) => (
            <section key={group}>
              <h2>{group}</h2>
              {thoughts
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    className="full-thought-row"
                    key={item.title}
                    onClick={onOpen}
                  >
                    <span className="thought-icon">
                      <FileText />
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.preview}</small>
                      <em>
                        {item.status} · {item.versions} версии
                      </em>
                    </span>
                    <time>{item.time}</time>
                    <MoreHorizontal />
                  </button>
                ))}
            </section>
          ))}
        </div>
        <button className="load-more">Показать ещё</button>
      </main>
    </div>
  );
}
export { Dialog, ScriptView, DraftsView };

// lucide-react icons use the shared 1.6px visual weight through CSS.
