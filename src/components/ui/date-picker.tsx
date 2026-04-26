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
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function formatIncremental(digits: string): string {
  const d = digits.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function parseTyped(s: string): Date | undefined {
  const digits = s.replace(/\D/g, "");
  if (digits.length !== 8) return undefined;
  const dd = parseInt(digits.slice(0, 2), 10);
  const mm = parseInt(digits.slice(2, 4), 10);
  const yyyy = parseInt(digits.slice(4, 8), 10);
  if (mm < 1 || mm > 12) return undefined;
  if (dd < 1 || dd > 31) return undefined;
  const d = new Date(yyyy, mm - 1, dd);
  // Reject dates that rolled over (e.g. 31/02 → 03 March)
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return undefined;
  return d;
}

export function DatePicker({ value, onChange, min, max, disabledRanges = [], placeholder = "DD/MM/YYYY", className, id }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [popoverPos, setPopoverPos] = React.useState<{ top: number; left: number } | null>(null);
  const [text, setText] = React.useState(() => {
    const d = parseISO(value);
    return d ? formatDisplay(d) : "";
  });
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const selected = parseISO(value);
  const minDate = parseISO(min);
  const maxDate = parseISO(max);

  // Keep displayed text in sync with `value` when the input is not focused.
  // While focused, the user owns the text — overwriting mid-edit was the
  // entire bug we're fixing.
  React.useEffect(() => {
    if (typeof document !== "undefined" && document.activeElement === inputRef.current) return;
    setText(selected ? formatDisplay(selected) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

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

  const isDateDisabled = React.useCallback((d: Date): boolean => {
    const lo = parseISO(min);
    const hi = parseISO(max);
    if (lo && d < lo) return true;
    if (hi && d > hi) return true;
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
  }, [min, max, disabledRanges]);

  const dayPickerDisabled = React.useMemo(() => {
    const matchers: Matcher[] = [];
    const lo = parseISO(min);
    const hi = parseISO(max);
    if (lo) matchers.push({ before: lo });
    if (hi) matchers.push({ after: hi });
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
  }, [min, max, disabledRanges]);

  function handleSelect(date: Date | undefined) {
    if (!date) return;
    onChange(formatISO(date));
    setText(formatDisplay(date));
    setOpen(false);
  }

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    const formatted = formatIncremental(digits);
    setText(formatted);
    if (digits.length === 0) {
      if (value) onChange("");
      return;
    }
    if (digits.length === 8) {
      const d = parseTyped(formatted);
      if (d && !isDateDisabled(d)) {
        const iso = formatISO(d);
        if (iso !== value) onChange(iso);
      }
    }
  }

  function handleBlur() {
    if (selected) {
      setText(formatDisplay(selected));
    } else if (text && !parseTyped(text)) {
      setText("");
    }
  }

  const typedDigits = text.replace(/\D/g, "");
  const typedDate = parseTyped(text);
  const showInvalid =
    typedDigits.length === 8 && (!typedDate || isDateDisabled(typedDate));

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-11 w-full min-w-0 items-center rounded-lg border bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent",
          showInvalid ? "border-red-400" : "border-gray-300",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          onChange={handleTextChange}
          onBlur={handleBlur}
          className="flex-1 min-w-0 bg-transparent text-base text-gray-900 placeholder:text-gray-400 outline-none"
        />
        <button
          type="button"
          aria-label="Open calendar"
          onClick={() => setOpen(o => !o)}
          className="ml-2 shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none"
        >
          <Calendar className="h-4 w-4" />
        </button>
      </div>
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
            disabled={dayPickerDisabled}
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
