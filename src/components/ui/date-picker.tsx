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

// DD/MM/YYYY for the typing input — matches the UK display style used elsewhere.
function displayFromISO(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

// Strip everything but digits, cap at 8, then re-insert slashes after DD and MM
// so the user sees DD/MM/YYYY take shape as they type any digit-string
// (incl. "01051979" pasted in one go).
function formatTyping(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseTyped(raw: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Round-trip through Date to reject impossible calendar dates (Feb 30, etc.).
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return formatISO(d);
}

function isInRange(iso: string, min?: string, max?: string, disabledRanges: DateRange[] = []): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  for (const r of disabledRanges) {
    // Range is half-open [from, to) — same convention used by the day-picker matcher below.
    if (iso >= r.from && iso < r.to) return false;
  }
  return true;
}

export function DatePicker({ value, onChange, min, max, disabledRanges = [], placeholder = "DD/MM/YYYY", className, id }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [popoverPos, setPopoverPos] = React.useState<{ top: number; left: number } | null>(null);
  const [inputText, setInputText] = React.useState<string>(() => displayFromISO(value));
  const [focused, setFocused] = React.useState(false);
  const [invalid, setInvalid] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const selected = parseISO(value);
  const minDate = parseISO(min);
  const maxDate = parseISO(max);

  React.useEffect(() => {
    if (focused) return;
    // Mirror externally-driven value changes (calendar pick, form reset) into the
    // typing field, gated on !focused so we never clobber in-progress entry.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional, see comment above.
    setInputText(displayFromISO(value));
    setInvalid(false);
  }, [value, focused]);

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
    const iso = formatISO(date);
    onChange(iso);
    setInputText(displayFromISO(iso));
    setInvalid(false);
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatTyping(e.target.value);
    setInputText(formatted);
    if (invalid) setInvalid(false);
    const iso = parseTyped(formatted);
    if (iso && isInRange(iso, min, max, disabledRanges)) {
      if (iso !== value) onChange(iso);
    }
  }

  function handleInputBlur() {
    setFocused(false);
    const trimmed = inputText.trim();
    if (trimmed === "") {
      // Empty is allowed — clear committed value if there was one.
      if (value) onChange("");
      setInvalid(false);
      return;
    }
    const iso = parseTyped(trimmed);
    if (iso && isInRange(iso, min, max, disabledRanges)) {
      setInputText(displayFromISO(iso));
      setInvalid(false);
      if (iso !== value) onChange(iso);
    } else {
      // Snap back to last committed value so the field reflects truth, and
      // signal the bad input via the red border.
      setInputText(displayFromISO(value));
      setInvalid(true);
    }
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-11 w-full min-w-0 items-center rounded-lg border bg-white px-3 py-2 text-base focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent",
          invalid ? "border-red-400" : "border-gray-300",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={inputText}
          onChange={handleInputChange}
          onFocus={() => setFocused(true)}
          onBlur={handleInputBlur}
          className="flex-1 min-w-0 bg-transparent outline-none placeholder:text-gray-400"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-label="Open date picker"
          className="shrink-0 ml-2 text-gray-400 hover:text-gray-600 focus:outline-none focus:text-emerald-600"
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
