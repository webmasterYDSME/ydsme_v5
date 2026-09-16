"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type DatePickerProps = {
  name: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string, input: HTMLInputElement) => void;
  onInput?: (value: string, input: HTMLInputElement) => void;
  max?: string;
  min?: string;
  required?: boolean;
  autoComplete?: string;
  id?: string;
  className?: string;
  submissionFormat?: "display" | "iso";
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
};

const isoDate = /^\d{4}-(\d{2})-(\d{2})$/;
const displayedDate = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

function isRealDate(value: string) {
  const match = value.match(isoDate);
  if (!match) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normaliseDate(value: string) {
  const trimmed = value.trim();
  if (isRealDate(trimmed)) return trimmed;
  const match = trimmed.match(displayedDate);
  if (!match) return "";
  const [, day, month, year] = match;
  const normalised = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isRealDate(normalised) ? normalised : "";
}

function monthStart(value: string) {
  const date = isRealDate(value) ? new Date(`${value}T12:00:00`) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function DatePicker({ name, value, defaultValue, onValueChange, onInput, max, min, required, autoComplete, id, className, submissionFormat = "iso", ariaInvalid, ariaDescribedBy }: DatePickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const panelId = `${inputId}-calendar`;
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const initialValue = value ?? defaultValue ?? "";
  const [draft, setDraft] = useState(() => isRealDate(initialValue) ? toDisplayDate(initialValue) : initialValue);
  const [submittedValue, setSubmittedValue] = useState(() => normaliseDate(initialValue));
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(initialValue));
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    setPortalHost(rootRef.current?.closest("dialog") ?? document.body);
  }, []);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const positionPanel = useCallback(() => {
    const trigger = rootRef.current?.getBoundingClientRect();
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const margin = 12;
    const gap = 8;
    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const left = Math.min(Math.max(margin, trigger.left), window.innerWidth - panelWidth - margin);
    const fitsBelow = trigger.bottom + gap + panelHeight <= window.innerHeight - margin;
    const fitsAbove = trigger.top - gap - panelHeight >= margin;
    const top = !fitsBelow && fitsAbove
      ? trigger.top - panelHeight - gap
      : Math.min(trigger.bottom + gap, window.innerHeight - panelHeight - margin);
    setPanelPosition({ left, top: Math.max(margin, top) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    positionPanel();
    window.addEventListener("resize", positionPanel);
    document.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      document.removeEventListener("scroll", positionPanel, true);
    };
  }, [open, positionPanel]);

  function updateInput(input: HTMLInputElement, nextDraft = input.value) {
    setDraft(nextDraft);
    const nextValue = normaliseDate(nextDraft);
    const outsideBounds = nextValue && ((min && nextValue < min) || (max && nextValue > max));
    input.setCustomValidity(nextDraft && !nextValue ? "Enter a valid date as DD/MM/YYYY or YYYY-MM-DD." : outsideBounds ? "Choose a date within the allowed range." : "");
    setSubmittedValue(nextValue);
    onInput?.(nextValue, input);
    onValueChange?.(nextValue, input);
  }

  function chooseDate(nextValue: string) {
    const input = document.getElementById(inputId);
    if (!(input instanceof HTMLInputElement)) return;
    input.setCustomValidity("");
    setDraft(toDisplayDate(nextValue));
    setSubmittedValue(nextValue);
    onInput?.(nextValue, input);
    onValueChange?.(nextValue, input);
    setOpen(false);
    input.focus();
  }

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const calendarDays = Array.from({ length: firstDay + daysInMonth }, (_, index) => index < firstDay ? null : new Date(month.getFullYear(), month.getMonth(), index - firstDay + 1));
  const monthNames = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date(2020, index, 1)));
  const latestYear = max ? Number(max.slice(0, 4)) : new Date().getFullYear() + 20;
  const earliestYear = min ? Number(min.slice(0, 4)) : latestYear - 120;
  const years = Array.from({ length: latestYear - earliestYear + 1 }, (_, index) => latestYear - index);

  function setCalendarYear(nextYear: number) {
    setMonth((current) => new Date(nextYear, current.getMonth(), 1));
  }

  return <div ref={rootRef} className={className ? `date-picker ${className}` : "date-picker"}>
    <div className="date-picker-input-wrap">
      <input
        id={inputId}
        name={submissionFormat === "display" ? name : undefined}
        data-date-picker-name={name}
        type="text"
        inputMode="numeric"
        autoComplete={autoComplete}
        placeholder="DD/MM/YYYY"
        value={draft}
        required={required}
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onInput={(event) => updateInput(event.currentTarget)}
        onChange={(event) => updateInput(event.currentTarget)}
        onFocus={() => setOpen(false)}
      />
      {submissionFormat === "iso" ? <input type="hidden" name={name} value={submittedValue}/> : null}
      <button type="button" className="date-picker-toggle" onClick={() => setOpen((current) => !current)} aria-label="Choose a date from the calendar" aria-expanded={open} aria-controls={panelId}>
        <CalendarDays aria-hidden="true"/>
      </button>
    </div>
    {open && portalHost ? createPortal(<div ref={panelRef} id={panelId} className="date-picker-panel" role="dialog" aria-label="Choose a date" style={panelPosition ? { left: panelPosition.left, top: panelPosition.top } : { visibility: "hidden" }}>
      <div className="date-picker-heading">
        <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft/></button>
        <div className="date-picker-period">
          <strong>{monthNames[month.getMonth()]}</strong>
          <label><span className="sr-only">Year</span><select aria-label="Year" value={month.getFullYear()} onChange={(event) => setCalendarYear(Number(event.target.value))}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        </div>
        <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} aria-label="Next month"><ChevronRight/></button>
      </div>
      <div className="date-picker-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="date-picker-days">
        {calendarDays.map((date, index) => date ? (() => {
          const dateValue = toIsoDate(date);
          const disabled = Boolean((min && dateValue < min) || (max && dateValue > max));
          const selected = normaliseDate(draft) === dateValue;
          return <button key={dateValue} type="button" disabled={disabled} className={selected ? "is-selected" : undefined} aria-current={selected ? "date" : undefined} aria-label={new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date)} onClick={() => chooseDate(dateValue)}>{date.getDate()}</button>;
        })() : <span key={`blank-${index}`}/>)}
      </div>
    </div>, portalHost) : null}
  </div>;
}
