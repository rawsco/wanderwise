"use client";

import { useState, useCallback } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { TripMap } from "@/components/trip/TripMap";
import { StopList } from "@/components/stop/StopList";
import { StopSearch } from "@/components/stop/StopSearch";
import { DriveSegments } from "@/components/stop/DriveSegments";

interface Stop {
  stopId: string;
  tripId: string;
  order: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  arrivalDate?: string;
  departureDate?: string;
}

interface Segment {
  duration: string;
  distance: string;
}

export function TripDetailClient({ tripId, initialStops }: { tripId: string; initialStops: Stop[] }) {
  const [stops, setStops] = useState<Stop[]>(initialStops);
  const [segments, setSegments] = useState<Segment[]>([]);

  const handleStopAdded = useCallback((stop: Stop) => {
    setStops(prev => [...prev, stop]);
  }, []);

  const handleMove = useCallback(async (stopId: string, direction: "up" | "down") => {
    setStops(prev => {
      const idx = prev.findIndex(s => s.stopId === stopId);
      if (idx === -1) return prev;
      const next = [...prev];
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      const updated = next.map((s, i) => ({ ...s, order: i }));

      Promise.all([
        fetch(`/api/trips/${tripId}/stops/${updated[idx].stopId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: idx }),
        }),
        fetch(`/api/trips/${tripId}/stops/${updated[targetIdx].stopId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: targetIdx }),
        }),
      ]);

      return updated;
    });
  }, [tripId]);

  const handleRemove = useCallback(async (stopId: string) => {
    await fetch(`/api/trips/${tripId}/stops/${stopId}`, { method: "DELETE" });
    setStops(prev => prev.filter(s => s.stopId !== stopId).map((s, i) => ({ ...s, order: i })));
  }, [tripId]);

  const handleSegmentsLoaded = useCallback((segs: Segment[]) => {
    setSegments(segs);
  }, []);

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!} libraries={["places"]}>
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:flex-1 h-[400px] lg:h-[600px] rounded-xl overflow-hidden border border-gray-200">
          <TripMap stops={stops} />
        </div>

        <div className="lg:w-80 xl:w-96 flex flex-col gap-4">
          {stops.length === 0 ? (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Starting point</p>
              <p className="text-xs text-gray-400 mb-2">Where are you departing from?</p>
              <StopSearch key="start" tripId={tripId} onStopAdded={handleStopAdded} placeholder="Search your start location…" />
            </div>
          ) : (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Add a stop</p>
              <StopSearch key="add" tripId={tripId} onStopAdded={handleStopAdded} placeholder="Search for a place to add…" />
            </div>
          )}
          <DriveSegments stops={stops} onSegmentsLoaded={handleSegmentsLoaded} />
          {stops.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Route · {stops.length} {stops.length === 1 ? "stop" : "stops"}
              </p>
              <StopList stops={stops} onMove={handleMove} onRemove={handleRemove} />
            </div>
          )}
        </div>
      </div>
    </APIProvider>
  );
}
