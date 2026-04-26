"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { DayPicker, type Matcher } from "react-day-picker";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import "react-day-picker/style.css";

export interface DateRange {
  from: string;
  to: string;
}

interface DatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabledRanges?: DateRange[];
  placeholder?: string;
  className?: string;
  id?: string;
}

function parseISO(s?: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function formatISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplay(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${m}/${d.getFullYear()}`;
}

function isoToDisplay(iso?: string): string {
  const d = parseISO(iso);
  return d ? formatDisplay(d) : "";
}

// Strip non-digits and re-insert slashes so the user sees DD/MM/YYYY as
// they type. Caps at 8 digits → "DD/MM/YYYY" (10 chars). Backspace works
// naturally because we re-derive from the digit-only substring.
function formatTyped(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseTyped(text: string): Date | undefined {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const d = new Date(year, month - 1, day);
  // Reject overflow (e.g. 31/02/2024 → 02/03/2024)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return undefined;
  return d;
}

function isOutOfRange(
  d: Date,
  minDate?: Date,
  maxDate?: Date,
  disabledRanges: DateRange[] = [],
): boolean {
  if (minDate && d < minDate) return true;
  if (maxDate && d > maxDate) return true;
  for (const r of disabledRanges) {
    const from = parseISO(r.from);
    const to = parseISO(r.to);
    if (!from || !to) continue;
    const toInclusive = new Date(to);
    toInclusive.setDate(toInclusive.getDate() - 1);
    if (toInclusive < from) continue;
    if (d >= from && d <= toInclusive) return true;
  }
  return false;
}

export function DatePicker({ value, onChange, min, max, disabledRanges = [], placeholder = "DD/MM/YYYY", className, id }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [popoverPos, setPopoverPos] = React.useState<{ top: number; left: number } | null>(null);
  const [text, setText] = React.useState<string>(() => isoToDisplay(value));
  const [error, setError] = React.useState<string | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const selected = parseISO(value);
  const minDate = parseISO(min);
  const maxDate = parseISO(max);

  // Sync text when the parent's value changes from outside (calendar pick,
  // form reset). Skipped when the current text already represents the same
  // date, so we don't clobber the user mid-type.
  const [prevValue, setPrevValue] = React.useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    const fromText = parseTyped(text);
    const fromTextIso = fromText ? formatISO(fromText) : "";
    if (fromTextIso !== (value ?? "")) {
      setText(isoToDisplay(value));
      setError(null);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: gates portal rendering until after hydration so SSR markup matches.
  React.useEffect(() => setMounted(true), []);

  React.useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setPopoverPos({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 4, left: rect.left });
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open]);

  const disabled = React.useMemo(() => {
    const matchers: Matcher[] = [];
    if (minDate) matchers.push({ before: minDate });
    if (maxDate) matchers.push({ after: maxDate });
    for (const r of disabledRanges) {
      const from = parseISO(r.from);
      const to = parseISO(r.to);
      if (!from || !to) continue;
      const toInclusive = new Date(to);
      toInclusive.setDate(toInclusive.getDate() - 1);
      if (toInclusive < from) continue;
      matchers.push({ from, to: toInclusive });
    }
    return matchers;
  }, [min, max, disabledRanges]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(date: Date | undefined) {
    if (!date) return;
    setError(null);
    setText(formatDisplay(date));
    onChange(formatISO(date));
    setOpen(false);
  }

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatTyped(e.target.value);
    setText(formatted);
    setError(null);

    if (formatted === "") {
      if (value) onChange("");
      return;
    }

    const parsed = parseTyped(formatted);
    if (!parsed) return; // partial input — wait for more keystrokes
    if (isOutOfRange(parsed, minDate, maxDate, disabledRanges)) {
      // Don't promote out-of-range values; surface error after blur.
      return;
    }
    onChange(formatISO(parsed));
  }

  function handleBlur() {
    if (text === "") {
      setError(null);
      return;
    }
    const parsed = parseTyped(text);
    if (!parsed) {
      setError("Use DD/MM/YYYY");
      return;
    }
    if (isOutOfRange(parsed, minDate, maxDate, disabledRanges)) {
      setError("Date is out of range");
      return;
    }
    setError(null);
  }

  return (
    <div className={cn("relative", className)}>
      <div
        ref={wrapperRef}
        className="flex h-11 w-full min-w-0 items-center rounded-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent overflow-hidden"
      >
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={handleTextChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          className="flex-1 min-w-0 h-full px-3 py-2 text-base bg-transparent placeholder:text-gray-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-label="Open calendar"
          className="h-full px-3 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0"
        >
          <Calendar className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      {mounted && open && popoverPos && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: popoverPos.top, left: popoverPos.left, zIndex: 1000 }}
          className="rounded-lg border border-gray-200 bg-white shadow-lg p-2"
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            disabled={disabled}
            defaultMonth={selected ?? minDate}
            startMonth={minDate}
            endMonth={maxDate}
            weekStartsOn={1}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
