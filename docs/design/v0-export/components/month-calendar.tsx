"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import "./calendar.css";

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export type DatePreset = "today" | "yesterday" | "week";

export const isoDay = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export function dateFilterLabel(filter: string, rangeStart: string, monthValue: string) {
  if (filter === "today") return "Сегодня";
  if (filter === "yesterday") return "Вчера";
  if (filter === "week") return "Неделя";
  if (filter === "month" && monthValue) {
    const [y, m] = monthValue.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  if (filter === "range" && rangeStart) {
    const [, m, d] = rangeStart.split("-").map(Number);
    return `${d} ${MONTHS_GEN[m - 1]}`;
  }
  return "";
}

export function MonthCalendar({
  year,
  month,
  onMonthChange,
  marked,
  today,
  dateFilter,
  rangeStart,
  monthValue,
  onPreset,
  onDay,
  onWholeMonth,
  onReset,
}: {
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  marked: Set<string>;
  today: string;
  dateFilter: string;
  rangeStart: string;
  monthValue: string;
  onPreset: (preset: DatePreset) => void;
  onDay: (iso: string) => void;
  onWholeMonth: () => void;
  onReset: () => void;
}) {
  const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const thisMonth = isoDay(year, month, 1).slice(0, 7);
  const monthSelected = dateFilter === "month" && monthValue === thisMonth;
  const shift = (delta: number) => {
    const next = new Date(Date.UTC(year, month + delta, 1));
    onMonthChange(next.getUTCFullYear(), next.getUTCMonth());
  };
  const presets: [DatePreset, string][] = [["today", "Сегодня"], ["yesterday", "Вчера"], ["week", "Неделя"]];
  return (
    <div className="month-calendar">
      <div className="calendar-heading">
        <button type="button" aria-label="Предыдущий месяц" onClick={() => shift(-1)}><ChevronLeft /></button>
        <strong aria-live="polite">{MONTHS[month]} {year}</strong>
        <button type="button" aria-label="Следующий месяц" onClick={() => shift(1)}><ChevronRight /></button>
      </div>
      <div className="calendar-presets">
        {presets.map(([value, label]) => (
          <button type="button" key={value} aria-pressed={dateFilter === value} className={dateFilter === value ? "selected" : ""} onClick={() => onPreset(value)}>{label}</button>
        ))}
        <button type="button" aria-pressed={monthSelected} className={monthSelected ? "selected" : ""} onClick={onWholeMonth}>Весь месяц</button>
        {dateFilter !== "all" && <button type="button" className="calendar-reset" onClick={onReset}>Сбросить</button>}
      </div>
      <div className="calendar-week" aria-hidden="true">{WEEK.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="calendar-days">
        {Array.from({ length: offset }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const value = isoDay(year, month, day);
          const selected = dateFilter === "range" && rangeStart === value;
          const hasThought = marked.has(value);
          const classes = [value === today && "today", selected && "selected", monthSelected && "in-selection", hasThought && "has-thought"].filter(Boolean).join(" ");
          return (
            <button
              type="button"
              key={value}
              className={classes}
              aria-pressed={selected}
              aria-label={`${day} ${MONTHS_GEN[month]}${value === today ? ", сегодня" : ""}${hasThought ? ", есть мысли" : ""}`}
              onClick={() => onDay(value)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
