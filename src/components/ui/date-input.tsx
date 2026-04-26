"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { DayPicker, type Matcher } from "react-day-picker";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import "react-day-picker/style.css";

interface DateInputProps {
  value?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
}

function parseISO(s?: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return undefined;
  return date;
}

function formatISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToDisplay(iso?: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

function formatTyping(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function displayToIso(display: string, min?: Date, max?: Date): string | null {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  if (min && d < min) return null;
  if (max && d > max) return null;
  return formatISO(d);
}

export function DateInput({
  value,
  onChange,
  onBlur,
  min,
  max,
  placeholder = "DD/MM/YYYY",
  className,
  id,
  name,
}: DateInputProps) {
  const [text, setText] = React.useState(() => isoToDisplay(value));
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [popoverPos, setPopoverPos] = React.useState<{ top: number; left: number } | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const minDate = React.useMemo(() => parseISO(min), [min]);
  const maxDate = React.useMemo(() => parseISO(max), [max]);
  const selected = parseISO(value);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: re-sync internal text state when the controlled value changes externally (e.g. RHF reset, parent setValue). Internal state is needed so the user can type intermediate strings like "01/0" that don't yet parse to ISO.
    setText(isoToDisplay(value));
  }, [value]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- gates portal until after hydration so SSR markup matches.
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
    return matchers;
  }, [minDate, maxDate]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatTyping(e.target.value);
    setText(formatted);
    const iso = displayToIso(formatted, minDate, maxDate);
    if (iso) {
      onChange(iso);
    } else if (formatted === "") {
      onChange("");
    }
  }

  function handleBlur() {
    const iso = displayToIso(text, minDate, maxDate);
    if (iso) {
      setText(isoToDisplay(iso));
      onChange(iso);
    } else if (text === "") {
      onChange("");
    }
    onBlur?.();
  }

  function handleSelect(date: Date | undefined) {
    if (!date) return;
    const iso = formatISO(date);
    setText(isoToDisplay(iso));
    onChange(iso);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        className="flex h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 pr-10 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Open calendar"
        className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
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
