"use client";

import { useRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface StopSearchProps {
  tripId: string;
  onStopAdded: (stop: { stopId: string; tripId: string; name: string; address: string; lat: number; lng: number; order: number }) => void;
}

declare global {
  interface Window {
    google: typeof google;
  }
}

export function StopSearch({ tripId, onStopAdded }: StopSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [pending, setPending] = useState<{ name: string; address: string; lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!inputRef.current || !window.google) return;
    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ["name", "formatted_address", "geometry"],
    });
    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current!.getPlace();
      if (!place.geometry?.location) return;
      setPending({
        name: place.name ?? "",
        address: place.formatted_address ?? "",
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      });
    });
  }, []);

  async function addStop() {
    if (!pending) return;
    setSaving(true);
    const res = await fetch(`/api/trips/${tripId}/stops`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pending),
    });
    if (res.ok) {
      const stop = await res.json();
      onStopAdded(stop);
      setPending(null);
      if (inputRef.current) inputRef.current.value = "";
    }
    setSaving(false);
  }

  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Input
          ref={inputRef}
          placeholder="Search for a place to add as a stop…"
          className="w-full"
        />
        {pending && (
          <p className="text-xs text-emerald-600 mt-1 truncate">{pending.address}</p>
        )}
      </div>
      <Button onClick={addStop} disabled={!pending || saving} size="default" className="shrink-0">
        <Plus className="h-4 w-4 mr-1" />
        Add stop
      </Button>
    </div>
  );
}
