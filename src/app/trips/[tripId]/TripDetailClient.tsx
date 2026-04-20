"use client";

import { useState, useCallback, useMemo } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { TripMap } from "@/components/trip/TripMap";
import { StopList } from "@/components/stop/StopList";
import { StopSearch } from "@/components/stop/StopSearch";
import { DriveSegments } from "@/components/stop/DriveSegments";
import { Map, List } from "lucide-react";
import { sortStopsByDate } from "@/lib/stops";

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
  checkInTime?: string;
  checkOutTime?: string;
  bookingStatus?: "enquiry" | "pending" | "confirmed";
}

interface Segment {
  duration: string;
  distance: string;
}

interface Props {
  tripId: string;
  initialStops: Stop[];
  tripStartDate?: string;
  tripEndDate?: string;
}

export function TripDetailClient({ tripId, initialStops, tripStartDate, tripEndDate }: Props) {
  const [stops, setStops] = useState<Stop[]>(initialStops);
  const [segments, setSegments] = useState<Segment[]>([]);

  // Suggest arrival = last middle stop's departure (or trip start date)
  const suggestedArrivalDate = useMemo(() => {
    for (let i = stops.length - 2; i >= 0; i--) {
      if (stops[i].departureDate) return stops[i].departureDate;
    }
    return tripStartDate;
  }, [stops, tripStartDate]);

  const handleStopAdded = useCallback((stop: Stop) => {
    setStops(prev => {
      const appended = [...prev, { ...stop, order: prev.length }];
      if (prev.length >= 2) {
        const last = appended.length - 1;
        const mid = last - 1;
        [appended[last], appended[mid]] = [appended[mid], appended[last]];
        const updated = appended.map((s, i) => ({ ...s, order: i }));
        fetch(`/api/trips/${tripId}/stops/${updated[mid].stopId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: mid }),
        });
        fetch(`/api/trips/${tripId}/stops/${updated[last].stopId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: last }),
        });
        return sortStopsByDate(updated);
      }
      return appended;
    });
  }, [tripId]);

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
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: idx }),
        }),
        fetch(`/api/trips/${tripId}/stops/${updated[targetIdx].stopId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
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

  const handleUpdateDates = useCallback(async (
    stopId: string,
    arrivalDate: string,
    departureDate: string,
    checkInTime: string,
    checkOutTime: string,
  ) => {
    setStops(prev => sortStopsByDate(prev.map(s =>
      s.stopId === stopId ? {
        ...s,
        arrivalDate: arrivalDate || undefined,
        departureDate: departureDate || undefined,
        checkInTime: checkInTime || undefined,
        checkOutTime: checkOutTime || undefined,
      } : s
    )));
    await fetch(`/api/trips/${tripId}/stops/${stopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        arrivalDate: arrivalDate || undefined,
        departureDate: departureDate || undefined,
        checkInTime: checkInTime || undefined,
        checkOutTime: checkOutTime || undefined,
      }),
    });
  }, [tripId]);

  const handleUpdateBookingStatus = useCallback(async (stopId: string, status: "enquiry" | "pending" | "confirmed") => {
    setStops(prev => prev.map(s => s.stopId === stopId ? { ...s, bookingStatus: status } : s));
    await fetch(`/api/trips/${tripId}/stops/${stopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingStatus: status }),
    });
  }, [tripId]);

  const handleSegmentsLoaded = useCallback((segs: Segment[]) => {
    setSegments(segs);
  }, []);

  const [mobileTab, setMobileTab] = useState<"route" | "map">("route");

  // Labels and date visibility based on what's being added
  const isAddingStart = stops.length === 0;
  const isAddingEnd = stops.length === 1;
  const showDates = !isAddingStart && !isAddingEnd;

  const searchLabel = isAddingStart
    ? "Starting point"
    : isAddingEnd
    ? "End destination"
    : "Add a stop";

  const searchHint = isAddingStart
    ? "Where are you departing from?"
    : isAddingEnd
    ? "Where is the trip heading?"
    : undefined;

  const searchPlaceholder = isAddingStart
    ? "Search your start location…"
    : isAddingEnd
    ? "Search your destination…"
    : "Search for a place to stay…";

  const routePanel = (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{searchLabel}</p>
        {searchHint && <p className="text-xs text-gray-400 mb-2">{searchHint}</p>}
        <StopSearch
          key={searchLabel}
          tripId={tripId}
          onStopAdded={handleStopAdded}
          placeholder={searchPlaceholder}
          showDates={showDates}
          defaultArrivalDate={suggestedArrivalDate}
          tripEndDate={tripEndDate}
        />
      </div>

      <DriveSegments stops={stops} onSegmentsLoaded={handleSegmentsLoaded} />

      {stops.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Route · {stops.length} {stops.length === 1 ? "stop" : "stops"}
          </p>
          <StopList
            stops={stops}
            onMove={handleMove}
            onRemove={handleRemove}
            onUpdateDates={handleUpdateDates}
            tripStartDate={tripStartDate}
            tripEndDate={tripEndDate}
          />
        </div>
      )}
    </div>
  );

  const mapPanel = (
    <div className="h-[calc(100dvh-180px)] rounded-xl overflow-hidden border border-gray-200">
      <TripMap stops={stops} />
    </div>
  );

  return (
    <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!} libraries={["places"]}>
      {/* Mobile tab bar */}
      <div className="lg:hidden flex rounded-xl border border-gray-200 overflow-hidden mb-4 bg-white">
        <button
          type="button"
          onClick={() => setMobileTab("route")}
          className="flex-1 flex items-center justify-center gap-2 min-h-11 py-3 text-sm font-medium transition-colors"
          style={{
            backgroundColor: mobileTab === "route" ? "#059669" : "transparent",
            color: mobileTab === "route" ? "#ffffff" : "#6b7280",
          }}
        >
          <List className="h-4 w-4" />
          Route
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("map")}
          className="flex-1 flex items-center justify-center gap-2 min-h-11 py-3 text-sm font-medium transition-colors"
          style={{
            backgroundColor: mobileTab === "map" ? "#059669" : "transparent",
            color: mobileTab === "map" ? "#ffffff" : "#6b7280",
          }}
        >
          <Map className="h-4 w-4" />
          Map
        </button>
      </div>

      {/* Mobile: show active tab only */}
      <div className="lg:hidden">
        {mobileTab === "route" ? routePanel : mapPanel}
      </div>

      {/* Desktop: side by side */}
      <div className="hidden lg:flex flex-row gap-6">
        <div className="flex-1 h-[600px] rounded-xl overflow-hidden border border-gray-200">
          <TripMap stops={stops} />
        </div>
        <div className="w-80 xl:w-96">
          {routePanel}
        </div>
      </div>
    </APIProvider>
  );
}
