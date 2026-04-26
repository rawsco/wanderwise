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

interface DateInputProps {
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

function isoToDisplay(iso?: string): string {
  const d = parseISO(iso);
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${mon}/${d.getFullYear()}`;
}

// Insert "/" separators after the day (2 digits) and month (4 digits).
// "01051979" -> "01/05/1979", "0105" -> "01/05", "010" -> "01/0"
function formatDisplay(digits: string): string {
  const d = digits.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

// Parse "DD/MM/YYYY" (or any 8-digit string) into an ISO date string.
// Returns undefined if the value isn't a real calendar date.
function displayToISO(display: string): string | undefined {
  const digits = display.replace(/\D/g, "");
  if (digits.length !== 8) return undefined;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (!day || !month || !year) return undefined;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return undefined;
  return formatISO(d);
}

export function DateInput({
  value,
  onChange,
  min,
  max,
  disabledRanges = [],
  placeholder = "DD/MM/YYYY",
  className,
  id,
}: DateInputProps) {
  const [display, setDisplay] = React.useState(() => isoToDisplay(value));
  const [lastValue, setLastValue] = React.useState(value);
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [popoverPos, setPopoverPos] = React.useState<{ top: number; left: number } | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Sync local display when the parent's value changes externally (picker pick,
  // form reset, defaultValues hydration). Render-time setState is React's
  // documented pattern for deriving state from prop changes.
  if (value !== lastValue) {
    setLastValue(value);
    if (displayToISO(display) !== value) {
      setDisplay(isoToDisplay(value));
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

  const minDate = parseISO(min);
  const maxDate = parseISO(max);
  const selected = parseISO(value);

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

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    const next = formatDisplay(digits);
    setDisplay(next);
    if (digits.length === 0) {
      onChange("");
      return;
    }
    const iso = displayToISO(next);
    if (iso) onChange(iso);
  }

  function handlePickerSelect(date: Date | undefined) {
    if (!date) return;
    const iso = formatISO(date);
    setDisplay(isoToDisplay(iso));
    onChange(iso);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className={cn("relative min-w-0 overflow-hidden", className)}>
      <div className="flex h-11 w-full min-w-0 items-center rounded-lg border border-gray-300 bg-white pr-1 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          value={display}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="flex-1 min-w-0 w-full bg-transparent px-3 py-2 text-base placeholder:text-gray-400 focus:outline-none"
        />
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-label="Open calendar"
          className="h-9 w-9 shrink-0 flex items-center justify-center text-gray-400 hover:text-gray-600 focus:outline-none"
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
            onSelect={handlePickerSelect}
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
