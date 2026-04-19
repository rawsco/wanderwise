"use client";

import { useState, useCallback } from "react";
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

  const handleSegmentsLoaded = useCallback((segs: Segment[]) => {
    setSegments(segs);
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="lg:flex-1 h-[400px] lg:h-[600px] rounded-xl overflow-hidden border border-gray-200">
        <TripMap stops={stops} />
      </div>

      <div className="lg:w-80 xl:w-96 flex flex-col gap-4">
        <StopSearch tripId={tripId} onStopAdded={handleStopAdded} />
        <DriveSegments stops={stops} onSegmentsLoaded={handleSegmentsLoaded} />
        <StopList initialStops={stops} driveSegments={segments} />
      </div>
    </div>
  );
}
