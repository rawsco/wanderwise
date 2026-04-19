"use client";

import { useRef, useEffect, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";

interface StopSearchProps {
  tripId: string;
  onStopAdded: (stop: { stopId: string; tripId: string; name: string; address: string; lat: number; lng: number; order: number }) => void;
  placeholder?: string;
}

interface PendingPlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export function StopSearch({ tripId, onStopAdded, placeholder = "Search for a place…" }: StopSearchProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const placesLib = useMapsLibrary("places");
  const [pending, setPending] = useState<PendingPlace | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!placesLib || !containerRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PlaceAutocompleteElement = (placesLib as any).PlaceAutocompleteElement;
    if (!PlaceAutocompleteElement) return;

    const container = containerRef.current;
    const el = new PlaceAutocompleteElement({ placeholder });
    el.style.width = "100%";
    container.appendChild(el);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    el.addEventListener("gmp-select", async (event: any) => {
      const place = event.placePrediction.toPlace();
      await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
      setPending({
        name: place.displayName ?? "",
        address: place.formattedAddress ?? "",
        lat: place.location.lat(),
        lng: place.location.lng(),
      });
    });

    return () => {
      if (container.contains(el)) {
        container.removeChild(el);
      }
    };
  }, [placesLib, placeholder]);

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
    }
    setSaving(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-start">
        <div ref={containerRef} className="flex-1 min-w-0 [&>*]:w-full [&>*]:h-10 [&>*]:rounded-lg [&>*]:border [&>*]:border-gray-300 [&>*]:text-sm" />
        <Button onClick={addStop} disabled={!pending || saving} className="shrink-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Add</>}
        </Button>
      </div>
      {pending && (
        <p className="text-xs text-emerald-600 truncate pl-1">{pending.address}</p>
      )}
    </div>
  );
}
