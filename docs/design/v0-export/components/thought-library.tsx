"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Columns3,
  LayoutGrid,
  List,
  Mic,
  Search,
  UserRound,
  X,
  ArrowUpDown,
  Lock,
} from "lucide-react";
import "./thought-library.css";
import { OfflineBanner, QuotaState, useQueryFlag } from "./vocal-flows";
import { ResourceMeter, ResourceNotice, pluralThoughts, resourceLevel } from "./resource";
import { MonthCalendar, dateFilterLabel, type DatePreset } from "./month-calendar";

type Layout = "desk" | "grid" | "list";
const statuses = ["Не завершена", "В работе", "Завершена"];

/** Status marks from canon 09: empty circle, left-half filled, circle with a check. */
function StatusIcon({ status }: { status: number }) {
  return (
    <svg className={`status-icon status-icon-${status}`} viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      {status === 1 && <path d="M8 1.75a6.25 6.25 0 0 0 0 12.5z" fill="currentColor" />}
      {status === 2 && <path d="m5.3 8.2 1.9 1.9 3.6-3.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
const titles = [
  "Привычка и мотивация",
  "Искренний коннект с немногими",
  "Почему мы откладываем самое важное",
  "Первый месяц в новом городе",
  "Маленькие шаги, которые меняют всё",
  "Как разрешить себе ничего не делать",
  "Тишина — тоже ответ",
  "Что остаётся после путешествия",
];
const items = Array.from({ length: 1248 }, (_, id) => ({
  id,
  title:
    titles[id % titles.length] +
    (id >= 8 ? ` · ${Math.floor(id / 8) + 1}` : ""),
  text: [
    "История о пробежке и простом первом шаге.",
    "Разговор о людях, близости и внимании.",
    "Записать, пока мысль ещё живая.",
  ][id % 3],
  status: id % 3,
  date: id < 3 ? "Сегодня, 12:40" : id < 6 ? "Вчера" : "Вт, 6 окт",
}));

export default function ThoughtLibrary({
  onOpen,
  locked = false,
  resource = 72,
  onRenew,
}: {
  onOpen: (title?: string) => void;
  /** The period resource is spent: new thoughts are blocked, reading still works. */
  locked?: boolean;
  /** Remaining period resource, percent. */
  resource?: number;
  onRenew?: () => void;
}) {
  const [layout, setLayout] = useState<Layout>("desk");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(-1);
  const [sort, setSort] = useState<"new" | "old">("new");
  const [dateFilter, setDateFilter] = useState("all");
  const [dateOpen, setDateOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [monthValue, setMonthValue] = useState("");
  const [view, setView] = useState({ year: 2026, month: 9 });
  const dateOf = (id: number) => {
    const date = new Date("2026-10-09T12:00:00Z");
    date.setUTCDate(date.getUTCDate() - (Math.floor(id / 3) + Math.floor(id / 9)));
    return date.toISOString().slice(0, 10);
  };
  const [limit, setLimit] = useState(6);
  const [palette, setPalette] = useState(false);
  const [command, setCommand] = useState("");
  const [selected, setSelected] = useState(0);
  const [sortOpen, setSortOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const emptyLibrary = useQueryFlag("empty");
  const offline = useQueryFlag("offline");
  const source = emptyLibrary ? [] : items;
  const dialog = useRef<HTMLDialogElement>(null);
  const dateDialog = useRef<HTMLDialogElement>(null);
  const sortSheet = useRef<HTMLElement>(null);
  useEffect(() => { if (dateOpen) dateDialog.current?.showModal(); else dateDialog.current?.close() }, [dateOpen]);
  useEffect(() => {
    const panel = sortOpen ? sortSheet.current : null;
    if (!panel) return;
    const controls = Array.from(panel.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'));
    controls[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSortOpen(false); return; }
      if (event.key !== 'Tab' || controls.length === 0) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sortOpen]);
  const sentinel = useRef<HTMLDivElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const matches = source
    .filter((item) => {
      const date = dateOf(item.id);
      const dateMatches =
        dateFilter === "all" ||
        (dateFilter === "today" && date === "2026-10-09") ||
        (dateFilter === "yesterday" && date === "2026-10-08") ||
        (dateFilter === "week" && date >= "2026-10-03") ||
        (dateFilter === "month" && date.startsWith(monthValue)) ||
        (dateFilter === "range" &&
          (!rangeStart || date >= rangeStart) &&
          (!rangeEnd || date <= rangeEnd));
      return (
        (filter < 0 || item.status === filter) &&
        dateMatches &&
        `${item.title} ${item.text}`.toLowerCase().includes(query.toLowerCase())
      );
    })
    .sort((a, b) => (sort === "new" ? a.id - b.id : b.id - a.id));
  const results = source
    .filter((item) =>
      `${item.title} ${item.text}`
        .toLowerCase()
        .includes(command.toLowerCase()),
    )
    .slice(0, 8);
  useEffect(() => {
    const saved = localStorage.getItem("vocal-library-layout");
    if (saved === "desk" || saved === "grid" || saved === "list")
      setLayout(saved);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (palette) dialog.current?.showModal();
    else dialog.current?.close();
  }, [palette]);

  const marked = useMemo(() => new Set(source.map((item) => dateOf(item.id))), [emptyLibrary]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickPreset = (value: DatePreset) => { setDateFilter(value); setLimit(6); setDateOpen(false); };
  const pickDay = (value: string) => { setDateFilter("range"); setRangeStart(value); setRangeEnd(value); setLimit(6); setDateOpen(false); };
  const pickMonth = () => { setDateFilter("month"); setMonthValue(`${view.year}-${String(view.month + 1).padStart(2, "0")}`); setLimit(6); setDateOpen(false); };
  const resetDate = () => { setDateFilter("all"); setRangeStart(""); setRangeEnd(""); setMonthValue(""); setLimit(6); };
  const calendar = (inSheet: boolean) => (
    <MonthCalendar
      year={view.year}
      month={view.month}
      onMonthChange={(year, month) => setView({ year, month })}
      marked={marked}
      today="2026-10-09"
      dateFilter={dateFilter}
      rangeStart={rangeStart}
      monthValue={monthValue}
      onPreset={pickPreset}
      onDay={pickDay}
      onWholeMonth={pickMonth}
      onReset={() => { resetDate(); if (inSheet) setDateOpen(false); }}
    />
  );
  const activeDate = dateFilterLabel(dateFilter, rangeStart, monthValue);
  const openProfile = () => onOpen("Профиль");
  const changeLayout = (value: Layout) => {
    setLayout(value);
    localStorage.setItem("vocal-library-layout", value);
  };
  const badge = (status: number) => (
    <span className={`library-status status-${status}`}>
      <i role="img" aria-label={statuses[status]} />
      {statuses[status]}
    </span>
  );
  const photo = (id: number) => ({
    backgroundImage: "url(/images/thought-landscape.png)",
    backgroundPosition: `${20 + (id % 4) * 20}% center`,
  });
  const card = (item: (typeof items)[number]) => (
    <button
      className={`photo-card tilt-${item.id % 3}`}
      key={item.id}
      onClick={() => onOpen(item.title)}
      title={item.title}
    >
      <div className="photo-art" style={photo(item.id)}>
        <span className="photo-number">
          {String(item.id + 1).padStart(2, "0")}
        </span>
        <h2>{item.title}</h2>
      </div>
      <div className="photo-caption">
        <div>
          <time>{item.date}</time>
          {badge(item.status)}
        </div>
        <ArrowRight />
      </div>
    </button>
  );
  const row = (item: (typeof items)[number]) => (
    <button
      className="library-row"
      key={item.id}
      onClick={() => onOpen(item.title)}
      title={item.title}
    >
      <div
        className={`mini-photo tilt-${item.id % 3}`}
        style={photo(item.id)}
      />
      <div className="row-copy">
        <strong>{item.title}</strong>
        <span className="row-preview">{item.text}</span>
        <span className="mobile-row-meta"><span>● {statuses[item.status]} · версия {(item.id % 4) + 1}</span><time>{new Date(dateOf(item.id)).toLocaleDateString("ru-RU")}</time></span>
      </div>
      <div className="row-status">{badge(item.status)}</div>
      <span className="row-versions">версий: {(item.id % 4) + 1}</span>
      <time className="row-date">
        {new Date(dateOf(item.id)).toLocaleDateString("ru-RU")}
      </time>
      <ArrowRight />
    </button>
  );
  const filters = (
    <>
      {["Все", ...statuses].map((name, index) => (
        <button
          key={name}
          className={filter === index - 1 ? "selected" : ""}
          onClick={() => {
            setFilter(index - 1);
            setLimit(6);
          }}
        >
          <span>
            {index === 0 ? <LayoutGrid /> : <StatusIcon status={index - 1} />}
            {name === "Завершена" ? "Завершена" : name}
          </span>
          {index === 0 && <small>{source.length.toLocaleString("ru-RU")}</small>}
        </button>
      ))}
    </>
  );
  return (
    <div className="library-shell">
      <aside className="library-sidebar">
        <a className="library-logo" href="#">
          Vocal<span>ваши мысли, вашим голосом</span>
        </a>
        <div className="library-nav">
          <LayoutGrid /> Мысли
        </div>
        <p className="filter-label">СТАТУС</p>
        <div className="library-filters">{filters}</div>
        <p className="filter-label" id="sidebar-calendar-label">ДАТА</p>
        <section id="sidebar-calendar" className="sidebar-calendar" aria-labelledby="sidebar-calendar-label">
          {calendar(false)}
        </section>
        <ResourceMeter percent={resource} compact />
        <button className="library-profile" onClick={openProfile}>
          <UserRound /> Профиль
        </button>
      </aside>
      <main className="library-main">
        <header className="library-toolbar">
          <h1>Мысли</h1>
          <button
            className="mobile-date"
            onClick={() => setDateOpen(true)}
            aria-haspopup="dialog"
          >
            <CalendarDays /> Дата
          </button>
          <div className="library-search">
            <Search />
            <input
              aria-label="Найти мысль"
              placeholder="Найти мысль по названию или тексту"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(6);
              }}
            />
            <button
              ref={searchButton}
              onClick={() => setPalette(true)}
              aria-label="Открыть командную палитру"
              className="desktop-command-key"
            >
              ⌘K
            </button>
            <button className="mobile-sort-trigger" aria-label="Сортировка" onClick={() => setSortOpen(true)}><ArrowUpDown /></button>
          </div>
          <div className="library-sort" role="group" aria-label="Сортировка">
            {(["new", "old"] as const).map((value) => (
              <button
                key={value}
                aria-pressed={sort === value}
                className={sort === value ? "selected" : ""}
                onClick={() => {
                  setSort(value);
                  setLimit(6);
                }}
              >
                {value === "new" ? "Новые" : "Старые"}
              </button>
            ))}
          </div>
          <button className="library-new" disabled={locked} onClick={() => onOpen("Новая мысль")}>
            {locked ? <Lock /> : <Mic />} Новая мысль
          </button>
          <div className="library-layouts" aria-label="Раскладка">
            {(
              [
                { key: "desk", label: "Стол", Icon: LayoutGrid },
                { key: "grid", label: "Сетка", Icon: Columns3 },
                { key: "list", label: "Список", Icon: List },
              ] as const
            ).map(({ key, label, Icon }) => (
              <button
                key={key}
                title={label}
                aria-label={label}
                aria-pressed={layout === key}
                className={layout === key ? "selected" : ""}
                onClick={() => changeLayout(key)}
              >
                <Icon />
              </button>
            ))}
          </div>
          <div className="mobile-filters">{filters}</div>
        </header>
        <div className={`library-content layout-${layout}`}>
          {offline && <OfflineBanner />}
          {!bannerDismissed && resourceLevel(resource) === "out" && <QuotaState compact onRenew={onRenew} onClose={() => setBannerDismissed(true)} />}
          {!bannerDismissed && (resourceLevel(resource) === "low" || resourceLevel(resource) === "critical") && <ResourceNotice percent={resource} onRenew={onRenew} onClose={() => setBannerDismissed(true)} />}
          {activeDate && (
            <div className="active-filters" role="status">
              <span className="date-chip">
                {activeDate}
                <button type="button" aria-label="Сбросить фильтр по дате" onClick={resetDate}><X /></button>
              </span>
              <span>{matches.length.toLocaleString("ru-RU")} {pluralThoughts(matches.length)}</span>
            </div>
          )}
          <div className="library-context">
            <span>Ваша библиотека</span>
            <span>{matches.length.toLocaleString("ru-RU")} {pluralThoughts(matches.length)}</span>
          </div>
          {emptyLibrary ? (
            <article className="state-card empty-state library-first-run">
              <button className="empty-mic" aria-label="Записать первую мысль" disabled={locked} onClick={() => onOpen("Новая мысль")}><Mic /></button>
              <h2>Запишите первую мысль</h2>
              <p>Расскажите голосом или напишите текст.</p>
            </article>
          ) : (
          <>
          {layout === "desk" && (
            <h2 className="mobile-section-title">На столе сейчас</h2>
          )}
          {layout !== "list" && (
            <section className="library-cards" aria-label="Карточки мыслей">
              {matches.slice(0, limit).map(card)}
            </section>
          )}
          {layout === "desk" && (
            <h2 className="mobile-section-title all-title">Все мысли</h2>
          )}
          <section className="library-rows" aria-label="Список мыслей">
            {matches.slice(0, limit).map(row)}
          </section>
          </>
          )}
          {!emptyLibrary && matches.length === 0 && (
            <div className="library-empty">
              <Search />
              <h2>Ничего не найдено</h2>
              <button onClick={() => { setQuery(""); setFilter(-1); setDateFilter("all"); }}>Сбросить фильтры</button>
            </div>
          )}
          <div ref={sentinel} className="library-sentinel" />
          {!emptyLibrary && <div className="library-pagination">
            <button
              disabled={limit >= matches.length}
              onClick={() => setLimit((n) => n + 6)}
            >
              Показано {Math.min(limit, matches.length)} из{" "}
              {matches.length.toLocaleString("ru-RU")}
              {limit < matches.length
                ? ` · Ещё ${Math.min(6, matches.length - limit)}`
                : " · Все мысли загружены"}
            </button>
          </div>}
        </div>
      </main>
      <nav className="library-bottom" aria-label="Мобильная навигация">
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <LayoutGrid />
          Мысли
        </button>
          <button
            className="library-new-mic"
            aria-label={locked ? "Ресурс на период закончился" : "Новая мысль"}
            disabled={locked}
            onClick={() => onOpen("Новая мысль")}
          >
            {locked ? <Lock /> : <Mic />}
          </button>
        <button onClick={openProfile}>
          <UserRound />
          Профиль
        </button>
      </nav>
      <dialog
        ref={dialog}
        className="library-command"
        onCancel={() => setPalette(false)}
        onClose={() => {
          setPalette(false);
          searchButton.current?.focus();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) setPalette(false);
        }}
      >
        <div className="command-search">
          <Search />
          <input
            autoFocus
            aria-label="Поиск по Vocal"
            placeholder="Поиск по Vocal"
            value={command}
            onChange={(e) => {
              setCommand(e.target.value);
              setSelected(0);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((n) => Math.min(n + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((n) => Math.max(n - 1, 0));
              }
              if (e.key === "Enter" && results[selected]) {
                setPalette(false);
                onOpen(results[selected].title);
              }
            }}
          />
          <button aria-label="Закрыть поиск" onClick={() => setPalette(false)}>
            <X />
          </button>
        </div>
        <div className="command-matches">
          {results.map((item, index) => (
            <button
              className={selected === index ? "selected" : ""}
              key={item.id}
              onClick={() => {
                setPalette(false);
                onOpen(item.title);
              }}
            >
              <strong>{item.title}</strong>
              <small>{item.text}</small>
            </button>
          ))}
          {!results.length && <p>Ничего не найдено</p>}
        </div>
        <p className="command-help">↑↓ Выбрать · Enter Открыть · Esc Закрыть</p>
      </dialog>
      <dialog ref={dateDialog} className="library-command date-dialog" onCancel={() => setDateOpen(false)} onClose={() => setDateOpen(false)} onClick={e => { if (e.target === dateDialog.current) setDateOpen(false) }}>
        <header><h2>Дата</h2><button aria-label="Закрыть выбор даты" onClick={() => setDateOpen(false)}><X /></button></header>
        {calendar(true)}
      </dialog>
      {sortOpen && <div className="sheet-backdrop" onClick={() => setSortOpen(false)}><section ref={sortSheet} className="mobile-sheet sort-sheet" role="dialog" aria-modal="true" aria-label="Сортировка" onClick={e => e.stopPropagation()}><button className="sheet-grabber" aria-label="Закрыть" onClick={() => setSortOpen(false)} /><h2>Сортировка</h2>{(['new','old'] as const).map(value => <button className={sort === value ? 'selected' : ''} key={value} onClick={() => { setSort(value); setLimit(6); setSortOpen(false) }}>{value === 'new' ? 'Новые' : 'Старые'}</button>)}</section></div>}
    </div>
  );
}
