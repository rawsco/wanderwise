"use client";

import { useRef, useEffect, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker, type DateRange } from "@/components/ui/date-picker";
import { Plus, Loader2, X } from "lucide-react";

interface StopSearchProps {
  tripId: string;
  onStopAdded: (stop: { stopId: string; tripId: string; name: string; address: string; lat: number; lng: number; order: number; arrivalDate?: string; departureDate?: string; checkInTime?: string; checkOutTime?: string }) => void;
  placeholder?: string;
  showDates?: boolean;
  defaultArrivalDate?: string;
  tripStartDate?: string;
  tripEndDate?: string;
  disabledRanges?: DateRange[];
}

interface PendingPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
}

function nightsBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function addNights(date: string, nights: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + nights);
  return d.toISOString().slice(0, 10);
}

export function StopSearch({ tripId, onStopAdded, placeholder = "Search for a place…", showDates = true, defaultArrivalDate, tripStartDate, tripEndDate, disabledRanges }: StopSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const defaultArrivalRef = useRef(defaultArrivalDate);
  const tripEndRef = useRef(tripEndDate);
  const placesLib = useMapsLibrary("places");
  const [pending, setPending] = useState<PendingPlace | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [nights, setNights] = useState<number | "">(1);
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [saving, setSaving] = useState(false);

  defaultArrivalRef.current = defaultArrivalDate;
  tripEndRef.current = tripEndDate;

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;

    const autocomplete = new placesLib.Autocomplete(inputRef.current, {
      fields: ["name", "formatted_address", "geometry", "place_id"],
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry?.location) return;

      setPending({
        name: place.name ?? "",
        address: place.formatted_address ?? "",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: place.place_id,
      });
      setInputValue("");

      const arrival = defaultArrivalRef.current ?? "";
      setArrivalDate(arrival);
      const end = tripEndRef.current;
      if (arrival && end) {
        const suggested = nightsBetween(arrival, end);
        setNights(suggested > 0 ? suggested : 1);
      } else {
        setNights(1);
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
      google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [placesLib]);

  function clearPending() {
    setPending(null);
    setArrivalDate("");
    setNights(1);
    setCheckInTime("");
    setCheckOutTime("");
    setInputValue("");
  }

  async function addStop() {
    if (!pending) return;
    setSaving(true);

    const departureDate =
      arrivalDate && nights !== "" && nights > 0
        ? addNights(arrivalDate, nights)
        : undefined;

    const res = await fetch(`/api/trips/${tripId}/stops`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...pending,
        arrivalDate: arrivalDate || undefined,
        departureDate,
        checkInTime: checkInTime || undefined,
        checkOutTime: checkOutTime || undefined,
      }),
    });
    if (res.ok) {
      const stop = await res.json();
      onStopAdded(stop);
      clearPending();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      {!pending && (
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          className="h-11 text-base"
          autoComplete="off"
        />
      )}

      {pending && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-3 overflow-hidden">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{pending.name}</p>
              <p className="text-xs text-gray-500 truncate">{pending.address}</p>
            </div>
            <button onClick={clearPending} className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>

          {showDates && (
            <div className="grid grid-cols-2 gap-2 overflow-hidden">
              <div className="space-y-1 min-w-0">
                <Label className="text-xs">Arrival date</Label>
                <DatePicker
                  value={arrivalDate}
                  onChange={setArrivalDate}
                  min={tripStartDate}
                  max={tripEndDate}
                  disabledRanges={disabledRanges}
                  placeholder="Select date"
                />
              </div>
              <div className="space-y-1 min-w-0">
                <Label className="text-xs">Nights</Label>
                <Input
                  type="number"
                  min={1}
                  value={nights}
                  onChange={e => setNights(e.target.value === "" ? "" : parseInt(e.target.value))}
                  placeholder="e.g. 2"
                  className="h-11 w-full min-w-0"
                />
              </div>
              <div className="space-y-1 min-w-0">
                <Label className="text-xs">Check-in</Label>
                <Input
                  type="time"
                  step={1800}
                  value={checkInTime}
                  onChange={e => setCheckInTime(e.target.value)}
                  className="h-11 w-full min-w-0"
                />
              </div>
              <div className="space-y-1 min-w-0">
                <Label className="text-xs">Check-out</Label>
                <Input
                  type="time"
                  step={1800}
                  value={checkOutTime}
                  onChange={e => setCheckOutTime(e.target.value)}
                  className="h-11 w-full min-w-0"
                />
              </div>
            </div>
          )}

          <Button onClick={addStop} disabled={saving} className="w-full h-11 text-sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Add stop
          </Button>
        </div>
      )}
    </div>
  );
}
