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

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTyped(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${m}/${d.getFullYear()}`;
}

// Expand a 2-digit year to 4 digits using a sliding window: anything within
// the next 5 years counts as 20XX, otherwise 19XX. Same heuristic browsers
// use for native date inputs.
function expandYear(yy: number): number {
  if (yy >= 100) return yy;
  const currentYY = new Date().getFullYear() % 100;
  return yy <= currentYY + 5 ? 2000 + yy : 1900 + yy;
}

function makeDate(y: number, m: number, d: number): Date | undefined {
  if (!y || !m || !d) return undefined;
  if (m < 1 || m > 12) return undefined;
  if (d < 1 || d > 31) return undefined;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return undefined;
  return date;
}

// Accepts: "01051979", "010579", "01/05/1979", "1-5-79", "01.05.1979",
// "01 05 1979". Always day-month-year (UK ordering).
function parseTyped(input: string): Date | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    if (trimmed.length === 8) {
      return makeDate(
        parseInt(trimmed.slice(4, 8), 10),
        parseInt(trimmed.slice(2, 4), 10),
        parseInt(trimmed.slice(0, 2), 10),
      );
    }
    if (trimmed.length === 6) {
      return makeDate(
        expandYear(parseInt(trimmed.slice(4, 6), 10)),
        parseInt(trimmed.slice(2, 4), 10),
        parseInt(trimmed.slice(0, 2), 10),
      );
    }
    return undefined;
  }

  const match = trimmed.match(/^(\d{1,2})[/\-.\s]+(\d{1,2})[/\-.\s]+(\d{2}|\d{4})$/);
  if (match) {
    return makeDate(expandYear(parseInt(match[3], 10)), parseInt(match[2], 10), parseInt(match[1], 10));
  }
  return undefined;
}

export function DatePicker({ value, onChange, min, max, disabledRanges = [], placeholder = "DD/MM/YYYY", className, id }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState("");
  const [popoverPos, setPopoverPos] = React.useState<{ top: number; left: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const selected = parseISO(value);
  const minDate = parseISO(min);
  const maxDate = parseISO(max);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: gates portal rendering until after hydration so SSR markup matches.
  React.useEffect(() => setMounted(true), []);

  // Show the editable raw text only while focused; when blurred, fall back
  // to the formatted display derived from `value`. This keeps re-syncing
  // out of an effect (avoids the cascading-render lint), and a bad commit
  // silently reverts because `selected` doesn't change.
  const displayText = editing ? text : (selected ? formatDisplay(selected) : "");

  React.useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPopoverPos({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
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

  const isAllowed = React.useCallback((date: Date): boolean => {
    if (minDate && date < minDate) return false;
    if (maxDate && date > maxDate) return false;
    for (const r of disabledRanges) {
      const from = parseISO(r.from);
      const to = parseISO(r.to);
      if (from && to && date >= from && date < to) return false;
    }
    return true;
  }, [min, max, disabledRanges]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(date: Date | undefined) {
    if (!date) return;
    onChange(formatISO(date));
    setOpen(false);
  }

  function commitText() {
    const trimmed = text.trim();
    if (trimmed === "") return;
    if (selected && trimmed === formatTyped(selected)) return;
    const parsed = parseTyped(trimmed);
    if (parsed && isAllowed(parsed)) {
      onChange(formatISO(parsed));
    }
  }

  function handleFocus() {
    setEditing(true);
    setText(selected ? formatTyped(selected) : "");
    inputRef.current?.select();
  }

  function handleBlur() {
    commitText();
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitText();
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setText(selected ? formatTyped(selected) : "");
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={displayText}
        placeholder={placeholder}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white pl-3 pr-10 py-2 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
      />
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Open calendar"
        tabIndex={-1}
        className="absolute right-0 top-0 h-11 w-10 flex items-center justify-center text-gray-400 hover:text-gray-600"
      >
        <Calendar className="h-4 w-4" />
      </button>
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
