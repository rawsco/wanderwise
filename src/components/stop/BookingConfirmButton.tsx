"use client";

import { useState } from "react";
import { Mail, Clock, CheckCircle2 } from "lucide-react";

type BookingStatus = "enquiry" | "pending" | "confirmed";

const options: { value: BookingStatus; label: string; icon: React.ReactNode; active: string; inactive: string }[] = [
  {
    value: "enquiry",
    label: "Enquiry",
    icon: <Mail className="h-4 w-4" />,
    active: "bg-gray-400 border-gray-500 text-white",
    inactive: "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500",
  },
  {
    value: "pending",
    label: "Pending",
    icon: <Clock className="h-4 w-4" />,
    active: "bg-blue-500 border-blue-600 text-white",
    inactive: "border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-600",
  },
  {
    value: "confirmed",
    label: "Confirmed",
    icon: <CheckCircle2 className="h-4 w-4" />,
    active: "bg-emerald-500 border-emerald-600 text-white",
    inactive: "border-gray-200 text-gray-400 hover:border-emerald-300 hover:text-emerald-700",
  },
];

interface Props {
  tripId: string;
  stopId: string;
  value: BookingStatus | undefined;
  onChange: (status: BookingStatus | undefined) => void;
}

export function BookingConfirmButton({ tripId, stopId, value, onChange }: Props) {
  const [saving, setSaving] = useState(false);

  async function select(next: BookingStatus) {
    const previous = value;
    onChange(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/stops/${stopId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingStatus: next }),
      });
      if (!res.ok) {
        onChange(previous);
      }
    } catch {
      onChange(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Booking status</p>
      <div className="grid grid-cols-3 gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => select(opt.value)}
            disabled={saving}
            className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 font-medium text-sm transition-colors ${
              value === opt.value ? opt.active : `bg-white ${opt.inactive}`
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
